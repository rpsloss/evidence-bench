import type { Assessment, AffirmationChecklistItem } from "../types";
import type { ExportPackResult } from "./exportPack.mjs";
import type { L1Status } from "./l1Score.mjs";

export const SAMPLE_WATERMARK: "UNCLASSIFIED // SAMPLE // NOT A SPRS SUBMISSION";
export const CHECKLIST_PREFIX: "Not legal advice. Not a SPRS submission.";
export const L1_SPRS_CSV_COLUMNS: "cmmcLevel,cmmcStatusDate,assessmentScope,cages,complianceResult,employeeCount,orgName,fictional";
export const L1_FINDINGS_CSV_COLUMNS: "family,cmmcId,farParagraph,reqId,title,finding";
export const L1_SPRS_COLUMN_NOTES: readonly string[];
export const L1_FINDINGS_COLUMN_NOTES: readonly string[];
export const L1_EXPORT_FILENAMES: readonly [
  "README.md",
  "COLUMNS.md",
  "HANDOFF.md",
  "checklist.md",
  "l1-sprs-entry.csv",
  "l1-far-findings.csv",
  "assessment.json",
];
export const L1_SNAPSHOT_FILENAMES: readonly [
  "README.md",
  "COLUMNS.md",
  "HANDOFF.md",
  "checklist.md",
  "l1-far-findings.csv",
  "assessment.json",
];

export interface L1SprsPreview {
  cmmcLevel: string;
  cmmcStatusDate: string;
  assessmentScope: string;
  cages: string;
  complianceResult: string;
  employeeCount: string;
  orgName: string;
  fictional: boolean;
  status: L1Status;
  unanswered: number;
  workingLevel: string;
}

export interface L1FindingPreviewRow {
  family: string;
  cmmcId: string;
  farParagraph: string;
  reqId: string;
  title: string;
  finding: string;
  exportable: boolean;
}

export function l1AffirmationChecklist(assessment: Assessment | null | undefined | unknown): AffirmationChecklistItem[];
export function canExportL1Zip(assessment: Assessment | null | undefined | unknown): boolean;
export function l1ExportReady(assessment: Assessment | null | undefined | unknown): boolean;
export function markL1ExportReady(
  assessment: Assessment,
  at?: string,
): { ok: true; assessment: Assessment } | { ok: false; error: "intake" | "unanswered" };
export function l1SprsPreview(assessment: Assessment | null | undefined | unknown): L1SprsPreview;
export function l1FindingPreviewRows(assessment: Assessment | null | undefined | unknown): L1FindingPreviewRow[];
export function buildL1ExportPack(input?: { assessment?: Assessment | null; createdAt?: string }): ExportPackResult;
export function buildL1Snapshot(input?: { assessment?: Assessment | null; createdAt?: string }): ExportPackResult;
