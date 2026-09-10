#!/usr/bin/env node
/**
 * Assemble frozen catalog.json from extracted NIST 171/171A text + 32 CFR 170.24 weights.
 * PDF-pure 171A objectives. Overlay keys enc/fips are not catalog objectives.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendor = path.join(root, "scripts/vendor");
const outCatalog = path.join(root, "src/data/catalog.json");
const outMeta = path.join(root, "src/data/catalog.meta.json");

const FAMILY_BY_CHAPTER = {
  "3.1": "AC",
  "3.2": "AT",
  "3.3": "AU",
  "3.4": "CM",
  "3.5": "IA",
  "3.6": "IR",
  "3.7": "MA",
  "3.8": "MP",
  "3.9": "PS",
  "3.10": "PE",
  "3.11": "RA",
  "3.12": "CA",
  "3.13": "SC",
  "3.14": "SI",
};

const WEIGHT_5 = new Set([
  "3.1.1",
  "3.1.2",
  "3.2.1",
  "3.2.2",
  "3.3.1",
  "3.4.1",
  "3.4.2",
  "3.5.1",
  "3.5.2",
  "3.6.1",
  "3.6.2",
  "3.7.2",
  "3.8.3",
  "3.9.2",
  "3.10.1",
  "3.10.2",
  "3.12.1",
  "3.12.3",
  "3.13.1",
  "3.13.2",
  "3.14.1",
  "3.14.2",
  "3.14.3",
  "3.1.12",
  "3.1.13",
  "3.1.16",
  "3.1.17",
  "3.1.18",
  "3.3.5",
  "3.4.5",
  "3.4.6",
  "3.4.7",
  "3.4.8",
  "3.5.10",
  "3.7.5",
  "3.8.7",
  "3.11.2",
  "3.13.5",
  "3.13.6",
  "3.13.15",
  "3.14.4",
  "3.14.6",
]);

const WEIGHT_3 = new Set([
  "3.3.2",
  "3.7.1",
  "3.8.1",
  "3.8.2",
  "3.9.1",
  "3.11.1",
  "3.12.2",
  "3.1.5",
  "3.1.19",
  "3.7.4",
  "3.8.8",
  "3.13.8",
  "3.14.5",
  "3.14.7",
]);

const PARTIAL_FIVE = new Set(["3.5.3", "3.13.11"]);
const WEIGHT_0 = new Set(["3.12.4"]);
const BANNED = new Set(["3.1.20", "3.1.22", "3.12.4", "3.10.3", "3.10.4", "3.10.5"]);

function familyOf(reqId) {
  const [a, b] = reqId.split(".");
  const key = `${a}.${b}`;
  const family = FAMILY_BY_CHAPTER[key];
  if (!family) throw new Error(`unknown family for ${reqId}`);
  return family;
}

function weightOf(reqId) {
  if (WEIGHT_0.has(reqId)) return 0;
  if (PARTIAL_FIVE.has(reqId)) return 5;
  if (WEIGHT_5.has(reqId)) return 5;
  if (WEIGHT_3.has(reqId)) return 3;
  return 1;
}

function cmpReq(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function mfaPartialCredit() {
  return {
    kind: "mfa",
    states: {
      allMet: ["a", "b", "c", "d"],
      partial: { mustMet: ["a", "b", "c"], mustNotMet: ["d"] },
    },
  };
}

function fipsPartialCredit() {
  return {
    kind: "fips",
    overlayObjectives: [
      {
        key: "enc",
        determineIf: "encryption is employed to protect the confidentiality of CUI.",
      },
      {
        key: "fips",
        determineIf: "FIPS-validated cryptography is employed to protect the confidentiality of CUI.",
      },
    ],
    states: {
      allMet: ["enc", "fips"],
      partial: { mustMet: ["enc"], mustNotMet: ["fips"] },
    },
  };
}

const extracted = JSON.parse(fs.readFileSync(path.join(vendor, "nist-171-extracted.json"), "utf8"));
const titles = JSON.parse(fs.readFileSync(path.join(vendor, "cmmc-l2-titles.json"), "utf8")).titles;

const requirements = extracted.requirements
  .slice()
  .sort((a, b) => cmpReq(a.reqId, b.reqId))
  .map((row) => {
    const family = familyOf(row.reqId);
    const title = titles[row.reqId];
    if (!title) throw new Error(`missing CMMC title for ${row.reqId}`);
    const objectives = row.objectives.map((ao) => ({
      aoId: `${row.reqId}[${ao.letter}]`,
      letter: ao.letter,
      determineIf: ao.determineIf,
    }));
    const rec = {
      cmmcId: `${family}.L2-${row.reqId}`,
      reqId: row.reqId,
      family,
      title,
      statement: row.statement,
      basicOrDerived: row.basicOrDerived,
      weight: weightOf(row.reqId),
      poamBannedForConditional: BANNED.has(row.reqId),
      naAllowed: row.reqId !== "3.12.4",
      objectives,
    };
    if (row.reqId === "3.5.3") rec.partialCredit = mfaPartialCredit();
    if (row.reqId === "3.13.11") rec.partialCredit = fipsPartialCredit();
    return rec;
  });

if (requirements.length !== 110) {
  throw new Error(`expected 110 requirements, got ${requirements.length}`);
}

const catalog = {
  schemaVersion: 1,
  standard: "NIST-SP-800-171-R2",
  assessmentGuide: "NIST-SP-800-171A-2018-06",
  comment:
    "eCFR 32 CFR 170.24 typesets IA-L2-3.5.1 with a hyphen after the family; this catalog uses IA.L2-3.5.1. PDF-pure NIST SP 800-171A June 2018 objectives; enc/fips live only under partialCredit.overlayObjectives.",
  requirements,
};

const catalogJson = `${JSON.stringify(catalog, null, 2)}\n`;
fs.mkdirSync(path.dirname(outCatalog), { recursive: true });
fs.writeFileSync(outCatalog, catalogJson);

const expectedAoCount = requirements.reduce((n, r) => n + r.objectives.length, 0);
const catalogSha256 = createHash("sha256").update(catalogJson).digest("hex");

const meta = {
  schemaVersion: 1,
  standard: "NIST-SP-800-171-R2",
  assessmentGuide: "NIST-SP-800-171A-2018-06",
  retrievalDate: "2026-09-10",
  expectedAoCount,
  catalogSha256,
  comment:
    "eCFR 32 CFR 170.24 typesets IA-L2-3.5.1 with a hyphen after the family; this catalog uses IA.L2-3.5.1. expectedAoCount is PDF-pure 171A (unlettered determine-if stored as [a]). Overlay keys enc/fips are not in objectives[].",
  sources: [
    {
      title: "NIST SP 800-171 Rev. 2 (Feb 2020, as updated 2021-01-28)",
      url: "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-171r2.pdf",
      doi: "https://doi.org/10.6028/NIST.SP.800-171r2",
      role: "110 requirement statements; basic vs derived",
    },
    {
      title: "NIST SP 800-171A (June 2018) PDF — normative assessment objectives",
      url: "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-171a.pdf",
      doi: "https://doi.org/10.6028/NIST.SP.800-171A",
      role: "PDF-pure determine-if statements",
    },
    {
      title: "NIST SP 800-171A assessment procedures CSV (derivative; PDF wins on drift)",
      url: "https://csrc.nist.gov/files/pubs/sp/800/171/a/final/docs/sp800-171a-assessment-procedures.csv",
      role: "machine-readable letters + typesetting fallback",
    },
    {
      title: "32 CFR 170.24 scoring values and Conditional-banned set",
      url: "https://www.ecfr.gov/current/title-32/section-170.24",
      role: "weights 5/3/1/0, partial-credit pair, banned-for-conditional",
    },
  ],
};

fs.writeFileSync(outMeta, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`wrote ${path.relative(root, outCatalog)} sha256=${catalogSha256} aos=${expectedAoCount}`);
console.log(`wrote ${path.relative(root, outMeta)}`);
