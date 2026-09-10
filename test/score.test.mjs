import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { poamGuard } from "../src/lib/poamGuard.mjs";
import {
  applyNa,
  deriveFipsAoFinding,
  storedFinding,
} from "../src/lib/rollup.mjs";
import {
  CatalogHashMismatch,
  derivePartialState,
  score,
} from "../src/lib/score.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "src/data/catalog.json");
const metaPath = path.join(root, "src/data/catalog.meta.json");
const catalogFile = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const catalog = catalogFile.requirements;
const CAPTURED = "2026-01-15T00:00:00Z";
const SSP_BODY = "Harbor Precision (fictional) system security plan body. SAMPLE only. Not CUI.";

function req(id) {
  return catalog.find((r) => r.reqId === id);
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

function evidenceFor(aoId) {
  return {
    id: `ev-${aoId}`,
    title: `Sample evidence ${aoId}`,
    kind: "policy",
    uri: `file:///sample/unclass/${aoId}.pdf`,
    capturedAt: CAPTURED,
    aoIds: [aoId],
    owner: "sample",
    draft: false,
    notes: "Unclassified pointer only.",
  };
}

function determinationFor(row, finding) {
  const det = {
    reqId: row.reqId,
    objectives: row.objectives.map((ao) => aoFinding(ao, finding)),
    naJustification: finding === "na" ? "No publicly accessible systems (sample)." : "",
    implementationStub: "sample",
    owner: "sample",
    enduringException: false,
    sspCitation: "",
    temporaryDeficiency: false,
  };
  if (row.partialCredit?.kind === "fips") {
    det.fipsOverlay = {
      enc: finding === "na" ? "na" : finding,
      fips: finding === "na" ? "na" : finding,
    };
  }
  return det;
}

function allMet() {
  const determinations = {};
  const evidence = [];
  for (const row of catalog) {
    determinations[row.reqId] = determinationFor(row, "met");
    for (const ao of row.objectives) evidence.push(evidenceFor(ao.aoId));
  }
  return {
    catalog,
    determinations,
    evidence,
    poams: [],
    operationalPoas: [],
    sspBody: SSP_BODY,
  };
}

function allNotMet() {
  const determinations = {};
  for (const row of catalog) determinations[row.reqId] = determinationFor(row, "not-met");
  return {
    catalog,
    determinations,
    evidence: [],
    poams: [],
    operationalPoas: [],
    sspBody: SSP_BODY,
  };
}

function setAo(input, reqId, letter, finding) {
  const row = req(reqId);
  const ao = row.objectives.find((o) => o.letter === letter);
  const det = input.determinations[reqId];
  det.objectives = det.objectives.map((o) => (o.aoId === ao.aoId ? { ...o, finding } : o));
}

function setAllAos(input, reqId, finding) {
  const det = input.determinations[reqId];
  det.objectives = det.objectives.map((o) => ({ ...o, finding }));
  if (finding === "na") det.naJustification = "Sample N/A justification.";
}

function setFips(input, overlay) {
  input.determinations["3.13.11"].fipsOverlay = overlay;
}

function dropEvidence(input, aoId) {
  input.evidence = input.evidence.filter((e) => !e.aoIds.includes(aoId));
}

function poamDraft(reqId) {
  return {
    id: `poam-${reqId}`,
    reqId,
    weakness: "sample gap",
    tasks: "sample task",
    owner: "sample",
    due: "2026-12-31",
    status: "open",
  };
}

function insertPoam(input, reqId, finding, partialState) {
  const result = poamGuard({
    req: req(reqId),
    finding,
    existingPoams: input.poams,
    item: poamDraft(reqId),
    partialState,
  });
  if (result.ok) input.poams.push(result.item);
  return result;
}

function findingOf(input, reqId) {
  return storedFinding(req(reqId), input.determinations[reqId], input.evidence, input.operationalPoas);
}

describe("score engine", () => {
  it("T1: all 110 MET with per-AO non-draft non-interview evidence, SSP present → raw 110, Final", () => {
    const input = allMet();
    const result = score(input);
    assert.equal(result.raw, 110);
    assert.equal(result.max, 110);
    assert.equal(result.floor, -203);
    assert.equal(result.status, "final-l2-self");
    assert.equal(result.sspPresent, true);
    assert.equal(result.deducted.length, 0);
    for (const row of catalog) {
      assert.equal(findingOf(input, row.reqId), "met", row.reqId);
    }
  });

  it("T2: all NOT MET, MFA none, FIPS none, SSP body present → raw −203, No CMMC Status", () => {
    const input = allNotMet();
    assert.equal(findingOf(input, "3.5.3"), "not-met");
    assert.equal(derivePartialState(req("3.5.3"), input.determinations["3.5.3"].objectives), "none-5");
    assert.equal(deriveFipsAoFinding(input.determinations["3.13.11"].fipsOverlay), "not-met");
    assert.equal(
      derivePartialState(req("3.13.11"), input.determinations["3.13.11"].objectives, { enc: "not-met", fips: "not-met" }),
      "none-5",
    );
    const result = score(input);
    assert.equal(result.raw, -203);
    assert.equal(result.status, "no-cmmc-status");
    assert.equal(result.sspPresent, true);
  });

  it("T3: only 3.2.3 NOT MET (1-pt), SSP present, POA&M filed → raw 109, Conditional", () => {
    const input = allMet();
    setAllAos(input, "3.2.3", "not-met");
    const inserted = insertPoam(input, "3.2.3", "not-met");
    assert.equal(inserted.ok, true);
    assert.equal(inserted.item.conditionalLegal, true);
    const result = score(input);
    assert.equal(findingOf(input, "3.2.3"), "not-met");
    assert.equal(result.raw, 109);
    assert.equal(result.status, "conditional-l2-self");
    assert.equal(result.conditionalEligible, true);
    assert.equal(result.poamLegal, true);
  });

  it("T4: 3.12.4 AOs unanswered or SSP empty → assessment-incomplete", () => {
    const unanswered = allMet();
    setAllAos(unanswered, "3.12.4", "not-reviewed");
    const a = score(unanswered);
    assert.equal(findingOf(unanswered, "3.12.4"), "not-reviewed");
    assert.equal(a.status, "assessment-incomplete");
    assert.equal(a.raw, 110);

    const emptySsp = allMet();
    emptySsp.sspBody = "   ";
    const b = score(emptySsp);
    assert.equal(b.sspPresent, false);
    assert.equal(b.status, "assessment-incomplete");
  });

  it("T5: 3.12.4 NOT MET (SSP body present, others MET) → raw 110, No CMMC Status", () => {
    const input = allMet();
    setAllAos(input, "3.12.4", "not-met");
    const inserted = insertPoam(input, "3.12.4", "not-met");
    assert.equal(inserted.ok, true);
    assert.equal(inserted.item.conditionalLegal, false);
    assert.equal(inserted.item.illegalCode, "banned-requirement");
    const result = score(input);
    assert.equal(findingOf(input, "3.12.4"), "not-met");
    assert.equal(result.raw, 110);
    assert.equal(result.status, "no-cmmc-status");
    assert.notEqual(result.status, "final-l2-self");
    assert.equal(result.conditionalEligible, false);
    assert.equal(
      result.deducted.some((row) => row.reqId === "3.12.4" && row.weight === 0),
      true,
    );
  });

  it("T6: 3.1.20 NOT MET POA&M inserted → saves, banned-requirement, not 400, No CMMC Status", () => {
    const input = allMet();
    setAllAos(input, "3.1.20", "not-met");
    const inserted = insertPoam(input, "3.1.20", "not-met");
    assert.equal(inserted.ok, true);
    assert.notEqual(inserted.reject, "requirement-is-met");
    assert.equal(inserted.item.conditionalLegal, false);
    assert.equal(inserted.item.illegalCode, "banned-requirement");
    const result = score(input);
    assert.equal(result.raw, 109);
    assert.equal(result.status, "no-cmmc-status");
  });

  it("T7: 3.13.11 encrypt-not-fips, score 107, POA&M filed → Conditional", () => {
    const input = allMet();
    setFips(input, { enc: "met", fips: "not-met" });
    assert.equal(deriveFipsAoFinding({ enc: "met", fips: "not-met" }), "not-met");
    assert.equal(findingOf(input, "3.13.11"), "not-met");
    const inserted = insertPoam(input, "3.13.11", "not-met", "partial-3");
    assert.equal(inserted.ok, true);
    assert.equal(inserted.item.conditionalLegal, true);
    const result = score(input);
    assert.equal(result.raw, 107);
    assert.equal(result.status, "conditional-l2-self");
    assert.equal(
      result.deducted.some((row) => row.reqId === "3.13.11" && row.weight === 3),
      true,
    );
  });

  it("T8: 3.13.11 none (enc=not-met), POA&M inserted → fips-exception-not-met, No CMMC Status", () => {
    const input = allMet();
    setFips(input, { enc: "not-met", fips: "not-met" });
    const inserted = insertPoam(input, "3.13.11", "not-met", "none-5");
    assert.equal(inserted.ok, true);
    assert.equal(inserted.item.conditionalLegal, false);
    assert.equal(inserted.item.illegalCode, "fips-exception-not-met");
    const result = score(input);
    assert.equal(result.raw, 105);
    assert.equal(result.status, "no-cmmc-status");
    assert.equal(
      result.deducted.some((row) => row.reqId === "3.13.11" && row.weight === 5),
      true,
    );
  });

  it("T9: 3.5.3 [a,b,c]=met, [d]=not-met → deduct 3, not 5", () => {
    const input = allMet();
    setAo(input, "3.5.3", "d", "not-met");
    const aos = input.determinations["3.5.3"].objectives;
    assert.equal(derivePartialState(req("3.5.3"), aos), "partial-3");
    const result = score(input);
    assert.equal(findingOf(input, "3.5.3"), "not-met");
    assert.equal(result.raw, 107);
    const row = result.deducted.find((d) => d.reqId === "3.5.3");
    assert.ok(row);
    assert.equal(row.weight, 3);
    assert.notEqual(row.weight, 5);
  });

  it("T10: requirement claimed MET with one AO not-reviewed → finding not-reviewed; MET refused", () => {
    const input = allMet();
    setAo(input, "3.1.1", "a", "not-reviewed");
    assert.equal(findingOf(input, "3.1.1"), "not-reviewed");
    const result = score(input);
    assert.equal(result.status, "assessment-incomplete");
    assert.equal(result.raw, 110);
    assert.equal(
      result.deducted.some((row) => row.reqId === "3.1.1"),
      false,
    );
  });

  it("T11: all AOs of 3.13.5 na + justification, all else MET → na, raw 110, Final", () => {
    const input = allMet();
    setAllAos(input, "3.13.5", "na");
    input.determinations["3.13.5"].naJustification = "No publicly accessible systems (sample).";
    assert.equal(applyNa(req("3.13.5"), input.determinations["3.13.5"].naJustification).ok, true);
    assert.equal(findingOf(input, "3.13.5"), "na");
    const result = score(input);
    assert.equal(result.raw, 110);
    assert.equal(result.status, "final-l2-self");
  });

  it("T12: N/A on 3.12.4 rejected (naAllowed false)", () => {
    assert.equal(req("3.12.4").naAllowed, false);
    const rejected = applyNa(req("3.12.4"), "attempted N/A");
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reject, "na-not-allowed");
    const input = allMet();
    setAllAos(input, "3.12.4", "na");
    assert.notEqual(findingOf(input, "3.12.4"), "na");
  });

  it("T18: 3.5.3 [b]=met, [c]=not-met, [d]=met → contradictory, deduct 5, warning, not MET", () => {
    const input = allMet();
    setAo(input, "3.5.3", "b", "met");
    setAo(input, "3.5.3", "c", "not-met");
    setAo(input, "3.5.3", "d", "met");
    assert.equal(derivePartialState(req("3.5.3"), input.determinations["3.5.3"].objectives), "contradictory");
    assert.equal(findingOf(input, "3.5.3"), "not-met");
    const result = score(input);
    const row = result.deducted.find((d) => d.reqId === "3.5.3");
    assert.ok(row);
    assert.equal(row.weight, 5);
    assert.equal(result.raw, 105);
    const warn = result.blockers.filter((b) => b.id === "mfa-contradictory");
    assert.equal(warn.length, 1);
    assert.equal(warn[0].severity, "warning");
  });

  it("T22: temporaryDeficiency true, no OperationalPoaItem → finding not met", () => {
    const input = allMet();
    input.determinations["3.2.3"].temporaryDeficiency = true;
    input.operationalPoas = [];
    assert.notEqual(findingOf(input, "3.2.3"), "met");
    assert.equal(findingOf(input, "3.2.3"), "not-met");
    const withPoa = allMet();
    withPoa.determinations["3.2.3"].temporaryDeficiency = true;
    withPoa.operationalPoas = [
      {
        id: "opoam-3.2.3",
        reqId: "3.2.3",
        deficiency: "sample temporary deficiency",
        progress: "in progress",
        reviewedAt: CAPTURED,
        owner: "sample",
      },
    ];
    assert.equal(findingOf(withPoa, "3.2.3"), "met");
  });

  it("T24: 110 - sum(fullFailWeights) === -203; objectives.length === expectedAoCount; zero overlay rows", () => {
    const sum = catalog.reduce((n, r) => n + r.weight, 0);
    assert.equal(110 - sum, -203);
    const n = catalog.flatMap((r) => r.objectives).length;
    assert.equal(n, meta.expectedAoCount);
    for (const row of catalog) {
      for (const ao of row.objectives) {
        assert.equal(["enc", "fips"].includes(ao.letter), false, ao.aoId);
        assert.equal(/\[(?:enc|fips)\]/i.test(ao.aoId), false, ao.aoId);
      }
    }
    assert.equal(req("3.13.11").objectives.length, 1);
    assert.equal(req("3.13.11").objectives[0].aoId, "3.13.11[a]");
  });

  it("T25: T7 setup; no evidence required on enc/fips; derived [a] is not-met; Conditional still", () => {
    const input = allMet();
    setFips(input, { enc: "met", fips: "not-met" });
    dropEvidence(input, "3.13.11[a]");
    input.evidence = input.evidence.filter((e) => !e.aoIds.some((id) => id === "enc" || id === "fips"));
    assert.equal(deriveFipsAoFinding({ enc: "met", fips: "not-met" }), "not-met");
    assert.equal(findingOf(input, "3.13.11"), "not-met");
    const inserted = insertPoam(input, "3.13.11", "not-met", "partial-3");
    assert.equal(inserted.ok, true);
    assert.equal(inserted.item.conditionalLegal, true);
    const result = score(input);
    assert.equal(result.raw, 107);
    assert.equal(result.status, "conditional-l2-self");
  });

  it("T17: catalog hash mismatch refuses score", () => {
    const input = allMet();
    input.catalogHash = "0".repeat(64);
    input.expectedCatalogHash = meta.catalogSha256;
    assert.throws(() => score(input), CatalogHashMismatch);
    input.catalogHash = meta.catalogSha256;
    assert.equal(score(input).status, "final-l2-self");
  });

  it("poamGuard rejects MET insert and duplicate req", () => {
    const input = allMet();
    const met = poamGuard({
      req: req("3.2.3"),
      finding: "met",
      existingPoams: [],
      item: poamDraft("3.2.3"),
    });
    assert.equal(met.ok, false);
    assert.equal(met.reject, "requirement-is-met");
    const first = insertPoam(input, "3.2.3", "not-met");
    assert.equal(first.ok, true);
    const dup = poamGuard({
      req: req("3.2.3"),
      finding: "not-met",
      existingPoams: input.poams,
      item: poamDraft("3.2.3"),
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.reject, "duplicate-req");
  });
});
