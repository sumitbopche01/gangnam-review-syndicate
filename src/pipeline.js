/**
 * Review syndication pipeline.
 *
 * Agents decide. Tools look up. The publisher only receives records the
 * validator has already accepted.
 *
 * brokenSurgeonMatch reproduces the first failure: a surname hit was treated
 * as a unique surgeon, and the validator only checked the clinic name.
 */

import { lookupClinics, lookupProcedure, lookupSurgeons } from "./knowledge.js";

const PROCEDURE_LABELS = {
  rhinoplasty: "rhinoplasty",
  double_eyelid: "double eyelid",
};

export function runPipeline(reviews, { brokenSurgeonMatch = false } = {}) {
  const trace = [];

  const ingested = reviews.map((review) => ({
    ...review,
    normalizedText: review.originalText.replace(/\s+/g, ""),
  }));
  trace.push(step("ingest", "cli", "fixture loader", reviews.map((review) => review.id), ingested.length));

  const extracted = ingested.map((review) => extractAgent(review));
  trace.push(step("extract", "ingest.records", "extract agent + lookup tools", extracted.map(summarizeExtract)));

  const resolved = extracted.map((claim) => resolveAgent(claim, { brokenSurgeonMatch }));
  trace.push(step("resolve", "extract.claims", "resolve agent", resolved.map(summarizeResolve)));

  const deduped = dedupeTool(resolved);
  trace.push(step("dedupe", "resolve.claims", "normalized-text hash", deduped.map((claim) => ({
    id: claim.id,
    duplicateOf: claim.duplicateOf ?? null,
  }))));

  const generated = deduped.map((claim) => generateAgent(claim));
  trace.push(step("generate", "dedupe.claims", "comparison-line agent", generated.map((claim) => ({
    id: claim.id,
    line: claim.comparisonLine,
  }))));

  const validated = generated.map((claim) => validateAgent(claim, { brokenSurgeonMatch }));
  trace.push(step("validate", "generate.claims", "validate agent", validated.map((claim) => ({
    id: claim.id,
    status: claim.status,
    reasons: claim.reasons,
  }))));

  const published = validated.filter((claim) => claim.status === "published" && !claim.duplicateOf);
  trace.push(step("publish", "validate.accepted", "index writer", published.map((claim) => claim.id)));

  return {
    published: published.map(toIndexRecord),
    quarantined: validated
      .filter((claim) => claim.status !== "published" && !claim.duplicateOf)
      .map(toIndexRecord),
    duplicates: validated.filter((claim) => claim.duplicateOf).map((claim) => ({
      id: claim.id,
      duplicateOf: claim.duplicateOf,
    })),
    trace,
  };
}

function extractAgent(review) {
  const procedures = lookupProcedure(review.originalText);
  const clinics = lookupClinics(review.originalText);
  const price = extractPrice(review.originalText);

  return {
    ...review,
    procedure: procedures[0] ?? null,
    procedureConflict: procedures.length > 1,
    clinics,
    priceKrw: price,
  };
}

function resolveAgent(claim, { brokenSurgeonMatch }) {
  const clinic = claim.clinics.length === 1 ? claim.clinics[0] : null;
  const surgeons = clinic
    ? lookupSurgeons(claim.originalText, clinic.clinicId, { surnameMatch: brokenSurgeonMatch })
    : [];

  let surgeon = null;
  let surgeonStatus = "unresolved";
  if (brokenSurgeonMatch && surgeons.length >= 1) {
    surgeon = surgeons[0];
    surgeonStatus = "supported";
  } else if (surgeons.length === 1) {
    surgeon = surgeons[0];
    surgeonStatus = "supported";
  } else if (surgeons.length > 1) {
    surgeonStatus = "conflict";
  }

  return {
    ...claim,
    clinic,
    clinicStatus: clinic ? "supported" : claim.clinics.length > 1 ? "conflict" : "unresolved",
    surgeon,
    surgeonStatus,
    surgeonCandidates: surgeons,
  };
}

