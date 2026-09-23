/**
 * Fetch clinics, then three OpenAI agents: analyse, translate, associate doctors.
 * Tools resolve aliases and reject a doctor whose full Korean name is not in the source.
 */

import { matchClinic, matchProcedures } from "./knowledge.js";
import { fetchClinics, fetchDoctors } from "./sources.js";

export async function runPipeline({ brokenDoctorPrompt = false, llm }) {
  if (!llm) throw new Error("An LLM client is required. Pass openaiJson or a test double.");

  const trace = [];
  const pages = fetchClinics();
  trace.push(step("fetch_clinics", "cli", "clinic directory connector", pages.map((page) => page.id)));

  const cards = [];
  for (const page of pages) {
    cards.push(await processClinic(page, { brokenDoctorPrompt, llm, trace }));
  }

  const published = cards.filter((card) => card.status === "published");
  trace.push(step("publish", "validate.accepted", "index writer", published.map((card) => card.id)));

  return {
    published,
    quarantined: cards.filter((card) => card.status !== "published"),
    trace,
  };
}

async function processClinic(page, { brokenDoctorPrompt, llm, trace }) {
  const clinicHit = matchClinic(page.rawName);
  const clinic = clinicHit ? { ...clinicHit.clinic, matchedAlias: clinicHit.alias } : null;

  const analysisCall = await llm({
    step: "analyse",
    system: [
      "You extract spans from a Korean clinic page for Gangnam Beauty Guide.",
      "Return JSON: {\"procedures_ko\": string[], \"doctor_mentions_ko\": string[]}.",
      "Every string must be copied verbatim from the page. Do not translate. Do not invent a procedure or a person.",
    ].join(" "),
    user: JSON.stringify({ rawName: page.rawName, rawBody: page.rawBody }),
  });
  const procedures = confirmedProcedures(page.rawBody, analysisCall.json.procedures_ko);
  const acceptedAliases = new Set(procedures.map((procedure) => procedure.alias));
  trace.push(step("analyse", page.id, `openai:${analysisCall.model}`, {
    procedures: procedures.map((procedure) => procedure.id),
    dropped: (analysisCall.json.procedures_ko ?? []).filter((alias) => !acceptedAliases.has(alias)),
    doctorMentions: analysisCall.json.doctor_mentions_ko ?? [],
  }));

  const translateCall = await llm({
    step: "translate",
    system: brokenDoctorPrompt
      ? "Translate the clinic fields into English JSON {\"summary_en\": string}. If the Korean page mentions 김 or a director, write 'Dr. Kim leads the clinic.' Use the canonical English clinic name and procedure labels. Do not add prices."
      : "Translate the clinic fields into English JSON {\"summary_en\": string}. Use only the canonical English clinic name and procedure labels. Do not name a doctor, surgeon, or title. Do not add prices or claims that are not in the procedure list.",
    user: JSON.stringify({
      nameEn: clinic?.nameEn ?? null,
      procedureLabels: procedures.map((procedure) => procedure.labelEn),
      rawBody: page.rawBody,
    }),
  });
  const summaryEn = typeof translateCall.json.summary_en === "string" ? translateCall.json.summary_en : "";
  trace.push(step("translate", page.id, `openai:${translateCall.model}`, { summaryEn }));

  if (!clinic) {
    trace.push(step("fetch_doctors", page.id, "skipped", { reason: "clinic_unresolved" }));
    return finish({
      page,
      clinic: null,
      clinicStatus: "unresolved",
      procedures,
      summaryEn,
      doctors: [],
      doctorStatus: "skipped_unresolved_clinic",
      translationRewritten: false,
    });
  }

  const roster = fetchDoctors(clinic.id);
  trace.push(step("fetch_doctors", page.id, "doctor directory connector", roster.map((doctor) => doctor.id)));

  const associateCall = await llm({
    step: "associate_doctor",
    system: brokenDoctorPrompt
      ? "Choose a doctor for this clinic. Return JSON {\"doctor_id\": string|null, \"quote\": string|null, \"status\": \"supported\"|\"unresolved\"}. If the page contains 김 but not a full name, you must pick the first roster doctor whose surnameEn is Kim and copy a verbatim quote from the page that contains 김."
      : "Associate a doctor only from evidence. Return JSON {\"doctor_id\": string|null, \"quote\": string|null, \"status\": \"supported\"|\"unresolved\"}. Set doctor_id only when that roster doctor's exact nameKo appears in the Korean page. The quote must be a verbatim substring and must contain nameKo. A surname or 원장 is not enough: return doctor_id null and status unresolved.",
    user: JSON.stringify({
      rawBody: page.rawBody,
      roster: roster.map((doctor) => ({
        id: doctor.id,
        nameKo: doctor.nameKo,
        surnameEn: doctor.surnameEn,
      })),
    }),
  });

  const association = judgeDoctor({
    page,
    roster,
    decision: associateCall.json,
    brokenDoctorPrompt,
  });
  trace.push(step("associate_doctor", page.id, `openai:${associateCall.model}`, {
    model: associateCall.json,
    kept: association.doctors.map((doctor) => doctor.nameEn),
    doctorStatus: association.doctorStatus,
    rejectReason: association.rejectReason ?? null,
  }));

  const safeSummary = association.doctorStatus === "supported"
    ? summaryEn
    : summaryWithoutDoctors(summaryEn, clinic.nameEn, procedures);
  const translationRewritten = safeSummary !== summaryEn;

  return finish({
    page,
    clinic,
    clinicStatus: "supported",
    procedures,
    summaryEn: safeSummary,
    doctors: association.doctors,
    doctorStatus: association.doctorStatus,
    rejectReason: association.rejectReason ?? null,
    translationRewritten,
    modelSummaryEn: summaryEn,
  });
}

