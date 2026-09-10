import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "src/data/catalog.json");
const metaPath = path.join(root, "src/data/catalog.meta.json");

const catalogBytes = fs.readFileSync(catalogPath);
const catalog = JSON.parse(catalogBytes.toString("utf8"));
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));

const BANNED = ["3.1.20", "3.1.22", "3.12.4", "3.10.3", "3.10.4", "3.10.5"];
const FAMILIES = new Set(["AC", "AT", "AU", "CM", "IA", "IR", "MA", "MP", "PS", "PE", "RA", "CA", "SC", "SI"]);
const CMMC_ID = /^(AC|AT|AU|CM|IA|IR|MA|MP|PS|PE|RA|CA|SC|SI)\.L2-(\d+\.\d+\.\d+)$/;
const REQ_ID = /^\d+\.\d+\.\d+$/;
const REV3_ID = /(?:^|\b)(?:0\d\.\d{2}\.\d{2}|\d+\.\d+\.\d+[a-z]|3\.\d+[a-z])/i;

function req(id) {
  return catalog.requirements.find((r) => r.reqId === id);
}

describe("catalog freeze", () => {
  it("has 110 requirements with unique reqId", () => {
    assert.equal(catalog.schemaVersion, 1);
    assert.equal(catalog.standard, "NIST-SP-800-171-R2");
    assert.equal(catalog.assessmentGuide, "NIST-SP-800-171A-2018-06");
    assert.equal(catalog.requirements.length, 110);
    const ids = catalog.requirements.map((r) => r.reqId);
    assert.equal(new Set(ids).size, 110);
    for (const id of ids) assert.match(id, REQ_ID);
  });

  it("banned-for-conditional cardinality is 6 and matches the frozen set", () => {
    const banned = catalog.requirements.filter((r) => r.poamBannedForConditional).map((r) => r.reqId);
    assert.equal(banned.length, 6);
    assert.deepEqual(new Set(banned), new Set(BANNED));
  });

  it("weight(3.12.4)===0 and naAllowed is false", () => {
    const ssp = req("3.12.4");
    assert.ok(ssp);
    assert.equal(ssp.weight, 0);
    assert.equal(ssp.naAllowed, false);
    assert.equal(ssp.poamBannedForConditional, true);
    assert.equal(ssp.cmmcId, "CA.L2-3.12.4");
  });

  it("has 51 one-pointers, 14 threes, 42 fives, 2 partial at 5, and one zero", () => {
    const weights = catalog.requirements.map((r) => r.weight);
    const ones = catalog.requirements.filter((r) => r.weight === 1);
    const threes = catalog.requirements.filter((r) => r.weight === 3);
    const fives = catalog.requirements.filter((r) => r.weight === 5 && !r.partialCredit);
    const partial = catalog.requirements.filter((r) => r.partialCredit);
    const zeros = catalog.requirements.filter((r) => r.weight === 0);
    assert.equal(ones.length, 51);
    assert.equal(threes.length, 14);
    assert.equal(fives.length, 42);
    assert.equal(partial.length, 2);
    assert.equal(zeros.length, 1);
    assert.equal(partial.every((r) => r.weight === 5), true);
    assert.deepEqual(
      new Set(partial.map((r) => r.reqId)),
      new Set(["3.5.3", "3.13.11"]),
    );
    assert.equal(weights.reduce((n, w) => n + w, 0), 313);
  });

  it("110 - sum(fullFailWeights with MFA/FIPS at 5) === -203", () => {
    const sum = catalog.requirements.reduce((n, r) => n + r.weight, 0);
    assert.equal(110 - sum, -203);
  });

  it("every requirement has ≥1 171A objective", () => {
    for (const r of catalog.requirements) {
      assert.ok(r.objectives.length >= 1, r.reqId);
      for (const ao of r.objectives) {
        assert.equal(ao.aoId, `${r.reqId}[${ao.letter}]`);
        assert.match(ao.letter, /^[a-z]$/);
        assert.equal(typeof ao.determineIf, "string");
        assert.ok(ao.determineIf.length > 0, ao.aoId);
        assert.equal(/^determine if:?\s*/i.test(ao.determineIf), false, ao.aoId);
      }
    }
  });

  it("objectives.flat().length === meta.expectedAoCount", () => {
    const n = catalog.requirements.flatMap((r) => r.objectives).length;
    assert.equal(typeof meta.expectedAoCount, "number");
    assert.equal(n, meta.expectedAoCount);
    assert.ok(meta.expectedAoCount >= 1);
  });

  it("has zero overlay rows in objectives[] (no enc/fips; 3.13.11 only [a])", () => {
    for (const r of catalog.requirements) {
      for (const ao of r.objectives) {
        assert.equal(["enc", "fips"].includes(ao.letter), false, ao.aoId);
        assert.equal(["enc", "fips"].includes(ao.aoId), false, ao.aoId);
        assert.equal(/\[(?:enc|fips)\]/i.test(ao.aoId), false, ao.aoId);
      }
    }
    const sc = req("3.13.11");
    assert.equal(sc.objectives.length, 1);
    assert.equal(sc.objectives[0].aoId, "3.13.11[a]");
    assert.equal(sc.objectives[0].letter, "a");
  });

  it("3.5.3 has four letters a-d; 3.13.11 partialCredit.overlayObjectives enc+fips", () => {
    const mfa = req("3.5.3");
    assert.ok(mfa.partialCredit);
    assert.equal(mfa.partialCredit.kind, "mfa");
    assert.deepEqual(
      mfa.objectives.map((ao) => ao.letter),
      ["a", "b", "c", "d"],
    );
    assert.deepEqual(mfa.partialCredit.states.allMet, ["a", "b", "c", "d"]);
    assert.deepEqual(mfa.partialCredit.states.partial.mustMet, ["a", "b", "c"]);
    assert.deepEqual(mfa.partialCredit.states.partial.mustNotMet, ["d"]);
    assert.equal(mfa.partialCredit.overlayObjectives, undefined);

    const fips = req("3.13.11");
    assert.ok(fips.partialCredit);
    assert.equal(fips.partialCredit.kind, "fips");
    const keys = fips.partialCredit.overlayObjectives.map((o) => o.key);
    assert.deepEqual(keys, ["enc", "fips"]);
    for (const overlay of fips.partialCredit.overlayObjectives) {
      assert.equal(typeof overlay.determineIf, "string");
      assert.ok(overlay.determineIf.length > 0);
    }
    assert.deepEqual(fips.partialCredit.states.allMet, ["enc", "fips"]);
    assert.deepEqual(fips.partialCredit.states.partial.mustMet, ["enc"]);
    assert.deepEqual(fips.partialCredit.states.partial.mustNotMet, ["fips"]);
  });

  it("sha256(catalog.json) matches meta.catalogSha256", () => {
    const digest = createHash("sha256").update(catalogBytes).digest("hex");
    assert.equal(digest, meta.catalogSha256);
    assert.match(meta.catalogSha256, /^[a-f0-9]{64}$/);
  });

  it("cmmcId format is FAMILY.L2-reqId", () => {
    for (const r of catalog.requirements) {
      const m = CMMC_ID.exec(r.cmmcId);
      assert.ok(m, r.cmmcId);
      assert.equal(m[1], r.family);
      assert.equal(m[2], r.reqId);
      assert.equal(FAMILIES.has(r.family), true, r.family);
    }
    assert.equal(req("3.5.1").cmmcId, "IA.L2-3.5.1");
    assert.match(catalog.comment, /IA\.L2-3\.5\.1/);
    assert.match(catalog.comment, /IA-L2-3\.5\.1/);
  });

  it("has no Rev 3 requirement IDs", () => {
    for (const r of catalog.requirements) {
      assert.equal(REV3_ID.test(r.reqId), false, r.reqId);
      assert.equal(/\d+\.\d+\.\d+[a-z]/.test(r.reqId), false, r.reqId);
      assert.equal(/^0/.test(r.reqId), false, r.reqId);
      assert.equal(r.reqId.split(".").length, 3);
    }
    assert.equal(catalog.standard.includes("R3"), false);
    assert.equal(catalog.assessmentGuide.includes("r3"), false);
    assert.equal(catalog.assessmentGuide.includes("R3"), false);
  });
});
