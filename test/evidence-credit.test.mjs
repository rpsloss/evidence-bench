import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { validateAssessment } from "../server/assessment.mjs";
import { buildHarborPrecision } from "../src/data/harbor-precision.mjs";
import {
  cuiFilenameRisk,
  evidenceCoversAo,
  evidenceGapBoard,
  filter171AAoIds,
  storedFinding,
} from "../src/lib/rollup.mjs";
import { score } from "../src/lib/score.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogFile = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.json"), "utf8"));
const catalog = catalogFile.requirements;
const CAPTURED = "2026-08-01T00:00:00Z";
const GAP_NOW = Date.parse("2026-09-09T00:00:00Z");
const SSP_BODY = "Harbor Precision (fictional) system security plan body. SAMPLE only. Not CUI.";
const NOT_MET_SEED = new Set(["3.2.3", "3.4.9"]);

function req(id) {
  return catalog.find((row) => row.reqId === id);
}

function aoFinding(ao, finding) {
  return {
    aoId: ao.aoId,
    finding,
    rationale: "sample",
    evidenceIds: [],
    assessedAt: CAPTURED,
    assessedBy: "sample",
  };
}

function determinationFor(row, finding) {
  const det = {
    reqId: row.reqId,
    objectives: row.objectives.map((ao) => aoFinding(ao, finding)),
    naJustification: "",
    implementationStub: "sample",
    owner: "sample",
    enduringException: false,
    sspCitation: "",
    temporaryDeficiency: false,
  };
  if (row.partialCredit?.kind === "fips") {
    det.fipsOverlay = { enc: finding, fips: finding };
  }
  return det;
}

function pointer(row, extra = {}) {
  return {
    id: `ev-${row.reqId}`,
    title: `Sample ${row.cmmcId} policy`,
    kind: "policy",
    uri: `file:///unclass/sample/${row.reqId}-policy.pdf`,
    sha256: "a".repeat(64),
    capturedAt: CAPTURED,
    aoIds: row.objectives.map((ao) => ao.aoId),
    owner: "sample",
    draft: false,
    notes: "Unclassified pointer only.",
    ...extra,
  };
}

function allMetOne(reqId) {
  const row = req(reqId);
  const determinations = {};
  for (const r of catalog) determinations[r.reqId] = determinationFor(r, "not-reviewed");
  determinations[reqId] = determinationFor(row, "met");
  return {
    catalog,
    determinations,
    evidence: [pointer(row)],
    poams: [],
    operationalPoas: [],
    sspBody: SSP_BODY,
  };
}

function findingOf(input, reqId) {
  return storedFinding(req(reqId), input.determinations[reqId], input.evidence, input.operationalPoas);
}