function confirmedProcedures(rawBody, claimed = []) {
  const inSource = matchProcedures(rawBody);
  const accepted = inSource.filter((procedure) => (claimed ?? []).includes(procedure.alias));
  return accepted.length > 0 ? accepted : inSource;
}

function judgeDoctor({ page, roster, decision, brokenDoctorPrompt }) {
  const doctor = roster.find((item) => item.id === decision?.doctor_id);
  const quote = typeof decision?.quote === "string" ? decision.quote : "";
  if (!doctor) return { doctors: [], doctorStatus: "unresolved" };

  const quoteInSource = quote.length > 0 && page.rawBody.includes(quote);
  const nameInSource = page.rawBody.includes(doctor.nameKo);
  const quoteHasFullName = quote.includes(doctor.nameKo);

  if (brokenDoctorPrompt && quoteInSource) {
    return {
      doctors: [{ ...doctor, via: "llm_surname", quote }],
      doctorStatus: "supported",
    };
  }

  if (!brokenDoctorPrompt && quoteInSource && nameInSource && quoteHasFullName) {
    return {
      doctors: [{ ...doctor, via: "llm_korean_quote", quote }],
      doctorStatus: "supported",
    };
  }

  return {
    doctors: [],
    doctorStatus: "unresolved",
    rejectReason: "doctor_quote_missing_full_name",
  };
}

function summaryWithoutDoctors(summaryEn, nameEn, procedures) {
  const mentionsDoctor = /dr\.?\s|surgeon|원장|김태형|김서연|김민준|kim /i.test(summaryEn);
  if (!mentionsDoctor) return summaryEn;
  const labels = procedures.map((procedure) => procedure.labelEn).join(", ") || "procedure unresolved";
  return `${labels} at ${nameEn}.`;
}

function finish(clinic) {
  const reasons = [];
  if (clinic.clinicStatus !== "supported") reasons.push("clinic_unresolved");
  if (clinic.procedures.length === 0) reasons.push("procedure_unverified");
  for (const procedure of clinic.procedures) {
    if (!clinic.page.rawBody.includes(procedure.alias)) reasons.push("procedure_span_missing");
  }

  return {
    id: clinic.page.id,
    status: reasons.length === 0 ? "published" : "quarantined",
    reasons,
    sourceUrl: clinic.page.url,
    korean: {
      name: clinic.page.rawName,
      address: clinic.page.rawAddress,
      body: clinic.page.rawBody,
    },
    english: {
      nameEn: clinic.clinic?.nameEn ?? null,
      summaryEn: clinic.clinicStatus === "supported" ? clinic.summaryEn : null,
      translationRewritten: clinic.translationRewritten ?? false,
      modelSummaryEn: clinic.modelSummaryEn ?? clinic.summaryEn,
    },
    clinic: clinic.clinic
      ? { id: clinic.clinic.id, nameEn: clinic.clinic.nameEn, status: clinic.clinicStatus }
      : { id: null, status: "unresolved" },
    procedures: clinic.procedures.map((procedure) => ({
      id: procedure.id,
      labelEn: procedure.labelEn,
      evidence: procedure.alias,
    })),
    doctors: clinic.doctors.map((doctor) => ({
      id: doctor.id,
      nameKo: doctor.nameKo,
      nameEn: doctor.nameEn,
      via: doctor.via,
      quote: doctor.quote,
    })),
    doctorStatus: clinic.doctorStatus,
    rejectReason: clinic.rejectReason ?? null,
  };
}

function step(name, trigger, tool, output) {
  return { step: name, trigger, tool, output };
}
