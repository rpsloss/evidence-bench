import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildHarborPrecision } from "../src/data/harbor-precision.mjs";
import { l1FamilyProgress, l1ScoreFromAssessment, nextL1Action } from "../src/lib/l1Score.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const l1 = JSON.parse(fs.readFileSync(path.join(root, "src/data/l1-catalog.json"), "utf8")).requirements;

function wipeReq(seed, reqId) {
  const src = l1.find((row) => row.reqId === reqId);
  const determinations = {
    ...seed.determinations,
    [reqId]: {
      ...seed.determinations[reqId],
      finding: "not-reviewed",
      objectives: src.objectives.map((ao) => ({
        aoId: ao.aoId,
        finding: "not-reviewed",
        rationale: "",
        evidenceIds: [],
      })),
    },
  };
  return { ...seed, determinations };
}

function failReq(seed, reqId) {
  const src = l1.find((row) => row.reqId === reqId);
  const determinations = {
    ...seed.determinations,
    [reqId]: {
      ...seed.determinations[reqId],
      finding: "not-met",
      objectives: src.objectives.map((ao) => ({
        aoId: ao.aoId,
        finding: "not-met",
        rationale: "L1 gap (sample)",
        evidenceIds: [],
      })),
    },
  };
  return { ...seed, determinations };
}

describe("L1 pass/fail score", () => {
  it("Harbor seed is Final Level 1 (Self) because every mapped 171 row is MET", () => {
    const seed = buildHarborPrecision();
    const score = l1ScoreFromAssessment(seed);
    assert.equal(score.total, 15);
    assert.equal(score.met, 15);
    assert.equal(score.unanswered, 0);
    assert.equal(score.notMet, 0);
    assert.equal(score.status, "final-l1-self");
    assert.equal(score.complianceResult, "MET");
    assert.equal(score.poamPermitted, false);
    const board = l1FamilyProgress(seed);
    assert.equal(board.length, 6);
    assert.equal(board.every((row) => row.completion === "present"), true);
    assert.match(nextL1Action(seed).title, /Level 1 SPRS pack next/);
  });

  it("unanswered mapped AO makes the engagement incomplete, not Conditional", () => {
    const seed = wipeReq(buildHarborPrecision(), "3.1.1");
    const score = l1ScoreFromAssessment(seed);
    assert.equal(score.status, "assessment-incomplete");
    assert.equal(score.complianceResult, null);
    assert.equal(score.unanswered, 1);
    assert.equal(score.met, 14);
    const ac = l1FamilyProgress(seed).find((row) => row.family === "AC");
    assert.equal(ac.completion, "partial");
    assert.match(nextL1Action(seed).title, /Resume AC/);
  });

  it("NOT MET is pass-fail; PE.L1-b.1.ix fails if any of the three phrases is NOT MET", () => {
    const one = failReq(buildHarborPrecision(), "3.1.20");
    const score = l1ScoreFromAssessment(one);
    assert.equal(score.status, "not-met");
    assert.equal(score.complianceResult, "NOT MET");
    assert.equal(score.notMet, 1);
    assert.equal(score.poamPermitted, false);

    const phrase = failReq(buildHarborPrecision(), "3.10.4");
    const ix = l1ScoreFromAssessment(phrase);
    assert.equal(ix.status, "not-met");
    const pe = l1FamilyProgress(phrase).find((row) => row.family === "PE");
    assert.equal(pe.completion, "gapped");
    assert.match(nextL1Action(phrase).detail, /POA&M is not permitted/);
  });
});
