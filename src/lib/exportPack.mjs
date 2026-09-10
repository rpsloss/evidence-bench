/** SAMPLE SPRS-prep pack. Never auto-submits. Watermark is always on. */

import catalogFile from "../data/catalog.json" with { type: "json" };
import catalogMeta from "../data/catalog.meta.json" with { type: "json" };
import { handoffMarkdown } from "./familyProgress.mjs";
import { deductedWeight } from "./poamGuard.mjs";
import { effectiveObjectives, evidenceSupportsMet, rollupRequirement, storedFindings } from "./rollup.mjs";
import { scopeBlockers } from "./scope.mjs";
import { CatalogHashMismatch, derivePartialState, scoreFromAssessment } from "./score.mjs";

export const SAMPLE_WATERMARK = "UNCLASSIFIED // SAMPLE // NOT A SPRS SUBMISSION";
export const CHECKLIST_PREFIX = "Not legal advice. Not a SPRS submission.";

export const FAMILY_IDS = Object.freeze([
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

export const SPRS_CSV_COLUMNS = "family,cmmcId,reqId,title,finding,naJustification,mfaState,fipsState";
export const SCOPE_CSV_COLUMNS = "kind,employeeCount,cage,fictional,orgName";
export const POAM_CSV_COLUMNS = "reqId,cmmcId,weight,conditionalLegal,illegalCode,weakness,owner,due,status";

export const EXPORT_FILENAMES = Object.freeze([
  "README.md",
  "HANDOFF.md",
  "ssp.md",
  "checklist.md",
  "sprs-manual-entry.csv",
  "scope.csv",
  "poam.csv",
  "assessment.json",
]);

export const SNAPSHOT_FILENAMES = Object.freeze([
  "README.md",
  "HANDOFF.md",
  "ssp.md",
  "checklist.md",
  "scope.csv",
  "poam.csv",
  "assessment.json",
]);

const FINDING_CSV = { met: "Met", "not-met": "Not Met", na: "N/A" };
const EXPORTABLE = new Set(["met", "not-met", "na"]);

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  return value == null ? "" : String(value);
}

function catalogReqs(catalog) {
  return asList(catalog).filter((row) => row && str(row.reqId));
}

function utf8(text) {
  return new TextEncoder().encode(str(text));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n) {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >> 8) & 0xff;
  return b;
}

function u32(n) {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >> 8) & 0xff;
  b[2] = (n >> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function dosDateTime(d) {
  const year = Math.max(d.getFullYear(), 1980);
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date, time };
}

/** STORE zip so SAMPLE watermark stays literal in every member (and in the bytes). */
export function zipStore(files, now = new Date()) {
  const { date, time } = dosDateTime(now);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of asList(files)) {
    const name = str(file?.name).replace(/^\/+/, "").replace(/\\/g, "/");
    if (!name || name.includes("..") || name.includes("/")) continue;
    const body = file?.body instanceof Uint8Array ? file.body : utf8(file?.body ?? "");
    const nameBytes = utf8(name);
    const crc = crc32(body);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(body.length),
      u32(body.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      body,
    ]);
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(body.length),
      u32(body.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDir = concat(centrals);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(centrals.length),
    u16(centrals.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, centralDir, eocd]);
}

