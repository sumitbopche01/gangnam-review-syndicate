import assert from "node:assert/strict";
import test from "node:test";
import { runPipeline } from "../src/pipeline.js";

test("broken english surname match assigns Kim Tae-hyung to a page that never names him", () => {
  const result = runPipeline({ brokenDoctorFromEnglish: true });
  const banobagi = result.published.find((card) => card.id === "page-banobagi");
  assert.ok(banobagi);
  assert.equal(banobagi.doctors[0].nameEn, "Kim Tae-hyung");
  assert.equal(banobagi.doctors[0].via, "english_surname");
  assert.equal(banobagi.korean.body.includes("김태형"), false);
});

test("fixed pipeline translates the clinic and attaches a doctor only from the Korean name", () => {
  const result = runPipeline({ brokenDoctorFromEnglish: false });
  const publishedIds = result.published.map((card) => card.id).sort();
  assert.deepEqual(publishedIds, ["page-banobagi", "page-id"]);

  const banobagi = result.published.find((card) => card.id === "page-banobagi");
  assert.equal(banobagi.english.nameEn, "Banobagi Plastic Surgery");
  assert.equal(banobagi.procedures[0].id, "rhinoplasty");
  assert.equal(banobagi.procedures[0].evidence, "코성형");
  assert.deepEqual(banobagi.doctors, []);
  assert.equal(banobagi.doctorStatus, "unresolved");

  const idHospital = result.published.find((card) => card.id === "page-id");
  assert.equal(idHospital.english.nameEn, "ID Hospital");
  assert.equal(idHospital.procedures[0].id, "double_eyelid");
  assert.equal(idHospital.doctors[0].nameKo, "김민준");
  assert.equal(idHospital.doctors[0].nameEn, "Kim Min-jun");
  assert.equal(idHospital.doctors[0].via, "korean_name");
});

test("an unknown clinic is quarantined and does not fetch doctors", () => {
  const result = runPipeline({ brokenDoctorFromEnglish: false });
  const unknown = result.quarantined.find((card) => card.id === "page-unknown");
  assert.ok(unknown.reasons.includes("clinic_unresolved"));
  assert.equal(unknown.doctorStatus, "skipped_unresolved_clinic");
  assert.deepEqual(unknown.doctors, []);
});
