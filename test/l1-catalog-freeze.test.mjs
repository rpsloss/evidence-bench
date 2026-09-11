import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "src/data/l1-catalog.json");
const metaPath = path.join(root, "src/data/l1-catalog.meta.json");
const catalogBytes = fs.readFileSync(catalogPath);
const catalog = JSON.parse(catalogBytes.toString("utf8"));
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));

const MAPPED = [
  "3.1.1",
  "3.1.2",
  "3.1.20",
  "3.1.22",
  "3.5.1",
  "3.5.2",
  "3.8.3",
  "3.10.1",
  "3.10.3",
  "3.10.4",
  "3.10.5",
  "3.13.1",
  "3.13.5",
  "3.14.1",
  "3.14.2",
  "3.14.4",
  "3.14.5",
];

const CMMC_ID = /^(AC|IA|MP|PE|SC|SI)\.L1-b\.1\.(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv)$/;

describe("L1 catalog freeze", () => {
  it("has 15 FAR CMMC IDs mapped to 17 unique 171 IDs and 59 objectives", () => {
    assert.equal(catalog.schemaVersion, 1);
    assert.equal(catalog.standard, "CMMC-L1-FAR-52.204-21");
    assert.equal(catalog.mapping, "32-CFR-170.15-table-2");
    assert.equal(catalog.requirements.length, 17);
    const cmmc = catalog.requirements.map((r) => r.cmmcId);
    const reqIds = catalog.requirements.map((r) => r.reqId);
    assert.equal(new Set(cmmc).size, 15);
    assert.equal(new Set(reqIds).size, 17);
    assert.deepEqual([...new Set(reqIds)].sort(), [...MAPPED].sort());
    const aos = catalog.requirements.reduce((n, r) => n + r.objectives.length, 0);
    assert.equal(aos, 59);
    assert.equal(meta.expectedAoCount, 59);
    assert.equal(meta.expectedRequirementCount, 15);
    assert.equal(meta.expectedMapped171Count, 17);
  });

  it("uses official CMMC L1 IDs and freezes sha256", () => {
    for (const row of catalog.requirements) {
      assert.match(row.cmmcId, CMMC_ID);
      assert.equal(row.poamAllowed, false);
      assert.equal(row.poamBannedForConditional, true);
      assert.equal(row.weight, 0);
      assert.ok(row.objectives.length >= 1, row.reqId);
    }
    const ix = catalog.requirements.filter((r) => r.cmmcId === "PE.L1-b.1.ix");
    assert.deepEqual(
      ix.map((r) => r.reqId),
      ["3.10.3", "3.10.4", "3.10.5"],
    );
    const digest = createHash("sha256").update(catalogBytes).digest("hex");
    assert.equal(digest, meta.catalogSha256);
  });

  it("substitutes FCI for CUI in Level 1 objectives", () => {
    const blob = JSON.stringify(catalog.requirements);
    assert.equal(/\bCUI\b/.test(blob), false);
    const media = catalog.requirements.find((r) => r.reqId === "3.8.3");
    assert.match(media.statement, /Federal Contract Information|FCI/);
    assert.equal(media.objectives.every((ao) => !/\bCUI\b/.test(ao.determineIf)), true);
    const publicInfo = catalog.requirements.find((r) => r.reqId === "3.1.22");
    assert.equal(publicInfo.objectives.some((ao) => /\bFCI\b/.test(ao.determineIf)), true);
  });

  it("does not carry MFA or FIPS overlays", () => {
    assert.equal(
      catalog.requirements.every((row) => !row.partialCredit),
      true,
    );
    assert.equal(
      catalog.requirements.some((row) => row.reqId === "3.5.3" || row.reqId === "3.13.11"),
      false,
    );
  });
});
