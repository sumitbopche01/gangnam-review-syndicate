import assert from "node:assert/strict";
import test from "node:test";
import { REVIEWS } from "../src/fixtures.js";
import { runPipeline } from "../src/pipeline.js";

test("broken surname match publishes the ambiguous Banobagi review as Kim Tae-hyung", () => {
  const result = runPipeline(REVIEWS, { brokenSurgeonMatch: true });
  const publishedIds = result.published.map((record) => record.id);
  assert.ok(publishedIds.includes("r4"));
  const r4 = result.published.find((record) => record.id === "r4");
  assert.equal(r4.surgeon.name, "Kim Tae-hyung");
  assert.equal(r4.surgeon.via, "surname");
});

test("full-alias gate quarantines a surname-only surgeon and still publishes the evidenced reviews", () => {
  const result = runPipeline(REVIEWS, { brokenSurgeonMatch: false });
  const publishedIds = result.published.map((record) => record.id).sort();
  assert.deepEqual(publishedIds, ["r1", "r3"]);

  const r4 = result.quarantined.find((record) => record.id === "r4");
  assert.equal(r4.status, "quarantined");
  assert.ok(r4.reasons.includes("surgeon_unverified"));
  assert.equal(r4.surgeon.id, null);

  assert.deepEqual(result.duplicates, [{ id: "r2", duplicateOf: "r1" }]);
});

test("published records keep a Korean evidence span and a price in KRW", () => {
  const result = runPipeline(REVIEWS, { brokenSurgeonMatch: false });
  const r1 = result.published.find((record) => record.id === "r1");
  assert.equal(r1.procedure.id, "rhinoplasty");
  assert.equal(r1.procedure.evidence, "코성형");
  assert.equal(r1.clinic.id, "clinic_banobagi");
  assert.equal(r1.surgeon.id, "surgeon_kim_taehyung");
  assert.equal(r1.priceKrw, 4500000);
  assert.ok(r1.originalText.includes(r1.procedure.evidence));
});
