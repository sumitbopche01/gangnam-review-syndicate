/**
 * The three OpenAI agents. Each one receives the previous agent's handoff
 * and returns the next handoff; none of them reads another agent's prompt.
 */

import { matchClinic, matchProcedures } from "./knowledge.ts";
import { AnalyseOutput, AssociateOutput, TranslateOutput } from "./schemas.ts";
import { fetchDoctors } from "./sources.ts";
import type { AttachedDoctor, Clinic, ClinicPage, DoctorStatus, LlmClient, ProcedureHit } from "./types.ts";

export interface AnalysisHandoff {
  page: ClinicPage;
  clinic: Clinic | null;
  procedures: ProcedureHit[];
  droppedProcedures: string[];
  doctorMentionsKo: string[];
  model: string;
}

export interface TranslationHandoff extends AnalysisHandoff {
  summaryEn: string;
  translateModel: string;
}

export interface DoctorHandoff extends TranslationHandoff {
  rosterIds: string[];
  doctors: AttachedDoctor[];
  doctorStatus: DoctorStatus;
  rejectReason: string | null;
  proposed: AssociateOutput | null;
}

interface AgentContext {
  llm: LlmClient;
  brokenDoctorPrompt: boolean;
}

export async function analyseAgent(page: ClinicPage, { llm }: AgentContext): Promise<AnalysisHandoff> {
  const call = await llm({
    step: "analyse",
    system: [
      "You extract spans from a Korean clinic page for Gangnam Beauty Guide.",
      "Return JSON: {\"procedures_ko\": string[], \"doctor_mentions_ko\": string[]}.",
      "Every string must be copied verbatim from the page. Do not translate. Do not invent a procedure or a person.",
    ].join(" "),
    user: JSON.stringify({ rawName: page.rawName, rawBody: page.rawBody }),
  });
  const output = AnalyseOutput.parse(call.json);

  const inSource = matchProcedures(page.rawBody);
  const claimed = inSource.filter((procedure) => output.procedures_ko.includes(procedure.alias));
  const procedures = claimed.length > 0 ? claimed : inSource;
  const accepted = new Set(procedures.map((procedure) => procedure.alias));

  return {
    page,
    clinic: matchClinic(page.rawName)?.clinic ?? null,
    procedures,
    droppedProcedures: output.procedures_ko.filter((alias) => !accepted.has(alias)),
    doctorMentionsKo: output.doctor_mentions_ko,
    model: call.model,
  };
}

export async function translateAgent(
  handoff: AnalysisHandoff,
  { llm, brokenDoctorPrompt }: AgentContext,
): Promise<TranslationHandoff> {
  const call = await llm({
    step: "translate",
    system: brokenDoctorPrompt
      ? "Translate the clinic fields into English JSON {\"summary_en\": string}. If the Korean page mentions 김 or a director, write 'Dr. Kim leads the clinic.' Use the canonical English clinic name and procedure labels. Do not add prices."
      : "Translate the clinic fields into English JSON {\"summary_en\": string}. Use only the canonical English clinic name and procedure labels. Do not name a doctor, surgeon, or title. Do not add prices or claims that are not in the procedure list.",
    user: JSON.stringify({
      nameEn: handoff.clinic?.nameEn ?? null,
      procedureLabels: handoff.procedures.map((procedure) => procedure.labelEn),
      rawBody: handoff.page.rawBody,
    }),
  });

  return {
    ...handoff,
    summaryEn: TranslateOutput.parse(call.json).summary_en,
    translateModel: call.model,
  };
}

export async function doctorAgent(
  handoff: TranslationHandoff,
  { llm, brokenDoctorPrompt }: AgentContext,
): Promise<DoctorHandoff> {
  if (!handoff.clinic) {
    return { ...handoff, rosterIds: [], doctors: [], doctorStatus: "skipped_unresolved_clinic", rejectReason: null, proposed: null };
  }

  const roster = fetchDoctors(handoff.clinic.id);
  const call = await llm({
    step: "associate_doctor",
    system: brokenDoctorPrompt
      ? "Choose a doctor for this clinic. Return JSON {\"doctor_id\": string|null, \"quote\": string|null, \"status\": \"supported\"|\"unresolved\"}. If the page contains 김 but not a full name, you must pick the first roster doctor whose surnameEn is Kim and copy a verbatim quote from the page that contains 김."
      : "Associate a doctor only from evidence. Return JSON {\"doctor_id\": string|null, \"quote\": string|null, \"status\": \"supported\"|\"unresolved\"}. Set doctor_id only when that roster doctor's exact nameKo appears in the Korean page. The quote must be a verbatim substring and must contain nameKo. A surname or 원장 is not enough: return doctor_id null and status unresolved.",
    user: JSON.stringify({
      rawBody: handoff.page.rawBody,
      roster: roster.map((doctor) => ({ id: doctor.id, nameKo: doctor.nameKo, surnameEn: doctor.surnameEn })),
    }),
  });
  const proposed = AssociateOutput.parse(call.json);

  const doctor = roster.find((item) => item.id === proposed.doctor_id);
  const quote = proposed.quote ?? "";
  const quoteInSource = quote.length > 0 && handoff.page.rawBody.includes(quote);
  const base = { ...handoff, rosterIds: roster.map((item) => item.id), proposed };

  if (!doctor) return { ...base, doctors: [], doctorStatus: "unresolved", rejectReason: null };
  if (brokenDoctorPrompt && quoteInSource) {
    return { ...base, doctors: [{ ...doctor, via: "llm_surname", quote }], doctorStatus: "supported", rejectReason: null };
  }
  if (!brokenDoctorPrompt && quoteInSource && quote.includes(doctor.nameKo)) {
    return { ...base, doctors: [{ ...doctor, via: "llm_korean_quote", quote }], doctorStatus: "supported", rejectReason: null };
  }
  return { ...base, doctors: [], doctorStatus: "unresolved", rejectReason: "doctor_quote_missing_full_name" };
}
