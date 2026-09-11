/** Level 1 (Self) SPRS-prep pack. Five fields to type. No POA&M. Never auto-submits. */

import { SAMPLE_WATERMARK, CHECKLIST_PREFIX, zipStore } from "./exportPack.mjs";
import { uniqueCages, normalizeEngagement, levelLabel } from "./engagement.mjs";
import {
  l1CatalogRequirements,
  l1GroupFinding,
  l1Groups,
  l1ScoreFromAssessment,
} from "./l1Score.mjs";
import { storedFinding } from "./rollup.mjs";

export { SAMPLE_WATERMARK, CHECKLIST_PREFIX };

export const L1_SPRS_CSV_COLUMNS = "cmmcLevel,cmmcStatusDate,assessmentScope,cages,complianceResult,employeeCount,orgName,fictional";
export const L1_FINDINGS_CSV_COLUMNS = "family,cmmcId,farParagraph,reqId,title,finding";

export const L1_SPRS_COLUMN_NOTES = Object.freeze([
  "cmmcLevel = always Level 1 (Self) in this pack.",
  "cmmcStatusDate = leave blank here. Type the date in SPRS. prepMarkedAt is not a CMMC Status Date.",
  "assessmentScope = Enclave or Enterprise (SPRS definitions).",
  "cages = every CAGE on the in-scope systems, semicolon-separated. SAMPLE seed is XXXXX.",
  "complianceResult = MET or NOT MET. Final Level 1 (Self) requires MET on all 15 FAR rows. No POA&M.",
  "employeeCount = headcount from Intake / Scope. Reference only.",
  "orgName = fictional organization name.",
  "fictional = always true. SAMPLE data only.",
]);

export const L1_FINDINGS_COLUMN_NOTES = Object.freeze([
  "family = NIST family of the mapped 171 ID (AC, IA, MP, PE, SC, SI).",
  "cmmcId = CMMC Level 1 ID (example PE.L1-b.1.ix). PE.L1-b.1.ix spans three 171 IDs.",
  "farParagraph = FAR 52.204-21(b)(1) roman (b.1.i … b.1.xv).",
  "reqId = mapped NIST SP 800-171 Rev. 2 ID.",
  "title = mapped 171 title. Reference only.",
  "finding = Met, Not Met, or N/A. Never not-reviewed in the SPRS-prep zip.",
]);

export const L1_EXPORT_FILENAMES = Object.freeze([
  "README.md",
  "COLUMNS.md",
  "HANDOFF.md",
  "checklist.md",
  "l1-sprs-entry.csv",
  "l1-far-findings.csv",
  "assessment.json",
]);

export const L1_SNAPSHOT_FILENAMES = Object.freeze([
  "README.md",
  "COLUMNS.md",
  "HANDOFF.md",
  "checklist.md",
  "l1-far-findings.csv",
  "assessment.json",
]);

const FINDING_CSV = { met: "Met", "not-met": "Not Met", na: "N/A", "not-reviewed": "Unanswered" };

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  return value == null ? "" : String(value);
}

function utf8(text) {
  return new TextEncoder().encode(str(text));
}

