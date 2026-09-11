#!/usr/bin/env node
/**
 * Assemble frozen l1-catalog.json from the L2 171A freeze + 32 CFR 170.15 mapping.
 * 15 FAR 52.204-21 rows → 17 mapped 171 IDs. CUI in objectives is substituted with FCI.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendor = path.join(root, "scripts/vendor");
const l2Catalog = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.json"), "utf8"));
const far = JSON.parse(fs.readFileSync(path.join(vendor, "cmmc-l1-far.json"), "utf8"));
const outCatalog = path.join(root, "src/data/l1-catalog.json");
const outMeta = path.join(root, "src/data/l1-catalog.meta.json");

const by171 = new Map(l2Catalog.requirements.map((row) => [row.reqId, row]));

function fciSubstitute(text) {
  return String(text || "")
    .replace(/Controlled Unclassified Information/gi, "Federal Contract Information")
    .replace(/\bCUI\b/g, "FCI");
}

const requirements = [];
for (const row of far.requirements) {
  const mapped = row.mappedReqIds || [];
  if (mapped.length === 0) throw new Error(`no mappedReqIds for ${row.cmmcId}`);
  mapped.forEach((reqId, index) => {
    const src = by171.get(reqId);
    if (!src) throw new Error(`L2 catalog missing mapped ${reqId} for ${row.cmmcId}`);
    const phrase = Array.isArray(row.phraseLabels) ? row.phraseLabels[index] : null;
    const objectives = src.objectives.map((ao) => ({
      aoId: ao.aoId,
      letter: ao.letter,
      determineIf: fciSubstitute(ao.determineIf),
    }));
    requirements.push({
      cmmcId: row.cmmcId,
      reqId,
      family: row.family,
      title: src.title,
      statement: fciSubstitute(phrase ? `${row.statement} (${phrase}.)` : row.statement),
      farParagraph: row.farParagraph,
      farPhrase: mapped.length > 1 ? index + 1 : null,
      mappedReqIds: mapped,
      basicOrDerived: "basic",
      weight: 0,
      poamAllowed: false,
      poamBannedForConditional: true,
      naAllowed: true,
      objectives,
    });
  });
}

if (far.requirements.length !== 15) {
  throw new Error(`expected 15 FAR rows, got ${far.requirements.length}`);
}
if (requirements.length !== 17) {
  throw new Error(`expected 17 mapped 171 rows, got ${requirements.length}`);
}

const catalog = {
  schemaVersion: 1,
  standard: "CMMC-L1-FAR-52.204-21",
  assessmentGuide: "NIST-SP-800-171A-2018-06",
  mapping: "32-CFR-170.15-table-2",
  comment:
    "CMMC Level 1 (Self) freeze. 15 FAR 52.204-21(b)(1)(i)–(xv) security requirements map to 17 NIST SP 800-171 R2 IDs. PE.L1-b.1.ix is one FAR requirement assessed as 3.10.3, 3.10.4, and 3.10.5. Objectives are PDF-pure 171A with FCI substituted for CUI per 32 CFR 170.15(c)(1)(i). No POA&M. Not a SPRS submission.",
  requirements,
};

const catalogJson = `${JSON.stringify(catalog, null, 2)}\n`;
fs.writeFileSync(outCatalog, catalogJson);

const expectedAoCount = requirements.reduce((n, r) => n + r.objectives.length, 0);
const catalogSha256 = createHash("sha256").update(catalogJson).digest("hex");

const meta = {
  schemaVersion: 1,
  standard: "CMMC-L1-FAR-52.204-21",
  assessmentGuide: "NIST-SP-800-171A-2018-06",
  mapping: "32-CFR-170.15-table-2",
  retrievalDate: "2026-09-11",
  expectedRequirementCount: 15,
  expectedMapped171Count: 17,
  expectedAoCount,
  catalogSha256,
  comment:
    "Level 1 freeze. 15 unique cmmcIds, 17 unique reqIds, 59 171A objectives. FCI substituted for CUI. POA&M is never permitted.",
  sources: [
    {
      title: "48 CFR 52.204-21 Basic Safeguarding of Covered Contractor Information Systems (NOV 2021)",
      url: "https://www.ecfr.gov/current/title-48/section-52.204-21",
      role: "15 FAR (b)(1)(i)–(xv) requirement statements",
    },
    {
      title: "32 CFR 170.15 CMMC Level 1 self-assessment and affirmation requirements",
      url: "https://www.ecfr.gov/current/title-32/section-170.15",
      role: "mapping table to 171A; FCI-for-CUI substitution; no POA&M; annual self-assessment",
    },
    {
      title: "32 CFR 170.14 CMMC Model",
      url: "https://www.ecfr.gov/current/title-32/section-170.14",
      role: "Level 1 IDs are 48 CFR 52.204-21(b)(1)(i) through (xv)",
    },
    {
      title: "Evidence Bench L2 catalog.json (NIST SP 800-171A June 2018 freeze)",
      url: "src/data/catalog.json",
      role: "PDF-pure determine-if statements reused for the 17 mapped IDs",
    },
  ],
};

fs.writeFileSync(outMeta, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`l1-catalog.json ${requirements.length} rows, ${expectedAoCount} AOs, sha256 ${catalogSha256}`);
