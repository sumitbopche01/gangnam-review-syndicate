/**
 * Orchestrator: fetch clinics, then analyse → translate → doctor → validator.
 * Each arrow is a typed handoff recorded in the trace.
 */

import { analyseAgent, doctorAgent, translateAgent, type DoctorHandoff } from "./agents.ts";
import { fetchClinics } from "./sources.ts";
import type { ClinicCard, LlmClient, PipelineResult, ProcedureHit, TraceStep } from "./types.ts";

interface RunOptions {
  brokenDoctorPrompt?: boolean;
  llm: LlmClient;
}

export async function runPipeline({ brokenDoctorPrompt = false, llm }: RunOptions): Promise<PipelineResult> {
  const context = { llm, brokenDoctorPrompt };
  const trace: TraceStep[] = [];
  const pages = fetchClinics();
  trace.push(step("fetch_clinics", "cli", "clinic directory connector", pages.map((page) => page.id)));

  const cards: ClinicCard[] = [];
  for (const page of pages) {
    const analysis = await analyseAgent(page, context);
    trace.push(step("handoff analyse → translate", page.id, `openai:${analysis.model}`, {
      clinicId: analysis.clinic?.id ?? null,
      procedures: analysis.procedures.map((procedure) => procedure.id),
      dropped: analysis.droppedProcedures,
      doctorMentionsKo: analysis.doctorMentionsKo,
    }));

    const translation = await translateAgent(analysis, context);
    trace.push(step("handoff translate → doctor", page.id, `openai:${translation.translateModel}`, {
      summaryEn: translation.summaryEn,
    }));

    const doctors = await doctorAgent(translation, context);
    trace.push(step("handoff doctor → validator", page.id, doctors.clinic ? "doctor connector + openai" : "skipped", {
      roster: doctors.rosterIds,
      proposed: doctors.proposed,
      kept: doctors.doctors.map((doctor) => doctor.nameEn),
      doctorStatus: doctors.doctorStatus,
      rejectReason: doctors.rejectReason,
    }));

    const card = validatorAgent(doctors);
    trace.push(step("validator → publish", page.id, "validator", { status: card.status, reasons: card.reasons }));
    cards.push(card);
  }

  const published = cards.filter((card) => card.status === "published");
  trace.push(step("publish", "validator.accepted", "index writer", published.map((card) => card.id)));

  return {
    published,
    quarantined: cards.filter((card) => card.status !== "published"),
    trace,
  };
}

function validatorAgent(handoff: DoctorHandoff): ClinicCard {
  const reasons: string[] = [];
  if (!handoff.clinic) reasons.push("clinic_unresolved");
  if (handoff.procedures.length === 0) reasons.push("procedure_unverified");
  for (const procedure of handoff.procedures) {
    if (!handoff.page.rawBody.includes(procedure.alias)) reasons.push("procedure_span_missing");
  }

  const summaryEn = handoff.clinic && handoff.doctorStatus !== "supported"
    ? summaryWithoutDoctors(handoff.summaryEn, handoff.clinic.nameEn, handoff.procedures)
    : handoff.summaryEn;

  return {
    id: handoff.page.id,
    status: reasons.length === 0 ? "published" : "quarantined",
    reasons,
    sourceUrl: handoff.page.url,
    korean: {
      name: handoff.page.rawName,
      address: handoff.page.rawAddress,
      body: handoff.page.rawBody,
    },
    english: {
      nameEn: handoff.clinic?.nameEn ?? null,
      summaryEn: handoff.clinic ? summaryEn : null,
      translationRewritten: summaryEn !== handoff.summaryEn,
      modelSummaryEn: handoff.summaryEn,
    },
    clinic: handoff.clinic
      ? { id: handoff.clinic.id, nameEn: handoff.clinic.nameEn, status: "supported" }
      : { id: null, status: "unresolved" },
    procedures: handoff.procedures.map((procedure) => ({
      id: procedure.id,
      labelEn: procedure.labelEn,
      evidence: procedure.alias,
    })),
    doctors: handoff.doctors,
    doctorStatus: handoff.doctorStatus,
    rejectReason: handoff.rejectReason,
  };
}

function summaryWithoutDoctors(summaryEn: string, nameEn: string, procedures: ProcedureHit[]): string {
  const mentionsDoctor = /dr\.?\s|surgeon|원장|김태형|김서연|김민준|kim /i.test(summaryEn);
  if (!mentionsDoctor) return summaryEn;
  const labels = procedures.map((procedure) => procedure.labelEn).join(", ") || "procedure unresolved";
  return `${labels} at ${nameEn}.`;
}

function step(name: string, trigger: string, tool: string, output: unknown): TraceStep {
  return { step: name, trigger, tool, output };
}
