import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildHarborPrecision } from "../src/data/harbor-precision.mjs";
import { scopeBlockers } from "../src/lib/scope.mjs";
import { score, scoreFromAssessment, sspBodyOf } from "../src/lib/score.mjs";
import {
  generateSspOutline,
  scopeGraphHash,
  SSP_CORE_KEYS,
  sspWarnings,
} from "../src/lib/sspGenerate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogFile = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.json"), "utf8"));
const meta = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.meta.json"), "utf8"));
const catalog = catalogFile.requirements;
const CAPTURED = "2026-01-15T00:00:00Z";

function req(id) {
  return catalog.find((row) => row.reqId === id);
}

function scoreOf(assessment) {
  return scoreFromAssessment(assessment, catalog, meta.catalogSha256);
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

function allMetScoreInput() {
  const determinations = {};
  const evidence = [];
  for (const row of catalog) {
    determinations[row.reqId] = {
      reqId: row.reqId,
      objectives: row.objectives.map((ao) => aoFinding(ao, "met")),
      naJustification: "",
      implementationStub: "sample",
      owner: "sample",
      enduringException: false,
      sspCitation: "",
      temporaryDeficiency: false,
      ...(row.partialCredit?.kind === "fips" ? { fipsOverlay: { enc: "met", fips: "met" } } : {}),
    };
    for (const ao of row.objectives) evidence.push(evidenceFor(ao.aoId));
  }
  return { catalog, determinations, evidence, poams: [], operationalPoas: [] };
}

describe("SSP outline + 3.12.4 incomplete gate", () => {
  it("builds purpose, boundary, environment, cui-flows, roles, inheritance-esp, and req:* stubs", () => {
    const seed = buildHarborPrecision();
    const keys = seed.ssp.map((row) => row.key);
    assert.deepEqual(keys.slice(0, SSP_CORE_KEYS.length), [...SSP_CORE_KEYS]);
    assert.equal(seed.ssp.length, 6 + 110);
    assert.equal(
      seed.ssp.filter((row) => String(row.key).startsWith("req:")).length,
      110,
    );
    const gate = seed.ssp.find((row) => row.key === "req:3.12.4");
    assert.ok(gate);
    assert.match(gate.title, /3\.12\.4/);
    assert.ok(String(gate.body).trim().length > 0);
    assert.equal(gate.generatedFrom, scopeGraphHash(seed));
    assert.match(seed.ssp.find((row) => row.key === "inheritance-esp").body, /N\/A: no ESP/);
    assert.match(seed.ssp.find((row) => row.key === "boundary").body, /CAD workstation/);
  });

  it("empty 3.12.4 SSP body ⇒ sspPresent false ⇒ assessment-incomplete", () => {
    const filled = allMetScoreInput();
    const withBody = score({ ...filled, sspBody: "Harbor Precision (fictional) SSP body. SAMPLE only." });
    assert.equal(withBody.sspPresent, true);
    assert.equal(withBody.status, "final-l2-self");

    const empty = score({ ...filled, sspBody: "   " });
    assert.equal(empty.sspPresent, false);
    assert.equal(empty.status, "assessment-incomplete");
    assert.notEqual(empty.status, "final-l2-self");
    assert.ok(empty.blockers.some((row) => row.id === "ssp-missing"));

    const seed = buildHarborPrecision();
    const gate = seed.ssp.find((row) => row.key === "req:3.12.4");
    assert.ok(String(gate.body).trim());
    gate.body = "  ";
    assert.ok(seed.ssp.some((row) => row.key !== "req:3.12.4" && String(row.body).trim()));
    assert.equal(sspBodyOf(seed).trim(), "");
    const cleared = scoreOf(seed);
    assert.equal(cleared.sspPresent, false);
    assert.equal(cleared.status, "assessment-incomplete");
    assert.ok(cleared.blockers.some((row) => row.id === "ssp-missing"));
  });

  it("present 3.12.4 body does not by itself make Final", () => {
    const seed = buildHarborPrecision();
    const result = scoreOf(seed);
    assert.equal(result.sspPresent, true);
    assert.notEqual(result.status, "final-l2-self");
    assert.equal(result.status, "assessment-incomplete");
    assert.equal(result.raw, 108);
    assert.ok(req("3.12.4"));
  });

  it("warns when generatedFrom !== hash(scope+assets+flows) and does not NLP-compare stub text", () => {
    const seed = buildHarborPrecision();
    const hash = scopeGraphHash(seed);
    assert.equal(
      sspWarnings(seed).some((row) => row.id === "ssp-stale"),
      false,
    );
    const boundary = seed.ssp.find((row) => row.key === "boundary");
    boundary.body =
      "This text claims the mill is on a CUI flow, which contradicts the Harbor isolation summary.";
    assert.equal(scopeGraphHash(seed), hash);
    assert.equal(boundary.generatedFrom, hash);
    assert.equal(
      sspWarnings(seed).some((row) => row.id === "ssp-stale"),
      false,
    );

    seed.scope = { ...seed.scope, narrative: `${seed.scope.narrative} (edited)` };
    const stale = sspWarnings(seed);
    const hit = stale.find((row) => row.id === "ssp-stale");
    assert.ok(hit);
    assert.equal(hit.severity, "warning");
    assert.match(hit.detail, /SSP boundary stub is stale; regenerate or edit/);
    assert.notEqual(scopeGraphHash(seed), hash);

    seed.ssp = generateSspOutline(seed);
    assert.equal(
      sspWarnings(seed).some((row) => row.id === "ssp-stale"),
      false,
    );
  });

  it("treats an empty SSP boundary body as a warning, not a score fail-closed", () => {
    const seed = buildHarborPrecision();
    const boundary = seed.ssp.find((row) => row.key === "boundary");
    boundary.body = " ";
    const warnings = sspWarnings(seed);
    assert.ok(warnings.some((row) => row.id === "empty-ssp-boundary" && row.severity === "warning"));
    assert.equal(scoreOf(seed).sspPresent, true);
    assert.equal(scoreOf(seed).status, "assessment-incomplete");
  });

  it("keeps missing diagram / empty scope narrative as warnings; hard blockers stay graph-only", () => {
    const seed = buildHarborPrecision();
    const blockers = scopeBlockers(seed);
    assert.equal(
      blockers.some((row) => row.severity === "blocker"),
      false,
    );
    assert.equal(blockers.find((row) => row.id === "missing-diagram")?.severity, "warning");

    const emptyNarrative = scopeBlockers({
      ...seed,
      scope: { ...seed.scope, narrative: "  " },
    });
    const boundary = emptyNarrative.find((row) => row.id === "empty-boundary");
    assert.ok(boundary);
    assert.equal(boundary.severity, "warning");
  });
});
