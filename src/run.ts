/**
 * CLI entry. Loads .env via `node --env-file`, runs the pipeline, writes output JSON.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { openaiJson } from "./openai.ts";
import { runPipeline } from "./pipeline.ts";

const brokenDoctorPrompt = process.argv.includes("--broken");
const result = await runPipeline({ brokenDoctorPrompt, llm: openaiJson });
const output = {
  mode: brokenDoctorPrompt ? "llm_surname_prompt" : "llm_full_name_plus_quote_gate",
  model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  published: result.published,
  quarantined: result.quarantined,
  trace: result.trace,
};

mkdirSync("output", { recursive: true });
const file = brokenDoctorPrompt ? "output/broken.json" : "output/fixed.json";
writeFileSync(file, JSON.stringify(output, null, 2));

console.log(JSON.stringify({
  mode: output.mode,
  published: result.published.map((card) => ({
    id: card.id,
    clinic: card.english.nameEn,
    procedures: card.procedures.map((procedure) => procedure.id),
    summaryEn: card.english.summaryEn,
    doctors: card.doctors,
    doctorStatus: card.doctorStatus,
  })),
  quarantined: result.quarantined.map((card) => ({
    id: card.id,
    reasons: card.reasons,
    doctorStatus: card.doctorStatus,
  })),
  wrote: file,
}, null, 2));
