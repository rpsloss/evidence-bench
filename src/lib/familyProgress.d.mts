import type { Assessment, AssessmentScore } from "../types";
import type { CatalogRequirement } from "./rollup.mjs";

export const COMPLETIONS: readonly ["unfinished", "partial", "gapped", "present"];

export type FamilyCompletion = "unfinished" | "partial" | "gapped" | "present";

export interface FamilyProgressRow {
  family: string;
  name: string;
  reqCount: number;
  aoCount: number;
  unansweredAos: number;
  met: number;
  notMet: number;
  na: number;
  notReviewedReqs: number;
  evidenceGaps: number;
  poamGaps: number;
  reviewed: boolean;
  completion: FamilyCompletion;
}

export interface FamilyProgressCounts {
  unfinished: number;
  partial: number;
  gapped: number;
  present: number;
}

export interface AssemblerNextAction {
  family: string | null;
  href: string;
  title: string;
  detail: string;
}

export interface FamilyProgressBoard {
  families: FamilyProgressRow[];
  counts: FamilyProgressCounts;
  next: AssemblerNextAction;
}

export function completionLabel(value: string): string;
export function familyWorkCaption(row: FamilyProgressRow | null | undefined): string;

export function familyProgressRows(
  assessment: Assessment | null | undefined | unknown,
  catalog?: CatalogRequirement[],
): FamilyProgressRow[];

export function familyProgressSummary(rows: FamilyProgressRow[] | null | undefined): FamilyProgressCounts;

export function nextAssemblerAction(rows: FamilyProgressRow[] | null | undefined): AssemblerNextAction;

export function familyProgressBoard(
  assessment: Assessment | null | undefined | unknown,
  catalog?: CatalogRequirement[],
): FamilyProgressBoard;

export interface PunchListAoItem {
  family: string;
  reqId: string;
  cmmcId: string;
  aoId: string;
  href: string;
}

export interface PunchListPoamItem {
  family: string;
  reqId: string;
  cmmcId: string;
  href: string;
}

export interface PunchListReviewItem {
  family: string;
  name: string;
  href: string;
}

export interface PunchListEvidenceWarning {
  kind: "stale" | "draft" | "unmapped";
  id: string;
  title: string;
  evidenceKind: string;
  href: string;
}

export interface PunchListCounts {
  unansweredAos: number;
  missingPointers: number;
  missingPoams: number;
  openReviews: number;
  stale: number;
  draft: number;
  unmapped: number;
  work: number;
  warnings: number;
}

export interface AssemblerPunchList {
  unansweredAos: PunchListAoItem[];
  missingPointers: PunchListAoItem[];
  missingPoams: PunchListPoamItem[];
  openReviews: PunchListReviewItem[];
  stale: PunchListEvidenceWarning[];
  draft: PunchListEvidenceWarning[];
  unmapped: PunchListEvidenceWarning[];
  counts: PunchListCounts;
}

export interface PunchListHomeItem {
  id: string;
  kind: string;
  severity: "blocker" | "warning" | "info";
  family: string | null;
  href: string;
  title: string;
  detail: string;
}

export function assemblerPunchList(
  assessment: Assessment | null | undefined | unknown,
  catalog?: CatalogRequirement[],
  now?: number,
): AssemblerPunchList;

export function punchListHomeItems(list: AssemblerPunchList | null | undefined): PunchListHomeItem[];

export function handoffMarkdown(
  assessment: Assessment | null | undefined | unknown,
  score: AssessmentScore | null | undefined,
  catalog?: CatalogRequirement[],
): string;
