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

export function handoffMarkdown(
  assessment: Assessment | null | undefined | unknown,
  score: AssessmentScore | null | undefined,
  catalog?: CatalogRequirement[],
): string;
