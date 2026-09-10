import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { validateAssessment } from "../server/assessment.mjs";
import { buildHarborPrecision } from "../src/data/harbor-precision.mjs";
import {
  FAMILIES,
  FAMILY_IDS,
  allFamiliesReviewed,
  familyReviewRows,
  gatedPrepMarkedAt,
  isFamilyReviewed,
  normalizeFamilyReviews,
  reviewForFamily,
  reviewedFamilyCount,
  upsertFamilyReview,
} from "../src/lib/familyReview.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.json"), "utf8")).requirements;

function markAll(reviewer = "Pat Consultant (sample)") {
  return FAMILY_IDS.map((family) => ({
    family,
    reviewed: true,
    reviewer,
    reviewedAt: "2026-09-09T12:00:00.000Z",
    notes: "",
  }));
}

describe("consultant family-review flags", () => {
  it("covers the 14 SPRS families in stepper order and matches the catalog", () => {
    assert.equal(FAMILY_IDS.length, 14);
    assert.equal(FAMILIES.length, 14);
    assert.deepEqual(FAMILY_IDS, [
      "AC",
      "AT",
      "AU",
      "CM",
      "IA",
      "IR",
      "MA",
      "MP",
      "PS",
      "PE",
      "RA",
      "CA",
      "SC",
      "SI",
    ]);
    const catalogFamilies = [...new Set(catalog.map((row) => row.family))];
    assert.deepEqual([...FAMILY_IDS].sort(), catalogFamilies.sort());
  });

  it("Harbor seed is unreviewed and not Export-ready", () => {
    const seed = buildHarborPrecision();
    assert.deepEqual(seed.familyReviews, []);
    assert.equal(seed.prepMarkedAt, null);
    assert.equal(allFamiliesReviewed(seed.familyReviews), false);
    assert.equal(reviewedFamilyCount(seed.familyReviews), 0);
    assert.equal(familyReviewRows(seed.familyReviews).length, 14);
    assert.equal(gatedPrepMarkedAt(seed.familyReviews, "2026-09-09T13:00:00.000Z"), null);
  });

  it("normalizes unknown families out and fills missing rows", () => {
    const rows = normalizeFamilyReviews([
      { family: "ac", reviewed: true, reviewer: "Pat", reviewedAt: "2026-09-09T12:00:00.000Z", notes: "ok" },
      { family: "XX", reviewed: true, reviewer: "Skip", reviewedAt: "2026-09-09T12:00:00.000Z", notes: "" },
    ]);
    assert.equal(rows.length, 14);
    assert.equal(rows[0].family, "AC");
    assert.equal(rows[0].reviewed, true);
    assert.equal(rows[0].reviewer, "Pat");
    assert.equal(rows.some((row) => row.family === "XX"), false);
    assert.equal(reviewForFamily(rows, "AT").reviewed, false);
  });

  it("reviewed requires a non-empty reviewer name; nameless rows uncheck and cannot mark prep", () => {
    const nameless = FAMILY_IDS.map((family) => ({
      family,
      reviewed: true,
      reviewer: "",
      reviewedAt: "2026-09-09T12:00:00.000Z",
      notes: "",
    }));
    const coerced = normalizeFamilyReviews(nameless);
    assert.equal(coerced.every((row) => row.reviewed === false), true);
    assert.equal(coerced.every((row) => row.reviewedAt === "2026-09-09T12:00:00.000Z"), true);
    assert.equal(allFamiliesReviewed(nameless), false);
    assert.equal(reviewedFamilyCount(nameless), 0);
    assert.equal(isFamilyReviewed({ reviewed: true, reviewer: "   " }), false);
    assert.equal(isFamilyReviewed({ reviewed: true, reviewer: "Pat" }), true);

    const cleared = upsertFamilyReview(markAll(), { family: "AC", reviewer: "" });
    assert.equal(cleared[0].reviewed, false);
    assert.equal(cleared[0].reviewedAt, "2026-09-09T12:00:00.000Z");
    assert.equal(allFamiliesReviewed(cleared), false);
    assert.equal(gatedPrepMarkedAt(nameless, "2026-09-09T13:00:00.000Z"), null);

    const seed = buildHarborPrecision();
    const hit = validateAssessment({
      assessment: { ...seed, familyReviews: nameless, prepMarkedAt: "2026-09-09T13:00:00.000Z" },
    });
    assert.equal(hit.ok, true);
    assert.equal(hit.assessment.prepMarkedAt, null);
    assert.equal(hit.assessment.familyReviews.every((row) => row.reviewed === false), true);
    assert.equal(hit.assessment.familyReviews.every((row) => row.reviewedAt === "2026-09-09T12:00:00.000Z"), true);

    const spaces = markAll("   ");
    const spaced = validateAssessment({
      assessment: { ...seed, familyReviews: spaces, prepMarkedAt: "2026-09-09T13:00:00.000Z" },
    });
    assert.equal(spaced.assessment.prepMarkedAt, null);
    assert.equal(allFamiliesReviewed(spaced.assessment.familyReviews), false);
  });

  it("upsert keeps 14 rows and clears prep when a family is unreviewed", () => {
    const thirteen = markAll();
    thirteen[0] = { ...thirteen[0], reviewed: false, reviewedAt: null };
    assert.equal(allFamiliesReviewed(thirteen), false);
    assert.equal(reviewedFamilyCount(thirteen), 13);
    const restored = upsertFamilyReview(thirteen, { family: "AC", reviewed: true, reviewer: "Pat", reviewedAt: "2026-09-09T15:00:00.000Z" });
    assert.equal(allFamiliesReviewed(restored), true);
    assert.equal(gatedPrepMarkedAt(thirteen, "2026-09-09T13:00:00.000Z"), null);
    assert.equal(gatedPrepMarkedAt(restored, "2026-09-09T13:00:00.000Z"), "2026-09-09T13:00:00.000Z");
  });

  it("PUT persists familyReviews and refuses prepMarkedAt until all 14 are reviewed", () => {
    const seed = buildHarborPrecision();
    const incomplete = validateAssessment({
      assessment: { ...seed, prepMarkedAt: "2026-09-09T13:00:00.000Z" },
    });
    assert.equal(incomplete.ok, true);
    assert.equal(incomplete.assessment.familyReviews.length, 14);
    assert.equal(incomplete.assessment.familyReviews.every((row) => row.reviewed === false), true);
    assert.equal(incomplete.assessment.prepMarkedAt, null);

    const thirteen = markAll();
    thirteen[13] = { ...thirteen[13], reviewed: false, reviewedAt: null };
    const almost = validateAssessment({
      assessment: { ...seed, familyReviews: thirteen, prepMarkedAt: "2026-09-09T13:00:00.000Z" },
    });
    assert.equal(almost.ok, true);
    assert.equal(almost.assessment.prepMarkedAt, null);
    assert.equal(allFamiliesReviewed(almost.assessment.familyReviews), false);

    const ready = validateAssessment({
      assessment: { ...seed, familyReviews: markAll(), prepMarkedAt: "2026-09-09T13:00:00.000Z" },
    });
    assert.equal(ready.ok, true);
    assert.equal(ready.assessment.familyReviews.length, 14);
    assert.equal(allFamiliesReviewed(ready.assessment.familyReviews), true);
    assert.equal(ready.assessment.prepMarkedAt, "2026-09-09T13:00:00.000Z");
  });

  it("Home and Requirements gate Export-ready without SPRS submit or affirm", () => {
    const home = fs.readFileSync(path.join(root, "src/pages/Home.tsx"), "utf8");
    const reqs = fs.readFileSync(path.join(root, "src/pages/Requirements.tsx"), "utf8");
    const api = fs.readFileSync(path.join(root, "server/index.mjs"), "utf8");

    assert.match(home, /familyReviewRows/);
    assert.match(home, /allFamiliesReviewed/);
    assert.match(home, /Mark ready to type into SPRS/);
    assert.match(home, /disabled=\{readOnly \|\| !allReviewed\}/);
    assert.match(home, /Not ready to type into SPRS/);
    assert.equal(/\/api\/sprs|\/api\/affirm|\/api\/submit/.test(home), false);

    assert.match(reqs, /type="checkbox"/);
    assert.match(reqs, /Consultant reviewed this family/);
    assert.match(reqs, /reviewer/);
    assert.match(reqs, /reviewedAt/);
    assert.match(reqs, /does not submit, affirm, or call SPRS/);
    assert.match(reqs, /Reviewer name is required to keep this family reviewed/);
    assert.match(reqs, /reviewed \? " ✓"/);
    assert.equal(/\/api\/sprs|\/api\/affirm|\/api\/submit/.test(reqs), false);

    const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
    assert.match(css, /\.family-tabs button\.reviewed\s*\{/);
    assert.match(css, /\.family-tabs button\.active\.reviewed\s*\{/);
    assert.equal(/button\.reviewed:not\(\.active\)\s*\{[^}]*border-color/.test(css), false);

    assert.equal(/app\.(get|post|put)\(\s*[`'"]\/api\/sprs/.test(api), false);
    assert.equal(/app\.(get|post|put)\(\s*[`'"]\/api\/affirm/.test(api), false);
    assert.equal(/app\.(get|post|put)\(\s*[`'"]\/api\/submit/.test(api), false);
  });
});
