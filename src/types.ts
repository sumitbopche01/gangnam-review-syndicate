/**
 * Shared types for the clinic pipeline.
 */

export type EvidenceStatus = "supported" | "unresolved" | "conflict";
export type DoctorStatus = EvidenceStatus | "skipped_unresolved_clinic";
export type CardStatus = "published" | "quarantined";

export interface ClinicPage {
  id: string;
  url: string;
  rawName: string;
  rawAddress: string;
  phone: string;
  rawBody: string;
}

export interface Clinic {
  id: string;
  nameEn: string;
  aliases: string[];
}

export interface Procedure {
  id: string;
  labelEn: string;
  aliases: string[];
}

export interface ProcedureHit {
  id: string;
  labelEn: string;
  alias: string;
}

export interface Doctor {
  id: string;
  nameKo: string;
  nameEn: string;
  surnameEn: string;
}

export type DoctorVia = "llm_korean_quote" | "llm_surname";

export interface AttachedDoctor extends Doctor {
  via: DoctorVia;
  quote: string;
}

export interface ClinicCard {
  id: string;
  status: CardStatus;
  reasons: string[];
  sourceUrl: string;
  korean: { name: string; address: string; body: string };
  english: {
    nameEn: string | null;
    summaryEn: string | null;
    translationRewritten: boolean;
    modelSummaryEn: string;
  };
  clinic: { id: string; nameEn: string; status: "supported" } | { id: null; status: "unresolved" };
  procedures: { id: string; labelEn: string; evidence: string }[];
  doctors: AttachedDoctor[];
  doctorStatus: DoctorStatus;
  rejectReason: string | null;
}

export interface TraceStep {
  step: string;
  trigger: string;
  tool: string;
  output: unknown;
}

export interface PipelineResult {
  published: ClinicCard[];
  quarantined: ClinicCard[];
  trace: TraceStep[];
}

export type AgentStep = "analyse" | "translate" | "associate_doctor";

export interface LlmRequest {
  step: AgentStep;
  system: string;
  user: string;
}

export interface LlmResponse {
  step: AgentStep;
  model: string;
  json: unknown;
}

export type LlmClient = (request: LlmRequest) => Promise<LlmResponse>;