function csvField(value) {
  const s = str(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvTable(columns, rows) {
  const header = columns;
  const lines = [`# ${SAMPLE_WATERMARK}`, header];
  for (const row of rows) lines.push(row);
  lines.push(`# ${SAMPLE_WATERMARK}`);
  return `${lines.join("\n")}\n`;
}

function orgOf(assessment) {
  return assessment?.organization && typeof assessment.organization === "object" ? assessment.organization : {};
}

function scoreOf(assessment, catalog, expectedHash) {
  try {
    return scoreFromAssessment(assessment, catalog, expectedHash);
  } catch (err) {
    if (err instanceof CatalogHashMismatch || err?.code === "catalog-hash-mismatch") return null;
    throw err;
  }
}

function detsOf(assessment) {
  return assessment?.determinations && typeof assessment.determinations === "object" ? assessment.determinations : {};
}

function findingsOf(catalog, assessment) {
  return storedFindings(
    catalog,
    detsOf(assessment),
    asList(assessment?.evidence),
    asList(assessment?.operationalPoas),
  );
}

function asAoFinding(value) {
  return value === "met" || value === "not-met" || value === "na" || value === "not-reviewed" ? value : "not-reviewed";
}

/** Checklist sentence: every catalog AO (and FIPS overlay) has a finding. */
function hasUnansweredObjectives(catalog, assessment) {
  const dets = detsOf(assessment);
  for (const req of catalogReqs(catalog)) {
    const det = dets[req.reqId];
    const objectives = effectiveObjectives(req, det);
    if (objectives.some((ao) => asAoFinding(ao.finding) === "not-reviewed")) return true;
    if (req?.partialCredit?.kind !== "fips") continue;
    const overlay = det?.fipsOverlay;
    if (!overlay || typeof overlay !== "object") return true;
    if (asAoFinding(overlay.enc) === "not-reviewed" || asAoFinding(overlay.fips) === "not-reviewed") return true;
  }
  return false;
}

function hasStoredNotReviewed(catalog, assessment) {
  return Object.values(findingsOf(catalog, assessment)).some((finding) => finding === "not-reviewed");
}

/** Unanswered AOs/overlays, or evidence-failed MET stored as not-reviewed. Keeper Not Met is exportable. */
function blocksExportAsNotReviewed(catalog, assessment) {
  return hasUnansweredObjectives(catalog, assessment) || hasStoredNotReviewed(catalog, assessment);
}

export function familyReviewsComplete(assessment) {
  const byFamily = new Map();
  for (const row of asList(assessment?.familyReviews)) {
    if (!row || typeof row !== "object") continue;
    const family = str(row.family);
    if (FAMILY_IDS.includes(family) && row.reviewed === true) byFamily.set(family, true);
  }
  return FAMILY_IDS.every((id) => byFamily.get(id) === true);
}

export function exportReady(assessment) {
  return familyReviewsComplete(assessment);
}

function evidenceMetOk(catalog, assessment) {
  const evidence = asList(assessment?.evidence);
  const operationalPoas = asList(assessment?.operationalPoas);
  const dets = assessment?.determinations && typeof assessment.determinations === "object" ? assessment.determinations : {};
  for (const req of catalogReqs(catalog)) {
    const rolled = rollupRequirement(req, dets[req.reqId], evidence, operationalPoas);
    if (rolled.wouldBeFinding === "met" && !evidenceSupportsMet(rolled.objectives, evidence)) return false;
  }
  return true;
}

function poamCoversGaps(findings, assessment) {
  const covered = new Set(asList(assessment?.poams).map((row) => str(row?.reqId)).filter(Boolean));
  for (const [reqId, finding] of Object.entries(findings)) {
    if (finding === "not-met" && !covered.has(reqId)) return false;
  }
  return true;
}

function noOosOnInBoundaryFlow(assessment) {
  return !scopeBlockers(assessment).some((row) => str(row?.id).startsWith("oos-in-flow"));
}

function espCrmOk(assessment) {
  if (asList(assessment?.evidence).some((row) => str(row?.kind) === "esp_crm")) return true;
  const inherit = asList(assessment?.ssp).find((row) => str(row?.key) === "inheritance-esp");
  const body = str(inherit?.body);
  if (body.trim()) return true;
  const notes = `${str(assessment?.scope?.narrative)}\n${str(assessment?.scope?.isolationSummary)}`;
  return /n\/a:\s*no esp/i.test(notes);
}

function item(id, statement, mustBeTrue, satisfied, href, citation) {
  const row = { id, statement, mustBeTrue, satisfied: satisfied === true, href };
  if (citation) row.citation = citation;
  return row;
}

export function affirmationChecklist(assessment, scoreResult, catalog = catalogFile.requirements) {
  const score = scoreResult === undefined ? scoreOf(assessment, catalog, catalogMeta.catalogSha256) : scoreResult;
  const findings = findingsOf(catalog, assessment);
  const org = orgOf(assessment);
  const status = score?.status;
  const final = status === "final-l2-self";
  const affirmable = status === "conditional-l2-self" || final;
  return [
    item(
      "ssp-present",
      "An up-to-date SSP describes the Assessment Scope.",
      "score.sspPresent",
      Boolean(score?.sspPresent),
      "/ssp",
      "32 CFR 170.24(c)(2)(i)(5)",
    ),
    item(
      "no-not-reviewed",
      "Every assessment objective has a finding.",
      "no catalog AO or FIPS overlay is not-reviewed",
      !hasUnansweredObjectives(catalog, assessment),
      "/requirements",
      "170.16(c)(1)",
    ),
    item(
      "evidence-met",
      "Every MET objective has a non-draft, non-interview-only pointer.",
      "invariant 3",
      evidenceMetOk(catalog, assessment),
      "/evidence",
      "170.24(b)(1)",
    ),
    item(
      "status-affirmable",
      "SPRS-prep status is Conditional or Final.",
      "status ∈ {conditional-l2-self, final-l2-self}",
      affirmable,
      "/",
      "SPRS L2 Quick Entry v4.0",
    ),
    item(
      "no-banned-unlegal",
      "No NOT MET is Conditional-illegal (or status is Final with zero NOT MET).",
      "conditionalEligible || status===final",
      Boolean(score?.conditionalEligible) || final,
      "/poam",
      "170.21(a)(2)",
    ),
    item(
      "poam-covers-gaps",
      "Every NOT MET has a register row.",
      "every NOT MET on poams[]",
      poamCoversGaps(findings, assessment),
      "/poam",
      "170.24(c)(2)(i)(6)",
    ),
    item(
      "family-reviews",
      "A consultant reviewed every family.",
      "all 14 FamilyReview.reviewed",
      familyReviewsComplete(assessment),
      "/requirements",
      "product rule (DECIDED 2026-09-09)",
    ),
    item(
      "sample-banner",
      "This pack is SAMPLE / fictional.",
      "organization.fictional",
      org.fictional === true,
      "/export",
      "product rule",
    ),
    item(
      "scope-graph",
      "No OOS asset sits on an in-boundary CUI flow.",
      "invariant 13",
      noOosOnInBoundaryFlow(assessment),
      "/assets",
      "170.19",
    ),
    item(
      "ao-named",
      "An affirming-official prep name is on Scope (local only).",
      "affirmingOfficial.name non-empty",
      Boolean(str(org.affirmingOfficial?.name).trim()),
      "/scope",
      "170.22 (prep, not PIEE)",
    ),
    item(
      "esp-crm",
      "ESP/CSP relationship is named (CRM stub or N/A: no ESP). Not a FedRAMP engine.",
      "esp_crm evidence or SSP inheritance stub or explicit N/A note",
      espCrmOk(assessment),
      "/ssp",
      "170.16(c)(2)–(3)",
    ),
  ];
}

function mfaState(req, rolled, det) {
  if (str(req?.reqId) !== "3.5.3") return "";
  const st = derivePartialState(req, rolled.objectives, det?.fipsOverlay);
  if (st === "all-met") return "all-users";
  if (st === "partial-3") return "remote-and-privileged-only";
  if (st === "none-5" || st === "contradictory") return "none";
  return "";
}

function fipsState(req, rolled, det) {
  if (str(req?.reqId) !== "3.13.11") return "";
  const st = derivePartialState(req, rolled.objectives, det?.fipsOverlay);
  if (st === "all-met") return "fips-validated";
  if (st === "partial-3") return "encrypt-not-fips";
  if (st === "none-5" || st === "contradictory") return "none";
  return "";
}

function csvFinding(finding) {
  return FINDING_CSV[finding] || "";
}

export class ExportRefused extends Error {
  constructor(code) {
    super(code);
    this.name = "ExportRefused";
    this.code = code;
  }
}

function sprsRows(catalog, assessment) {
  const evidence = asList(assessment?.evidence);
  const operationalPoas = asList(assessment?.operationalPoas);
  const dets = assessment?.determinations && typeof assessment.determinations === "object" ? assessment.determinations : {};
  const rows = [];
  for (const req of catalogReqs(catalog)) {
    const det = dets[req.reqId];
    const rolled = rollupRequirement(req, det, evidence, operationalPoas);
    // Evidence-failed MET is stored not-reviewed. Keeper-demoted MET is Not Met and is exportable.
    if (rolled.finding === "not-reviewed" || !EXPORTABLE.has(rolled.finding)) {
      throw new ExportRefused("not-reviewed");
    }
    rows.push(
      [
        str(req.family),
        str(req.cmmcId),
        str(req.reqId),
        str(req.title),
        csvFinding(rolled.finding),
        rolled.finding === "na" ? str(det?.naJustification) : "",
        mfaState(req, rolled, det),
        fipsState(req, rolled, det),
      ]
        .map(csvField)
        .join(","),
    );
  }
  return rows;
}

function scopeRow(assessment) {
  const org = orgOf(assessment);
  const scope = assessment?.scope && typeof assessment.scope === "object" ? assessment.scope : {};
  const count = org.employeeCount == null || org.employeeCount === "" ? "" : String(org.employeeCount);
  const kind = str(scope.kind) === "enterprise" ? "enterprise" : "enclave";
  return [kind, count, "XXXXX", "true", str(org.name)].map(csvField).join(",");
}

function poamRows(catalog, assessment) {
  const byId = new Map(catalogReqs(catalog).map((row) => [str(row.reqId), row]));
  const evidence = asList(assessment?.evidence);
  const operationalPoas = asList(assessment?.operationalPoas);
  const dets = assessment?.determinations && typeof assessment.determinations === "object" ? assessment.determinations : {};
  const rows = [];
  for (const itemRow of asList(assessment?.poams)) {
    if (!itemRow || typeof itemRow !== "object") continue;
    const reqId = str(itemRow.reqId);
    const req = byId.get(reqId);
    const det = dets[reqId];
    const rolled = req ? rollupRequirement(req, det, evidence, operationalPoas) : null;
    const partial = req?.partialCredit ? derivePartialState(req, rolled.objectives, det?.fipsOverlay) : null;
    const weight = req ? deductedWeight(req, partial, rolled?.finding) : "";
    rows.push(
      [
        reqId,
        str(req?.cmmcId),
        weight,
        itemRow.conditionalLegal === true ? "true" : "false",
        str(itemRow.illegalCode),
        str(itemRow.weakness),
        str(itemRow.owner),
        str(itemRow.due),
        str(itemRow.status) || "open",
      ]
        .map(csvField)
        .join(","),
    );
  }
  return rows;
}

function mdEscape(text) {
  return str(text).replace(/\r\n/g, "\n");
}

function readmeMd(assessment, score, checklist, ready) {
  const org = orgOf(assessment);
  const scope = assessment?.scope && typeof assessment.scope === "object" ? assessment.scope : {};
  const status = score?.status || "assessment-incomplete";
  const prep = str(assessment?.prepMarkedAt).trim() || "(not marked)";
  const red = checklist.filter((row) => !row.satisfied).map((row) => row.id);
  return [
    SAMPLE_WATERMARK,
    "",
    "# Evidence Bench SAMPLE export pack",
    "",
    CHECKLIST_PREFIX,
    "Fictional data only. Fake CAGE XXXXX. The app never submits, signs, or affirms.",
    "",
    `- Organization: ${str(org.name) || "(unnamed)"}`,
    `- Assessment Scope: ${str(scope.kind) === "enterprise" ? "Enterprise" : "Enclave"}`,
    `- Score: ${score ? `${score.raw}/110` : "—"} (${status})`,
    `- prepMarkedAt: ${prep} — local prep only, not a CMMC Status Date`,
    `- Export-ready (14 family reviews): ${ready ? "yes" : "no"}`,
    red.length ? `- Unsatisfied checklist rows: ${red.join(", ")}` : "- Frozen checklist: all rows satisfied",
    "",
    "Type sprs-manual-entry.csv into SPRS by hand. Not a SPRS submission.",
    "HANDOFF.md is the assembler cover sheet for the AO/SCA. Completion status is unfinished / partial / gapped / present — not a SPRS finding.",
    SAMPLE_WATERMARK,
    "",
  ].join("\n");
}

function snapshotReadme(assessment, score) {
  const org = orgOf(assessment);
  const status = score?.status || "assessment-incomplete";
  return [
    SAMPLE_WATERMARK,
    "",
    "# Evidence Bench assembler snapshot (SAMPLE)",
    "",
    CHECKLIST_PREFIX,
    "Mid-cycle QC pack for the AO/SCA. This zip is allowed while families are unfinished or partial.",
    "It does not include sprs-manual-entry.csv. That file lives only in the SPRS-prep zip, which still refuses unanswered objectives.",
    "The app never submits, signs, or affirms.",
    "",
    `- Organization: ${str(org.name) || "(unnamed)"}`,
    `- Score: ${score ? `${score.raw}/110` : "—"} (${status})`,
    "",
    SAMPLE_WATERMARK,
    "",
  ].join("\n");
}

function sspMd(assessment) {
  const lines = [SAMPLE_WATERMARK, "", "# System Security Plan (SAMPLE stubs)", ""];
  for (const row of asList(assessment?.ssp)) {
    lines.push(`## ${str(row?.title) || str(row?.key) || "section"}`);
    lines.push("");
    lines.push(mdEscape(row?.body) || "(empty)");
    lines.push("");
  }
  lines.push(SAMPLE_WATERMARK);
  lines.push("");
  return lines.join("\n");
}

function checklistMd(checklist) {
  const lines = [
    SAMPLE_WATERMARK,
    "",
    "# Affirming-official checklist (read-only)",
    "",
    CHECKLIST_PREFIX,
    "This is not a signature and not a SPRS affirmation.",
    "",
    "| id | statement | satisfied | href | citation |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const row of checklist) {
    const sat = row.satisfied ? "yes" : "NO";
    lines.push(
      `| ${row.id} | ${str(row.statement).replace(/\|/g, "/")} | ${sat} | ${row.href} | ${str(row.citation)} |`,
    );
  }
  lines.push("");
  lines.push(SAMPLE_WATERMARK);
  lines.push("");
  return lines.join("\n");
}

function packJson(assessment, score, checklist, ready, createdAt) {
  return `${JSON.stringify(
    {
      watermark: SAMPLE_WATERMARK,
      createdAt,
      exportReady: ready,
      prepMarkedAt: assessment?.prepMarkedAt ?? null,
      note: "Local prep only. prepMarkedAt is not a CMMC Status Date. Not a SPRS submission.",
      score,
      checklist,
      assessment,
    },
    null,
    2,
  )}\n`;
}

function refuse(error, checklist, ready) {
  return {
    ok: false,
    error,
    checklist,
    exportReady: ready,
    zip: null,
    files: null,
    filename: "evidence-bench-sample.zip",
    watermark: SAMPLE_WATERMARK,
  };
}

export function canExportZip(assessment, catalog = catalogFile.requirements) {
  return !blocksExportAsNotReviewed(catalog, assessment);
}

export function markExportReady(assessment, at = new Date().toISOString()) {
  if (!familyReviewsComplete(assessment)) return { ok: false, error: "family-reviews" };
  return { ok: true, assessment: { ...assessment, prepMarkedAt: at } };
}

export function buildExportPack(input = {}) {
  const assessment = input?.assessment;
  const catalog = catalogReqs(input?.catalog).length ? input.catalog : catalogFile.requirements;
  const expectedHash = input?.expectedCatalogHash === undefined ? catalogMeta.catalogSha256 : input.expectedCatalogHash;
  const createdAt = str(input?.createdAt) || new Date().toISOString();
  if (!assessment || typeof assessment !== "object") return refuse("assessment-missing", [], false);
  const ready = exportReady(assessment);
  const score = scoreOf(assessment, catalog, expectedHash);
  if (expectedHash && score == null) {
    return refuse("catalog-hash-mismatch", affirmationChecklist(assessment, null, catalog), ready);
  }
  const checklist = affirmationChecklist(assessment, score, catalog);
  if (blocksExportAsNotReviewed(catalog, assessment)) return refuse("not-reviewed", checklist, ready);

  let sprs;
  try {
    sprs = sprsRows(catalog, assessment);
  } catch (err) {
    if (err instanceof ExportRefused || err?.code === "not-reviewed") {
      return refuse("not-reviewed", checklist, ready);
    }
    throw err;
  }

  const files = {
    "README.md": readmeMd(assessment, score, checklist, ready),
    "HANDOFF.md": handoffMarkdown(assessment, score, catalog),
    "ssp.md": sspMd(assessment),
    "checklist.md": checklistMd(checklist),
    "sprs-manual-entry.csv": csvTable(SPRS_CSV_COLUMNS, sprs),
    "scope.csv": csvTable(SCOPE_CSV_COLUMNS, [scopeRow(assessment)]),
    "poam.csv": csvTable(POAM_CSV_COLUMNS, poamRows(catalog, assessment)),
    "assessment.json": packJson(assessment, score, checklist, ready, createdAt),
  };

  const entries = [];
  const manifestFiles = [];
  for (const name of EXPORT_FILENAMES) {
    const text = files[name];
    const body = utf8(text);
    entries.push({ name, body });
    manifestFiles.push({ name, bytes: body.length, sha256: "" });
  }
  const zip = zipStore(entries, createdAt ? new Date(createdAt) : new Date());
  return {
    ok: true,
    error: null,
    checklist,
    exportReady: ready,
    zip,
    files,
    filename: "evidence-bench-sample.zip",
    watermark: SAMPLE_WATERMARK,
    manifest: {
      id: `export-${createdAt}`,
      createdAt,
      watermark: SAMPLE_WATERMARK,
      files: manifestFiles,
    },
  };
}

/** Mid-cycle AO/SCA pack. Never includes sprs-manual-entry.csv. Allowed while families are unfinished or partial. */
export function buildAssemblerSnapshot(input = {}) {
  const assessment = input?.assessment;
  const catalog = catalogReqs(input?.catalog).length ? input.catalog : catalogFile.requirements;
  const expectedHash = input?.expectedCatalogHash === undefined ? catalogMeta.catalogSha256 : input.expectedCatalogHash;
  const createdAt = str(input?.createdAt) || new Date().toISOString();
  if (!assessment || typeof assessment !== "object") return refuse("assessment-missing", [], false);
  const ready = exportReady(assessment);
  const score = scoreOf(assessment, catalog, expectedHash);
  const checklist = affirmationChecklist(assessment, score, catalog);
  const files = {
    "README.md": snapshotReadme(assessment, score),
    "HANDOFF.md": handoffMarkdown(assessment, score, catalog),
    "ssp.md": sspMd(assessment),
    "checklist.md": checklistMd(checklist),
    "scope.csv": csvTable(SCOPE_CSV_COLUMNS, [scopeRow(assessment)]),
    "poam.csv": csvTable(POAM_CSV_COLUMNS, poamRows(catalog, assessment)),
    "assessment.json": packJson(assessment, score, checklist, ready, createdAt),
  };
  const entries = [];
  const manifestFiles = [];
  for (const name of SNAPSHOT_FILENAMES) {
    const text = files[name];
    const body = utf8(text);
    entries.push({ name, body });
    manifestFiles.push({ name, bytes: body.length, sha256: "" });
  }
  const zip = zipStore(entries, createdAt ? new Date(createdAt) : new Date());
  return {
    ok: true,
    error: null,
    checklist,
    exportReady: ready,
    zip,
    files,
    filename: "evidence-bench-assembler-snapshot.zip",
    watermark: SAMPLE_WATERMARK,
    manifest: {
      id: `snapshot-${createdAt}`,
      createdAt,
      watermark: SAMPLE_WATERMARK,
      files: manifestFiles,
    },
  };
}
