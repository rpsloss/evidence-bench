import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { validateAssessment } from "../server/assessment.mjs";
import { buildHarborPrecision } from "../src/data/harbor-precision.mjs";
import { combinedBlockers, topBlockers } from "../src/lib/blockers.mjs";
import { applyNa, guardNaWrite, storedFinding } from "../src/lib/rollup.mjs";
import { scoreFromAssessment } from "../src/lib/score.mjs";
import { scopeBlockers } from "../src/lib/scope.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogFile = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.json"), "utf8"));
const meta = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.meta.json"), "utf8"));
const catalog = catalogFile.requirements;

function req(id) {
  return catalog.find((row) => row.reqId === id);
}

function scoreOf(assessment) {
  return scoreFromAssessment(assessment, catalog, meta.catalogSha256);
}

function allAoFindings(det) {
  return (det?.objectives || []).map((ao) => ao.finding);
}

function okNaDraft() {
  return { reqId: "3.13.5", naJustification: "" };
}

describe("Harbor determination seed + Requirements gates", () => {
  it("keeps Harbor org/scope/assets/flows and fake CAGE XXXXX", () => {
    const seed = buildHarborPrecision();
    assert.equal(seed.organization.name, "Harbor Precision (fictional)");
    assert.equal(seed.organization.fictional, true);
    assert.equal(seed.organization.cage, "XXXXX");
    assert.equal(seed.organization.employeeCount, 18);
    assert.equal(seed.scope.kind, "enclave");
    assert.equal(seed.scope.diagramEvidenceId, null);
    assert.deepEqual(seed.assets.map((a) => a.id), [
      "cad-ws",
      "mailbox",
      "idp",
      "firewall",
      "cnc-mill",
      "office-pcs",
      "visitor-wifi",
    ]);
    assert.equal(seed.assets.find((a) => a.id === "cnc-mill")?.category, "specialized");
    assert.deepEqual(seed.flows.map((f) => f.id), ["flow-cad-mail", "flow-mail-cad"]);
    assert.ok(seed.evidence.length > 0);
    assert.ok(seed.evidence.some((row) => row.id === "ev-stale-screenshot" && row.kind === "screenshot"));
    assert.ok(seed.evidence.some((row) => row.id === "ev-unmapped-policy" && Array.isArray(row.aoIds) && row.aoIds.length === 0));
  });

  it("stubs all 110 requirements MET except 3.2.3 and 3.4.9 NOT MET", () => {
    const seed = buildHarborPrecision();
    assert.equal(Object.keys(seed.determinations).length, 110);
    assert.equal(seed.catalogHash, meta.catalogSha256);
    for (const row of catalog) {
      const det = seed.determinations[row.reqId];
      assert.ok(det, row.reqId);
      const expected = row.reqId === "3.2.3" || row.reqId === "3.4.9" ? "not-met" : "met";
      assert.equal(det.finding, expected, row.reqId);
      assert.deepEqual(allAoFindings(det), row.objectives.map(() => expected), row.reqId);
      if (row.partialCredit?.kind === "fips") {
        assert.deepEqual(det.fipsOverlay, { enc: expected, fips: expected });
      }
    }
  });

  it("MET stubs with Harbor pointers roll up to MET; 1-pt gaps deduct; raw 108 Conditional", () => {
    const seed = buildHarborPrecision();
    assert.equal(storedFinding(req("3.2.3"), seed.determinations["3.2.3"], seed.evidence), "not-met");
    assert.equal(storedFinding(req("3.4.9"), seed.determinations["3.4.9"], seed.evidence), "not-met");
    assert.equal(storedFinding(req("3.1.1"), seed.determinations["3.1.1"], seed.evidence), "met");
    assert.equal(storedFinding(req("3.5.3"), seed.determinations["3.5.3"], seed.evidence), "met");
    assert.equal(storedFinding(req("3.13.11"), seed.determinations["3.13.11"], seed.evidence), "met");
    const result = scoreOf(seed);
    assert.equal(result.raw, 108);
    assert.equal(result.status, "conditional-l2-self");
    assert.equal(result.sspPresent, true);
    assert.deepEqual(
      result.deducted.map((row) => row.reqId).sort(),
      ["3.2.3", "3.4.9"],
    );
  });

  it("GET envelope helper returns { assessment, score } fields used by the API", () => {
    const assessment = buildHarborPrecision();
    const score = scoreOf(assessment);
    const envelope = { assessment, score };
    assert.equal(envelope.assessment.id, "asmt-harbor-precision-l2-self");
    assert.equal(envelope.score.raw, 108);
    assert.equal(envelope.score.max, 110);
    assert.equal(envelope.score.floor, -203);
    const src = fs.readFileSync(path.join(root, "server/index.mjs"), "utf8");
    assert.match(src, /res\.json\(\{\s*assessment: result\.package,\s*score:/);
    assert.equal(/app\.(get|post|put)\(\s*[`'"]\/api\/sprs/.test(src), false);
    assert.equal(/app\.(get|post|put)\(\s*[`'"]\/api\/affirm/.test(src), false);
  });

  it("N/A without justification is rejected; 3.12.4 N/A is rejected; justified 3.13.5 N/A saves", () => {
    assert.equal(applyNa(req("3.13.5"), "").ok, false);
    assert.equal(applyNa(req("3.13.5"), "").reject, "na-justification-required");
    assert.equal(applyNa(req("3.12.4"), "attempted").ok, false);
    assert.equal(applyNa(req("3.12.4"), "attempted").reject, "na-not-allowed");

    const missing = buildHarborPrecision();
    missing.determinations["3.13.5"] = {
      ...missing.determinations["3.13.5"],
      finding: "na",
      naJustification: "",
      objectives: missing.determinations["3.13.5"].objectives.map((ao) => ({ ...ao, finding: "na" })),
    };
    const missingHit = validateAssessment({ assessment: missing });
    assert.equal(missingHit.ok, false);
    assert.equal(missingHit.status, 400);
    assert.equal(missingHit.error, "na-justification-required");
    assert.equal(missingHit.reqId, "3.13.5");

    const cleared = guardNaWrite(req("3.13.5"), {
      ...okNaDraft(),
      finding: "na",
      naJustification: "   ",
      objectives: req("3.13.5").objectives.map((ao) => ({ aoId: ao.aoId, finding: "na" })),
    });
    assert.equal(cleared.ok, false);
    assert.equal(cleared.reject, "na-justification-required");
    assert.equal(guardNaWrite(req("3.1.1"), buildHarborPrecision().determinations["3.1.1"]).ok, true);

    const sspNa = buildHarborPrecision();
    sspNa.determinations["3.12.4"] = {
      ...sspNa.determinations["3.12.4"],
      finding: "na",
      naJustification: "trying to N/A the SSP",
      objectives: sspNa.determinations["3.12.4"].objectives.map((ao) => ({ ...ao, finding: "na" })),
    };
    const sspHit = validateAssessment({ assessment: sspNa });
    assert.equal(sspHit.ok, false);
    assert.equal(sspHit.error, "na-not-allowed");
    assert.equal(sspHit.reqId, "3.12.4");

    const okNa = buildHarborPrecision();
    okNa.determinations["3.13.5"] = {
      ...okNa.determinations["3.13.5"],
      finding: "na",
      naJustification: "No publicly accessible systems (sample).",
      objectives: okNa.determinations["3.13.5"].objectives.map((ao) => ({ ...ao, finding: "na" })),
    };
    const saved = validateAssessment({ assessment: okNa });
    assert.equal(saved.ok, true);
    assert.equal(saved.assessment.determinations["3.13.5"].naJustification.includes("publicly accessible"), true);
    assert.equal(guardNaWrite(req("3.13.5"), saved.assessment.determinations["3.13.5"]).ok, true);

    const ui = fs.readFileSync(path.join(root, "src/pages/Requirements.tsx"), "utf8");
    assert.match(ui, /allowNa=\{req\.naAllowed\}/);
    assert.equal(/\{ao\.aoId\} \[\{ao\.letter\}\]/.test(ui), false);
    const api = fs.readFileSync(path.join(root, "server/index.mjs"), "utf8");
    assert.match(api, /body\.reqId = checked\.reqId/);
  });

  it("flipping a MET-stub requirement to NOT MET changes the live score", () => {
    const seed = buildHarborPrecision();
    const before = scoreOf(seed);
    assert.equal(before.raw, 108);
    seed.determinations["3.1.1"] = {
      ...seed.determinations["3.1.1"],
      finding: "not-met",
      objectives: seed.determinations["3.1.1"].objectives.map((ao) => ({ ...ao, finding: "not-met" })),
    };
    const after = scoreOf(seed);
    assert.equal(after.raw, 103);
    assert.equal(
      after.deducted.some((row) => row.reqId === "3.1.1" && row.weight === 5),
      true,
    );
  });

  it("blockers.mjs concatenates score chips then scope chips", () => {
    const seed = buildHarborPrecision();
    const score = scoreOf(seed);
    const combined = combinedBlockers(seed, score);
    const scoreIds = score.blockers.map((b) => b.id);
    const scopeIds = scopeBlockers(seed).map((b) => b.id);
    assert.ok(scopeIds.length > 0);
    assert.deepEqual(
      combined.map((b) => b.id),
      [...scoreIds, ...scopeIds],
    );
    assert.equal(
      combined.some((b) => b.id === "ssp-missing"),
      false,
    );
    assert.equal(
      combined.some((b) => b.id === "not-reviewed"),
      false,
    );
    assert.ok(combined.some((b) => b.id === "missing-diagram"));
    const top = topBlockers(seed, score, 5);
    assert.ok(top.length <= 5);
    assert.ok(top.length > 0);
  });
});
