import type { Organization } from "../types";

export const INFORMATION_TYPES: readonly ["unknown", "fci-only", "cui", "both"];
export const REQUIRED_LEVELS: readonly ["undetermined", "level-1-self", "level-2-self"];
export const WORKING_LEVELS: readonly ["level-1-self", "level-2-self"];
export const ENGAGEMENT_PHASES: readonly ["intake", "l1-prep", "l2-prep"];
export const CLAUSE_KEYS: readonly ["far5220421", "dfars7012", "dfars7021"];

export type InformationType = (typeof INFORMATION_TYPES)[number];
export type RequiredCmmcLevel = (typeof REQUIRED_LEVELS)[number];
export type WorkingLevel = (typeof WORKING_LEVELS)[number];
export type EngagementPhase = (typeof ENGAGEMENT_PHASES)[number];

export interface EngagementClauses {
  far5220421: boolean | null;
  dfars7012: boolean | null;
  dfars7021: boolean | null;
  notes: string;
}

export interface Engagement {
  informationType: InformationType;
  requiredLevel: RequiredCmmcLevel;
  workingLevel: WorkingLevel;
  clauses: EngagementClauses;
  additionalCages: string[];
  currentPhase: EngagementPhase;
  intakeNotedAt: string | null;
  promotedFromL1At: string | null;
  l1CreditedReqIds: string[];
  l1TypedAt: string | null;
  l2AffirmedAt: string | null;
}

export interface EngagementNextAction {
  href: string;
  title: string;
  detail: string;
}

export function emptyEngagement(): Engagement;

export function requiredLevelFromInformation(informationType: string | null | undefined): RequiredCmmcLevel;

export function coerceWorkingLevel(
  requiredLevel: string | null | undefined,
  requested: string | null | undefined,
): WorkingLevel;

export function derivePhase(input: {
  requiredLevel?: string | null;
  workingLevel?: string | null;
  intakeNotedAt?: string | null;
}): EngagementPhase;

export function isWorkingLevel1(engagement: Engagement | null | undefined | unknown): boolean;

export function informationLabel(value: string | null | undefined): string;
export function levelLabel(value: string | null | undefined): string;
export function phaseLabel(value: string | null | undefined): string;

export function uniqueCages(
  org: Organization | { cage?: string | null } | null | undefined,
  engagement: Engagement | { additionalCages?: unknown } | null | undefined,
): string[];

export function normalizeEngagement(raw: unknown): Engagement;

export function confirmIntake(engagement: unknown, at?: string): Engagement;

export function engagementNextAction(
  engagement: unknown,
  assemblerNext?: { href?: string; title?: string; detail?: string } | null,
  l1Next?: { href?: string; title?: string; detail?: string } | null,
): EngagementNextAction;