function csvField(value) {
  const s = str(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvTable(columns, rows, notes = []) {
  const lines = [`# ${SAMPLE_WATERMARK}`];
  for (const note of notes) lines.push(`# ${note}`);
  lines.push(columns);
  for (const row of rows) lines.push(row);
  lines.push(`# ${SAMPLE_WATERMARK}`);
  return `${lines.join("\n")}\n`;
}

function orgOf(assessment) {
  return assessment?.organization && typeof assessment.organization === "object" ? assessment.organization : {};
}

function scopeKind(assessment) {
  return str(assessment?.scope?.kind) === "enterprise" ? "Enterprise" : "Enclave";
}

function cagesField(assessment) {
  return uniqueCages(orgOf(assessment), normalizeEngagement(assessment?.engagement)).join(";");
}

function item(id, statement, mustBeTrue, satisfied, href, citation) {
  const row = { id, statement, mustBeTrue, satisfied: satisfied === true, href };
  if (citation) row.citation = citation;
  return row;
}

export function l1AffirmationChecklist(assessment) {
  const score = l1ScoreFromAssessment(assessment);
  const org = orgOf(assessment);
  const engagement = normalizeEngagement(assessment?.engagement);
  const cages = uniqueCages(org, engagement);
  return [
    item(
      "intake-confirmed",
      "Intake is confirmed (FCI vs CUI is decided).",
      "engagement.intakeNotedAt",
      Boolean(str(engagement.intakeNotedAt).trim()),
      "/intake",
      "product rule",
    ),
    item(
      "cages-present",
      "At least one CAGE is listed for the in-scope systems.",
      "organization.cage or additionalCages",
      cages.length > 0,
      "/intake",
      "32 CFR 170.15(a)(1)(i)(D)",
    ),
    item(
      "ao-named",
      "An affirming-official prep name is on Intake (local only, not a PIEE identity).",
      "affirmingOfficial.name non-empty",
      Boolean(str(org.affirmingOfficial?.name).trim()),
      "/intake",
      "32 CFR 170.22 (prep, not PIEE)",
    ),
    item(
      "no-not-reviewed",
      "Every Level 1 mapped assessment objective has a finding.",
      "l1Score.unanswered === 0",
      score.unanswered === 0,
      "/requirements",
      "32 CFR 170.15(c)(1)",
    ),
    item(
      "evidence-met",
      "MET Level 1 objectives have a non-draft, non-interview pointer (same 170.24(b)(1) gate).",
      "unanswered includes evidence-failed MET",
      score.unanswered === 0,
      "/evidence",
      "32 CFR 170.24(b)(1)",
    ),
    item(
      "compliance-final",
      "Compliance result is MET (required for Final Level 1 (Self) and contract eligibility).",
      "l1Score.status === final-l1-self",
      score.status === "final-l1-self",
      "/requirements",
      "32 CFR 170.15(a)(1)",
    ),
    item(
      "poam-not-permitted",
      "Level 1 does not use a POA&M.",
      "32 CFR 170.21(a)(1)",
      true,
      "/poam",
      "32 CFR 170.21(a)(1)",
    ),
    item(
      "sample-banner",
      "This pack is SAMPLE / fictional.",
      "organization.fictional",
      org.fictional === true,
      "/export",
      "product rule",
    ),
  ];
}

export function canExportL1Zip(assessment) {
  return l1ScoreFromAssessment(assessment).unanswered === 0;
}

export function l1ExportReady(assessment) {
  const engagement = normalizeEngagement(assessment?.engagement);
  return Boolean(str(engagement.intakeNotedAt).trim()) && canExportL1Zip(assessment);
}

export function markL1ExportReady(assessment, at = new Date().toISOString()) {
  if (!str(normalizeEngagement(assessment?.engagement).intakeNotedAt).trim()) {
    return { ok: false, error: "intake" };
  }
  if (!canExportL1Zip(assessment)) return { ok: false, error: "unanswered" };
  return { ok: true, assessment: { ...assessment, prepMarkedAt: at } };
}

export function l1SprsPreview(assessment) {
  const score = l1ScoreFromAssessment(assessment);
  const org = orgOf(assessment);
  const engagement = normalizeEngagement(assessment?.engagement);
  return {
    cmmcLevel: "Level 1 (Self)",
    cmmcStatusDate: "",
    assessmentScope: scopeKind(assessment),
    cages: cagesField(assessment),
    complianceResult: score.complianceResult || "(incomplete)",
    employeeCount: org.employeeCount == null ? "" : String(org.employeeCount),
    orgName: str(org.name),
    fictional: org.fictional === true,
    status: score.status,
    unanswered: score.unanswered,
    workingLevel: levelLabel(engagement.workingLevel),
  };
}

export function l1FindingPreviewRows(assessment) {
  return l1CatalogRequirements().map((req) => {
    const finding = storedFinding(
      req,
      assessment?.determinations?.[req.reqId],
      asList(assessment?.evidence),
      asList(assessment?.operationalPoas),
    );
    return {
      family: str(req.family),
      cmmcId: str(req.cmmcId),
      farParagraph: str(req.farParagraph),
      reqId: str(req.reqId),
      title: str(req.title),
      finding: FINDING_CSV[finding] || "Unanswered",
      exportable: finding === "met" || finding === "not-met" || finding === "na",
    };
  });
}

function findingRows(assessment, { allowUnanswered = false } = {}) {
  const rows = [];
  for (const req of l1CatalogRequirements()) {
    const finding = storedFinding(
      req,
      assessment?.determinations?.[req.reqId],
      asList(assessment?.evidence),
      asList(assessment?.operationalPoas),
    );
    if (!allowUnanswered && finding === "not-reviewed") {
      const err = new Error("not-reviewed");
      err.code = "not-reviewed";
      throw err;
    }
    rows.push(
      [
        req.family,
        req.cmmcId,
        req.farParagraph,
        req.reqId,
        req.title,
        FINDING_CSV[finding] || "Unanswered",
      ]
        .map(csvField)
        .join(","),
    );
  }
  return rows;
}

function sprsRow(assessment, score) {
  const org = orgOf(assessment);
  return [
    "Level 1 (Self)",
    "",
    scopeKind(assessment),
    cagesField(assessment),
    score.complianceResult || "",
    org.employeeCount == null ? "" : String(org.employeeCount),
    str(org.name),
    org.fictional === true ? "true" : "false",
  ]
    .map(csvField)
    .join(",");
}

function columnsMarkdown() {
  return [
    SAMPLE_WATERMARK,
    "",
    "# Level 1 SPRS column glossary",
    "",
    CHECKLIST_PREFIX,
    "Type l1-sprs-entry.csv into SPRS by hand (32 CFR 170.15(a)(1)(i)). Do not type l1-far-findings.csv into SPRS — that file is the 15/17 FAR map for the AO/SCA.",
    "",
    "## l1-sprs-entry.csv",
    "",
    ...L1_SPRS_COLUMN_NOTES.map((row) => `- ${row}`),
    "",
    "## l1-far-findings.csv",
    "",
    ...L1_FINDINGS_COLUMN_NOTES.map((row) => `- ${row}`),
    "",
    SAMPLE_WATERMARK,
    "",
  ].join("\n");
}

function checklistMd(checklist) {
  const lines = [
    SAMPLE_WATERMARK,
    "",
    "# Level 1 affirming-official checklist (SAMPLE)",
    "",
    CHECKLIST_PREFIX,
    "No signature capture. The named official affirms in SPRS / PIEE, not here.",
    "",
    "| Check | What must be true | Ready? |",
    "| --- | --- | --- |",
  ];
  for (const row of checklist) {
    lines.push(`| ${row.id} | ${row.statement} | ${row.satisfied ? "yes" : "no"} |`);
  }
  lines.push("");
  lines.push(SAMPLE_WATERMARK);
  lines.push("");
  return lines.join("\n");
}

function handoffMarkdown(assessment, score) {
  const org = orgOf(assessment);
  const engagement = normalizeEngagement(assessment?.engagement);
  const lines = [
    SAMPLE_WATERMARK,
    "",
    "# Level 1 assembler handoff (SAMPLE)",
    "",
    CHECKLIST_PREFIX,
    "Cover sheet for the AO/SCA. Not a SPRS file. Level 1 is pass/fail. No POA&M.",
    "",
    `- Organization: ${str(org.name) || "(unnamed)"}`,
    `- CAGE(s): ${cagesField(assessment) || "XXXXX"} (fake seed)`,
    `- Assessment Scope: ${scopeKind(assessment)}`,
    `- Required status: ${levelLabel(engagement.requiredLevel)}`,
    `- Working: ${levelLabel(engagement.workingLevel)}`,
    `- Compliance result: ${score.complianceResult || "incomplete"} (${score.status})`,
    `- FAR rows: MET ${score.met} · NOT MET ${score.notMet} · unanswered ${score.unanswered} · N/A ${score.na} / ${score.total}`,
    "",
    "| CMMC ID | FAR | Mapped 171 | Finding |",
    "| --- | --- | --- | --- |",
  ];
  for (const group of l1Groups()) {
    const finding = l1GroupFinding(group, assessment);
    lines.push(
      `| ${group.cmmcId} | ${group.farParagraph} | ${group.reqs.map((r) => r.reqId).join("; ")} | ${FINDING_CSV[finding] || finding} |`,
    );
  }
  lines.push("");
  lines.push("## Punch list");
  lines.push("");
  const open = score.rows.filter((row) => row.finding === "not-reviewed" || row.finding === "not-met");
  if (!open.length) {
    lines.push("No unanswered or NOT MET Level 1 rows.");
  } else {
    for (const row of open) {
      lines.push(`- ${row.cmmcId} (${row.family}): ${FINDING_CSV[row.finding] || row.finding}`);
    }
  }
  lines.push("");
  lines.push(SAMPLE_WATERMARK);
  lines.push("");
  return lines.join("\n");
}

function readmeMd(assessment, score, ready) {
  const org = orgOf(assessment);
  return [
    SAMPLE_WATERMARK,
    "",
    "# Evidence Bench Level 1 SAMPLE export pack",
    "",
    CHECKLIST_PREFIX,
    "Five SPRS fields a human types for Level 1 (Self). The app never submits, signs, or affirms.",
    "No POA&M file. No 110-row SPRS CSV. No SSP file — SSP is not a Level 1 SPRS input.",
    "",
    `- Organization: ${str(org.name) || "(unnamed)"}`,
    `- Assessment Scope: ${scopeKind(assessment)}`,
    `- Compliance result: ${score.complianceResult || "incomplete"}`,
    `- prepMarkedAt: ${str(assessment?.prepMarkedAt).trim() || "(not marked)"} — local prep only, not a CMMC Status Date`,
    `- Export-ready: ${ready ? "yes" : "no"}`,
    "",
    "Type l1-sprs-entry.csv into SPRS by hand. COLUMNS.md is the glossary.",
    SAMPLE_WATERMARK,
    "",
  ].join("\n");
}

function snapshotReadme(assessment, score) {
  const org = orgOf(assessment);
  return [
    SAMPLE_WATERMARK,
    "",
    "# Evidence Bench Level 1 assembler snapshot (SAMPLE)",
    "",
    CHECKLIST_PREFIX,
    "Mid-cycle QC pack for the AO/SCA. Allowed while Level 1 rows are unanswered.",
    "It does not include l1-sprs-entry.csv. That file lives only in the SPRS-prep zip, which still refuses unanswered objectives.",
    "",
    `- Organization: ${str(org.name) || "(unnamed)"}`,
    `- Compliance result: ${score.complianceResult || "incomplete"}`,
    "",
    SAMPLE_WATERMARK,
    "",
  ].join("\n");
}

function packJson(assessment, score, checklist, ready, createdAt) {
  return `${JSON.stringify(
    {
      watermark: SAMPLE_WATERMARK,
      createdAt,
      level: "level-1-self",
      exportReady: ready,
      complianceResult: score.complianceResult,
      status: score.status,
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
    filename: "evidence-bench-l1-sample.zip",
    watermark: SAMPLE_WATERMARK,
  };
}

function zipFromFiles(filenames, files, createdAt, filename) {
  const entries = [];
  const manifestFiles = [];
  for (const name of filenames) {
    const text = files[name];
    const body = utf8(text);
    entries.push({ name, body });
    manifestFiles.push({ name, bytes: body.length, sha256: "" });
  }
  const zip = zipStore(entries, createdAt ? new Date(createdAt) : new Date());
  return { zip, files, filename, manifestFiles };
}

export function buildL1ExportPack(input = {}) {
  const assessment = input?.assessment;
  const createdAt = str(input?.createdAt) || new Date().toISOString();
  if (!assessment || typeof assessment !== "object") return refuse("assessment-missing", [], false);
  const score = l1ScoreFromAssessment(assessment);
  const checklist = l1AffirmationChecklist(assessment);
  const ready = l1ExportReady(assessment);
  if (score.unanswered > 0) return refuse("not-reviewed", checklist, ready);

  let findings;
  try {
    findings = findingRows(assessment, { allowUnanswered: false });
  } catch (err) {
    if (err?.code === "not-reviewed") return refuse("not-reviewed", checklist, ready);
    throw err;
  }

  const files = {
    "README.md": readmeMd(assessment, score, ready),
    "COLUMNS.md": columnsMarkdown(),
    "HANDOFF.md": handoffMarkdown(assessment, score),
    "checklist.md": checklistMd(checklist),
    "l1-sprs-entry.csv": csvTable(L1_SPRS_CSV_COLUMNS, [sprsRow(assessment, score)], L1_SPRS_COLUMN_NOTES),
    "l1-far-findings.csv": csvTable(L1_FINDINGS_CSV_COLUMNS, findings, L1_FINDINGS_COLUMN_NOTES),
    "assessment.json": packJson(assessment, score, checklist, ready, createdAt),
  };
  const built = zipFromFiles(L1_EXPORT_FILENAMES, files, createdAt, "evidence-bench-l1-sample.zip");
  return {
    ok: true,
    error: null,
    checklist,
    exportReady: ready,
    zip: built.zip,
    files: built.files,
    filename: built.filename,
    watermark: SAMPLE_WATERMARK,
    manifest: {
      id: `l1-export-${createdAt}`,
      createdAt,
      watermark: SAMPLE_WATERMARK,
      files: built.manifestFiles,
    },
  };
}

export function buildL1Snapshot(input = {}) {
  const assessment = input?.assessment;
  const createdAt = str(input?.createdAt) || new Date().toISOString();
  if (!assessment || typeof assessment !== "object") return refuse("assessment-missing", [], false);
  const score = l1ScoreFromAssessment(assessment);
  const checklist = l1AffirmationChecklist(assessment);
  const ready = l1ExportReady(assessment);
  const findings = findingRows(assessment, { allowUnanswered: true });
  const files = {
    "README.md": snapshotReadme(assessment, score),
    "COLUMNS.md": columnsMarkdown(),
    "HANDOFF.md": handoffMarkdown(assessment, score),
    "checklist.md": checklistMd(checklist),
    "l1-far-findings.csv": csvTable(L1_FINDINGS_CSV_COLUMNS, findings, L1_FINDINGS_COLUMN_NOTES),
    "assessment.json": packJson(assessment, score, checklist, ready, createdAt),
  };
  const built = zipFromFiles(L1_SNAPSHOT_FILENAMES, files, createdAt, "evidence-bench-l1-snapshot.zip");
  return {
    ok: true,
    error: null,
    checklist,
    exportReady: ready,
    zip: built.zip,
    files: built.files,
    filename: built.filename,
    watermark: SAMPLE_WATERMARK,
    manifest: {
      id: `l1-snapshot-${createdAt}`,
      createdAt,
      watermark: SAMPLE_WATERMARK,
      files: built.manifestFiles,
    },
  };
}
