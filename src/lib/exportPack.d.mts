import type { Assessment, AssessmentScore } from "../types";
import type { CatalogRequirement } from "./rollup.mjs";

export const SAMPLE_WATERMARK: "UNCLASSIFIED // SAMPLE // NOT A SPRS SUBMISSION";
export const CHECKLIST_PREFIX: "Not legal advice. Not a SPRS submission.";
export const FAMILY_IDS: readonly [
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
];
export const SPRS_CSV_COLUMNS: "family,cmmcId,reqId,title,finding,naJustification,mfaState,fipsState";
export const SCOPE_CSV_COLUMNS: "kind,employeeCount,cage,fictional,orgName";
export const POAM_CSV_COLUMNS: "reqId,cmmcId,weight,conditionalLegal,illegalCode,weakness,owner,due,status";
export const EXPORT_FILENAMES: readonly [
  "README.md",
  "HANDOFF.md",
  "ssp.md",
  "checklist.md",
  "sprs-manual-entry.csv",
  "scope.csv",
  "poam.csv",
  "assessment.json",
];
export const SNAPSHOT_FILENAMES: readonly [
  "README.md",
  "HANDOFF.md",
  "ssp.md",
  "checklist.md",
  "scope.csv",
  "poam.csv",
  "assessment.json",
];

export interface AffirmationChecklistItem {
  id: string;
  statement: string;
  mustBeTrue: string;
  satisfied: boolean;
  href: string;
  citation?: string;
}

export interface ExportManifestFile {
  name: string;
  sha256: string;
  bytes: number;
}

export interface ExportManifest {
  id: string;
  createdAt: string;
  watermark: "UNCLASSIFIED // SAMPLE // NOT A SPRS SUBMISSION";
  files: ExportManifestFile[];
}

export type ExportRefuseCode = "not-reviewed" | "catalog-hash-mismatch" | "assessment-missing";

export interface ExportPackResult {
  ok: boolean;
  error: ExportRefuseCode | null;
  checklist: AffirmationChecklistItem[];
  exportReady: boolean;
  zip: Uint8Array | null;
  files: Record<string, string> | null;
  filename: string;
  watermark: "UNCLASSIFIED // SAMPLE // NOT A SPRS SUBMISSION";
  manifest?: ExportManifest;
}

export class ExportRefused extends Error {
  name: "ExportRefused";
  code: string;
  constructor(code: string);
}

export function zipStore(
  files: Iterable<{ name: string; body?: string | Uint8Array | null }> | null | undefined,
  now?: Date,
): Uint8Array;

export function familyReviewsComplete(assessment: Assessment | null | undefined | unknown): boolean;

export function exportReady(assessment: Assessment | null | undefined | unknown): boolean;

export function affirmationChecklist(
  assessment: Assessment | null | undefined | unknown,
  scoreResult?: AssessmentScore | null,
  catalog?: CatalogRequirement[],
): AffirmationChecklistItem[];

export function canExportZip(
  assessment: Assessment | null | undefined | unknown,
  catalog?: CatalogRequirement[],
): boolean;

export function markExportReady(
  assessment: Assessment,
  at?: string,
): { ok: true; assessment: Assessment } | { ok: false; error: "family-reviews" };

export function buildExportPack(input?: {
  assessment?: Assessment | null;
  catalog?: CatalogRequirement[];
  expectedCatalogHash?: string | null;
  createdAt?: string;
}): ExportPackResult;

export function buildAssemblerSnapshot(input?: {
  assessment?: Assessment | null;
  catalog?: CatalogRequirement[];
  expectedCatalogHash?: string | null;
  createdAt?: string;
}): ExportPackResult;
