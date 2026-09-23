import { mkdirSync, writeFileSync } from "node:fs";
import { REVIEWS } from "./fixtures.js";
import { runPipeline } from "./pipeline.js";

const brokenSurgeonMatch = process.argv.includes("--broken");
const result = runPipeline(REVIEWS, { brokenSurgeonMatch });
const output = {
  mode: brokenSurgeonMatch ? "broken_surname_match" : "full_alias_required",
  published: result.published,
  quarantined: result.quarantined,
  duplicates: result.duplicates,
  trace: result.trace,
};

mkdirSync("output", { recursive: true });
const file = brokenSurgeonMatch ? "output/broken.json" : "output/fixed.json";
writeFileSync(file, JSON.stringify(output, null, 2));

console.log(JSON.stringify({
  mode: output.mode,
  published: result.published.map((record) => ({ id: record.id, surgeon: record.surgeon, line: record.comparisonLine })),
  quarantined: result.quarantined.map((record) => ({ id: record.id, reasons: record.reasons, surgeon: record.surgeon })),
  duplicates: result.duplicates,
  wrote: file,
}, null, 2));