describe("evidence credit (T13 T14 T19 T20)", () => {
  it("T13: all AOs met, only draft evidence → not-reviewed; incomplete; no deduct", () => {
    const input = allMetOne("3.1.1");
    input.evidence = [pointer(req("3.1.1"), { draft: true })];
    assert.equal(findingOf(input, "3.1.1"), "not-reviewed");
    const result = score(input);
    assert.equal(result.status, "assessment-incomplete");
    assert.equal(
      result.deducted.some((row) => row.reqId === "3.1.1"),
      false,
    );
    assert.notEqual(findingOf(input, "3.1.1"), "met");
  });

  it("T13-style: draft-only mapped pointer never exports as MET", () => {
    const input = allMetOne("3.1.2");
    input.evidence = [
      pointer(req("3.1.2"), { draft: true, id: "ev-draft-only", kind: "policy" }),
    ];
    assert.equal(findingOf(input, "3.1.2"), "not-reviewed");
    assert.equal(score(input).status, "assessment-incomplete");
  });

  it("T14: empty aoIds on an otherwise-met requirement is an unmapped gap, not credit", () => {
    const input = allMetOne("3.1.1");
    input.evidence = [pointer(req("3.1.1"), { aoIds: [] })];
    assert.equal(findingOf(input, "3.1.1"), "not-reviewed");
    const gaps = evidenceGapBoard(catalog, input.determinations, input.evidence, GAP_NOW);
    assert.equal(gaps.unmapped.length, 1);
    assert.equal(gaps.unmapped[0].aoIds.length, 0);
    assert.ok(gaps.missing.some((row) => row.aoId === "3.1.1[a]"));
  });

  it("T19: zero evidence, all AOs marked met → not-reviewed; incomplete", () => {
    const input = allMetOne("3.1.1");
    input.evidence = [];
    assert.equal(findingOf(input, "3.1.1"), "not-reviewed");
    const result = score(input);
    assert.equal(result.status, "assessment-incomplete");
    assert.equal(
      result.deducted.some((row) => row.reqId === "3.1.1"),
      false,
    );
  });

  it("T20: one non-draft policy mapped to every AO of one requirement → MET allowed", () => {
    const row = req("3.1.1");
    const input = allMetOne("3.1.1");
    input.evidence = [pointer(row)];
    assert.equal(input.evidence.length, 1);
    assert.deepEqual(input.evidence[0].aoIds, row.objectives.map((ao) => ao.aoId));
    assert.equal(input.evidence[0].draft, false);
    assert.equal(findingOf(input, "3.1.1"), "met");
  });

  it("T13-style: interview-only mapped pointer → not-reviewed and Missing", () => {
    const row = req("3.1.1");
    const input = allMetOne("3.1.1");
    input.evidence = [pointer(row, { kind: "interview" })];
    assert.equal(findingOf(input, "3.1.1"), "not-reviewed");
    const gaps = evidenceGapBoard(catalog, input.determinations, input.evidence, GAP_NOW);
    for (const ao of row.objectives) {
      assert.equal(evidenceCoversAo(input.evidence[0], ao.aoId), false, ao.aoId);
      assert.ok(gaps.missing.some((g) => g.aoId === ao.aoId), ao.aoId);
    }
  });

  it("placeholder URI does not cover MET AOs", () => {
    const input = allMetOne("3.1.1");
    input.evidence = [pointer(req("3.1.1"), { uri: "file:///unclass/sample/", draft: false })];
    assert.equal(findingOf(input, "3.1.1"), "not-reviewed");
    const gaps = evidenceGapBoard(catalog, input.determinations, input.evidence, GAP_NOW);
    assert.ok(gaps.missing.some((g) => g.aoId === "3.1.1[a]"));
  });

  it("Harbor MET AOs pass the evidence gate except 3.2.3 and 3.4.9; raw 108 incomplete", () => {
    const seed = buildHarborPrecision();
    for (const row of catalog) {
      const finding = storedFinding(row, seed.determinations[row.reqId], seed.evidence);
      if (NOT_MET_SEED.has(row.reqId)) {
        assert.equal(finding, "not-met", row.reqId);
      } else {
        assert.equal(finding, "met", row.reqId);
      }
    }
    const result = score({
      catalog,
      determinations: seed.determinations,
      evidence: seed.evidence,
      poams: seed.poams,
      operationalPoas: seed.operationalPoas,
      sspBody: "",
    });
    assert.equal(result.raw, 108);
    assert.equal(result.status, "assessment-incomplete");
    assert.equal(result.sspPresent, false);
    assert.deepEqual(
      result.deducted.map((row) => row.reqId).sort(),
      ["3.2.3", "3.4.9"],
    );
  });

  it("Harbor seed has per-MET-AO pointers, one stale screenshot, one unmapped policy", () => {
    const seed = buildHarborPrecision();
    const metAoIds = new Set();
    for (const row of catalog) {
      if (NOT_MET_SEED.has(row.reqId)) continue;
      for (const ao of row.objectives) metAoIds.add(ao.aoId);
    }
    const covered = new Set();
    for (const item of seed.evidence) {
      if (item.draft === true) continue;
      if (item.kind === "interview") continue;
      for (const aoId of item.aoIds || []) covered.add(aoId);
    }
    for (const aoId of metAoIds) {
      assert.equal(covered.has(aoId), true, aoId);
    }
    const gaps = evidenceGapBoard(catalog, seed.determinations, seed.evidence, GAP_NOW);
    assert.equal(gaps.missing.length, 0);
    assert.equal(gaps.unmapped.length, 1);
    assert.equal(gaps.unmapped[0].kind, "policy");
    assert.equal(gaps.unmapped[0].aoIds.length, 0);
    assert.equal(gaps.stale.length, 1);
    assert.equal(gaps.stale[0].kind, "screenshot");
    assert.ok(gaps.missingSha256.some((row) => row.id === "ev-unmapped-policy"));
    for (const item of seed.evidence) {
      assert.equal(/^file:\/\//.test(item.uri), true, item.uri);
      assert.equal(cuiFilenameRisk(item.uri), false, item.uri);
      assert.equal(Object.prototype.hasOwnProperty.call(item, "storedName"), false);
    }
  });

  it("filter171AAoIds drops overlay keys and unknown ids", () => {
    const kept = filter171AAoIds(["3.1.1[a]", "enc", "fips", "3.13.11[a]", "not-an-ao"], catalog);
    assert.deepEqual(kept, ["3.1.1[a]", "3.13.11[a]"]);
  });

  it("PUT still rejects storedName on evidence and does not 400 unmapped rows", () => {
    const seed = buildHarborPrecision();
    const rejected = validateAssessment({
      assessment: { ...seed, evidence: [{ ...seed.evidence[0], storedName: "blob.bin" }] },
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error, "storedName-not-allowed");

    const unmapped = validateAssessment({ assessment: seed });
    assert.equal(unmapped.ok, true);
    assert.ok(unmapped.assessment.evidence.some((row) => row.id === "ev-unmapped-policy"));
  });

  it("PUT filters aoIds to 171A and still saves empty aoIds", () => {
    const seed = buildHarborPrecision();
    const saved = validateAssessment({
      assessment: {
        ...seed,
        evidence: [
          {
            id: "ev-overlay-keys",
            title: "sample",
            kind: "policy",
            uri: "file:///unclass/sample/harbor/overlay.pdf",
            capturedAt: CAPTURED,
            aoIds: ["enc", "fips", "3.1.1[a]"],
            owner: "sample",
            draft: false,
            notes: "Unclassified pointer only.",
          },
          {
            id: "ev-empty-aos",
            title: "unmapped",
            kind: "policy",
            uri: "file:///unclass/sample/harbor/empty.pdf",
            capturedAt: CAPTURED,
            aoIds: [],
            owner: "sample",
            draft: false,
            notes: "Unclassified pointer only.",
          },
        ],
      },
    });
    assert.equal(saved.ok, true);
    const overlay = saved.assessment.evidence.find((row) => row.id === "ev-overlay-keys");
    assert.deepEqual(overlay.aoIds, ["3.1.1[a]"]);
    const empty = saved.assessment.evidence.find((row) => row.id === "ev-empty-aos");
    assert.deepEqual(empty.aoIds, []);
  });

  it("Evidence UI is hash-only: no upload, no storedName, no FormData", () => {
    const ui = fs.readFileSync(path.join(root, "src/pages/Evidence.tsx"), "utf8");
    assert.match(ui, /crypto\.subtle\.digest/);
    assert.match(ui, /type="file"/);
    assert.match(ui, /Hash-only picker/);
    assert.match(ui, /draft:\s*true/);
    assert.equal(/\bFormData\b/.test(ui), false);
    assert.equal(/storedName\s*=/.test(ui), false);
    assert.equal(/\bmulter\b/.test(ui), false);
    assert.equal(/\bdropzone\b/i.test(ui), false);
    assert.equal(/\/api\/.*upload/.test(ui), false);
    const harbor = fs.readFileSync(path.join(root, "src/data/harbor-precision.mjs"), "utf8");
    assert.equal(/\bnode:crypto\b/.test(harbor), false);
  });
});
