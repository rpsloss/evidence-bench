import type { Assessment, Finding } from "../types";
import type { CatalogRequirement } from "./rollup.mjs";

export const L1_FAMILIES: readonly { id: string; name: string }[];
export const L1_FAMILY_IDS: readonly string[];

export interface L1Group {
  cmmcId: string;
  family: string;
  farParagraph: string;
  title: string;
  reqs: CatalogRequirement[];
  finding?: Finding;
}

export type L1Status = "assessment-incomplete" | "final-l1-self" | "not-met";

export interface L1Score {
  status: L1Status;
  complianceResult: "MET" | "NOT MET" | null;
  met: number;
  notMet: number;
  unanswered: number;
  na: number;
  total: number;
  rows: L1Group[];
  poamPermitted: false;
  computedAt: string;
}

export interface L1FamilyProgressRow {
  family: string;
  name: string;
  groupCount: number;
  unanswered: number;
  notMet: number;
  met: number;
  completion: "unfinished" | "partial" | "gapped" | "present";
}

export interface L1NextAction {
  href: string;
  title: string;
  detail: string;
}

export function l1CatalogRequirements(catalog?: CatalogRequirement[]): CatalogRequirement[];
export function l1Groups(catalog?: CatalogRequirement[]): L1Group[];
export function l1GroupFinding(group: L1Group, assessment: Assessment | null | undefined | unknown): Finding;
export function l1ScoreFromAssessment(
  assessment: Assessment | null | undefined | unknown,
  catalog?: CatalogRequirement[],
): L1Score;
export function l1FamilyProgress(
  assessment: Assessment | null | undefined | unknown,
  catalog?: CatalogRequirement[],
): L1FamilyProgressRow[];
export function nextL1Action(
  assessment: Assessment | null | undefined | unknown,
  catalog?: CatalogRequirement[],
): L1NextAction;
