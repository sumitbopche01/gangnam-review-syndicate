import { mkdirSync, writeFileSync } from "node:fs";
import { runPipeline } from "./pipeline.js";

const brokenDoctorFromEnglish = process.argv.includes("--broken");
const result = runPipeline({ brokenDoctorFromEnglish });
const output = {
  mode: brokenDoctorFromEnglish ? "doctor_matched_from_english" : "doctor_matched_from_korean",
  published: result.published,
  quarantined: result.quarantined,
  trace: result.trace,
};

mkdirSync("output", { recursive: true });
const file = brokenDoctorFromEnglish ? "output/broken.json" : "output/fixed.json";
writeFileSync(file, JSON.stringify(output, null, 2));

console.log(JSON.stringify({
  mode: output.mode,
  published: result.published.map((card) => ({
    id: card.id,
    clinic: card.clinic,
    procedures: card.procedures,
    doctors: card.doctors,
    summaryEn: card.english.summaryEn,
  })),
  quarantined: result.quarantined.map((card) => ({
    id: card.id,
    reasons: card.reasons,
    doctors: card.doctors,
    doctorStatus: card.doctorStatus,
  })),
  wrote: file,
}, null, 2));
