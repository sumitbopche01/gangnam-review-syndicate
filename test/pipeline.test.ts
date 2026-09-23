import assert from "node:assert/strict";
import test from "node:test";
import { runPipeline } from "../src/pipeline.ts";
import type { LlmClient } from "../src/types.ts";

test("a bad doctor prompt lets the model assign Kim Tae-hyung from a surname quote", async () => {
  const result = await runPipeline({ brokenDoctorPrompt: true, llm: scriptedModel });
  const banobagi = result.published.find((card) => card.id === "page-banobagi");
  assert.ok(banobagi);
  assert.equal(banobagi.doctors[0]?.nameEn, "Kim Tae-hyung");
  assert.equal(banobagi.doctors[0]?.via, "llm_surname");
  assert.equal(banobagi.korean.body.includes("김태형"), false);
  assert.match(banobagi.english.modelSummaryEn, /Dr\. Kim/);
});

test("the quote gate drops that doctor and keeps the English clinic card", async () => {
  const result = await runPipeline({ brokenDoctorPrompt: false, llm: scriptedModel });
  const banobagi = result.published.find((card) => card.id === "page-banobagi");
  assert.ok(banobagi);
  assert.equal(banobagi.english.nameEn, "Banobagi Plastic Surgery");
  assert.equal(banobagi.procedures[0]?.evidence, "코성형");
  assert.deepEqual(banobagi.doctors, []);
  assert.equal(banobagi.doctorStatus, "unresolved");
  assert.equal(banobagi.rejectReason, "doctor_quote_missing_full_name");
  assert.equal(banobagi.english.summaryEn?.includes("Dr. Kim"), false);

  const idHospital = result.published.find((card) => card.id === "page-id");
  assert.ok(idHospital);
  assert.equal(idHospital.doctors[0]?.nameKo, "김민준");
  assert.equal(idHospital.doctors[0]?.via, "llm_korean_quote");
});

test("an unknown clinic is quarantined before the doctor agent runs", async () => {
  const result = await runPipeline({ brokenDoctorPrompt: false, llm: scriptedModel });
  const unknown = result.quarantined.find((card) => card.id === "page-unknown");
  assert.ok(unknown);
  assert.ok(unknown.reasons.includes("clinic_unresolved"));
  assert.equal(unknown.doctorStatus, "skipped_unresolved_clinic");
  const doctorStep = result.trace.find((entry) => entry.step === "handoff doctor → validator" && entry.trigger === "page-unknown");
  assert.equal(doctorStep?.tool, "skipped");
});

test("malformed model JSON stops the run instead of reaching the gate", async () => {
  const badModel: LlmClient = async ({ step }) => ({ step, model: "test-double", json: { procedures_ko: "코성형" } });
  await assert.rejects(runPipeline({ llm: badModel }));
});

const scriptedModel: LlmClient = async ({ step, system, user }) => {
  const input = JSON.parse(user) as {
    rawBody: string;
    nameEn?: string | null;
    procedureLabels?: string[];
    roster?: { id: string; nameKo: string; surnameEn: string }[];
  };

  if (step === "analyse") {
    const procedures = ["코성형", "쌍꺼풀", "리프팅"].filter((term) => input.rawBody.includes(term));
    return {
      step,
      model: "test-double",
      json: { procedures_ko: procedures, doctor_mentions_ko: input.rawBody.includes("김") ? ["김"] : [] },
    };
  }

  if (step === "translate") {
    const summary = `${input.procedureLabels?.join(", ") || "procedure unresolved"} at ${input.nameEn}.`;
    const summaryEn = system.includes("Dr. Kim") && input.rawBody.includes("김") ? `${summary} Dr. Kim leads the clinic.` : summary;
    return { step, model: "test-double", json: { summary_en: summaryEn } };
  }

  const roster = input.roster ?? [];
  const exact = roster.find((doctor) => input.rawBody.includes(doctor.nameKo));
  if (exact) {
    return { step, model: "test-double", json: { doctor_id: exact.id, quote: exact.nameKo, status: "supported" } };
  }
  const guess = roster.find((doctor) => doctor.surnameEn === "Kim" && input.rawBody.includes("김"));
  if (guess) {
    return { step, model: "test-double", json: { doctor_id: guess.id, quote: "김", status: "supported" } };
  }
  return { step, model: "test-double", json: { doctor_id: null, quote: null, status: "unresolved" } };
};
