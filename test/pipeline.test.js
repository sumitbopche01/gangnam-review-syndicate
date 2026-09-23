import assert from "node:assert/strict";
import test from "node:test";
import { runPipeline } from "../src/pipeline.js";

test("a bad doctor prompt lets the model assign Kim Tae-hyung from a surname quote", async () => {
  const result = await runPipeline({ brokenDoctorPrompt: true, llm: scriptedModel });
  const banobagi = result.published.find((card) => card.id === "page-banobagi");
  assert.equal(banobagi.doctors[0].nameEn, "Kim Tae-hyung");
  assert.equal(banobagi.doctors[0].via, "llm_surname");
  assert.equal(banobagi.korean.body.includes("김태형"), false);
  assert.match(banobagi.english.modelSummaryEn, /Dr\. Kim/);
});

test("the quote gate drops that doctor and keeps the English clinic card", async () => {
  const result = await runPipeline({ brokenDoctorPrompt: false, llm: scriptedModel });
  const banobagi = result.published.find((card) => card.id === "page-banobagi");
  assert.equal(banobagi.english.nameEn, "Banobagi Plastic Surgery");
  assert.equal(banobagi.procedures[0].evidence, "코성형");
  assert.deepEqual(banobagi.doctors, []);
  assert.equal(banobagi.doctorStatus, "unresolved");
  assert.equal(banobagi.rejectReason, "doctor_quote_missing_full_name");
  assert.equal(banobagi.english.summaryEn.includes("Dr. Kim"), false);

  const idHospital = result.published.find((card) => card.id === "page-id");
  assert.equal(idHospital.doctors[0].nameKo, "김민준");
  assert.equal(idHospital.doctors[0].via, "llm_korean_quote");
});

test("an unknown clinic is quarantined before the doctor agent runs", async () => {
  const result = await runPipeline({ brokenDoctorPrompt: false, llm: scriptedModel });
  const unknown = result.quarantined.find((card) => card.id === "page-unknown");
  assert.ok(unknown.reasons.includes("clinic_unresolved"));
  assert.equal(unknown.doctorStatus, "skipped_unresolved_clinic");
  const doctorSteps = result.trace.filter((entry) => entry.step === "fetch_doctors" && entry.trigger === "page-unknown");
  assert.equal(doctorSteps[0].tool, "skipped");
});

function scriptedModel({ step, system, user }) {
  const input = JSON.parse(user);
  if (step === "analyse") {
    const procedures = [];
    if (input.rawBody.includes("코성형")) procedures.push("코성형");
    if (input.rawBody.includes("쌍꺼풀")) procedures.push("쌍꺼풀");
    if (input.rawBody.includes("리프팅")) procedures.push("리프팅");
    return {
      model: "test-double",
      json: {
        procedures_ko: procedures,
        doctor_mentions_ko: input.rawBody.includes("김") ? ["김"] : [],
      },
    };
  }

  if (step === "translate") {
    const summary = `${input.procedureLabels.join(", ") || "procedure unresolved"} at ${input.nameEn}.`;
    const summaryEn = system.includes("Dr. Kim") && input.rawBody.includes("김")
      ? `${summary} Dr. Kim leads the clinic.`
      : summary;
    return { model: "test-double", json: { summary_en: summaryEn } };
  }

  if (step === "associate_doctor") {
    const exact = input.roster.find((doctor) => input.rawBody.includes(doctor.nameKo));
    if (exact) {
      return { model: "test-double", json: { doctor_id: exact.id, quote: exact.nameKo, status: "supported" } };
    }
    const guess = input.roster.find((doctor) => doctor.surnameEn === "Kim" && input.rawBody.includes("김"));
    if (guess) {
      return { model: "test-double", json: { doctor_id: guess.id, quote: "김", status: "supported" } };
    }
    return { model: "test-double", json: { doctor_id: null, quote: null, status: "unresolved" } };
  }

  throw new Error(`unexpected step ${step}`);
}