function dedupeTool(claims) {
  const seen = new Map();
  return claims.map((claim) => {
    const key = `${claim.clinic?.clinicId ?? "no_clinic"}:${claim.normalizedText}`;
    if (seen.has(key)) {
      return { ...claim, duplicateOf: seen.get(key) };
    }
    seen.set(key, claim.id);
    return { ...claim, duplicateOf: null };
  });
}

function generateAgent(claim) {
  if (claim.duplicateOf) {
    return { ...claim, comparisonLine: null };
  }

  const procedure = claim.procedure ? PROCEDURE_LABELS[claim.procedure.procedureId] : "unresolved procedure";
  const clinic = claim.clinic?.name ?? "unresolved clinic";
  const surgeon = claim.surgeon?.name ?? "unverified surgeon";
  const price = claim.priceKrw ? `Price ${claim.priceKrw} KRW.` : "Price not stated.";

  return {
    ...claim,
    comparisonLine: `${procedure} at ${clinic} with ${surgeon}. ${price}`,
  };
}

function validateAgent(claim, { brokenSurgeonMatch }) {
  if (claim.duplicateOf) {
    return { ...claim, status: "duplicate", reasons: ["duplicate_of_" + claim.duplicateOf] };
  }

  const reasons = [];
  const span = claim.procedure?.span ?? "";

  if (!claim.procedure || claim.procedureConflict) reasons.push("procedure_unverified");
  if (!span || !claim.originalText.includes(span)) reasons.push("evidence_span_missing");
  if (claim.procedure && !claim.originalText.includes(claim.procedure.alias)) reasons.push("procedure_term_missing");
  if (claim.clinicStatus !== "supported") reasons.push("clinic_unresolved");

  if (brokenSurgeonMatch) {
    if (!claim.comparisonLine?.includes(claim.clinic?.name ?? "\0")) reasons.push("clinic_missing_from_line");
  } else if (claim.surgeonStatus !== "supported") {
    reasons.push("surgeon_unverified");
  } else if (claim.surgeon && !claim.comparisonLine.includes(claim.surgeon.name)) {
    reasons.push("surgeon_not_in_line");
  }

  if (!brokenSurgeonMatch && claim.surgeonStatus === "supported" && !claim.originalText.includes(claim.surgeon.alias)) {
    reasons.push("surgeon_span_missing");
  }

  return {
    ...claim,
    status: reasons.length === 0 ? "published" : "quarantined",
    reasons,
  };
}

function extractPrice(text) {
  const match = text.match(/(\d+)\s*만원/);
  if (!match) return null;
  return Number(match[1]) * 10000;
}

function toIndexRecord(claim) {
  return {
    id: claim.id,
    status: claim.status,
    reasons: claim.reasons,
    source: claim.source,
    originalText: claim.originalText,
    procedure: claim.procedure
      ? { id: claim.procedure.procedureId, evidence: claim.procedure.alias, status: "supported" }
      : { id: null, status: "unresolved" },
    clinic: claim.clinic
      ? { id: claim.clinic.clinicId, name: claim.clinic.name, status: claim.clinicStatus }
      : { id: null, status: claim.clinicStatus },
    surgeon: claim.surgeon
      ? { id: claim.surgeon.surgeonId, name: claim.surgeon.name, via: claim.surgeon.via, status: claim.surgeonStatus }
      : { id: null, status: claim.surgeonStatus },
    priceKrw: claim.priceKrw,
    comparisonLine: claim.comparisonLine,
  };
}

function summarizeExtract(claim) {
  return {
    id: claim.id,
    procedure: claim.procedure?.procedureId ?? null,
    clinics: claim.clinics.map((clinic) => clinic.clinicId),
    priceKrw: claim.priceKrw,
  };
}

function summarizeResolve(claim) {
  return {
    id: claim.id,
    clinic: claim.clinic?.clinicId ?? null,
    surgeon: claim.surgeon?.name ?? null,
    surgeonVia: claim.surgeon?.via ?? null,
    surgeonStatus: claim.surgeonStatus,
  };
}

function step(name, trigger, tool, output) {
  return { step: name, trigger, tool, output };
}
