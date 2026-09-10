import type { ScoreBlocker } from "../types";
import type {
  CatalogRequirement,
  Determination,
  EvidenceItem,
  Finding,
  FipsOverlay,
  ObjectiveDetermination,
  OperationalPoaItem,
  ReqId,
  Weight,
} from "./rollup.mjs";
import type { ConditionalLegality, PoamItem } from "./poamGuard.mjs";

export type PartialState = "all-met" | "partial-3" | "none-5" | "incomplete" | "contradictory";
export type CmmcStatus =
  | "assessment-incomplete"
  | "no-cmmc-status"
  | "conditional-l2-self"
  | "final-l2-self";

export interface ScoreInput {
  catalog: CatalogRequirement[];
  determinations: Record<string, Determination>;
  sspBody: string;
  poams: PoamItem[];
  evidence: EvidenceItem[];
  operationalPoas: OperationalPoaItem[];
  catalogHash?: string | null;
  expectedCatalogHash?: string | null;
}

export interface DeductedRow {
  reqId: ReqId;
  weight: Weight;
  reason: string;
}

export interface AssessmentScore {
  raw: number;
  max: 110;
  floor: -203;
  status: CmmcStatus;
  conditionalEligible: boolean;
  poamLegal: boolean;
  sspPresent: boolean;
  blockers: ScoreBlocker[];
  deducted: DeductedRow[];
  computedAt: string;
}

export const MAX_SCORE: 110;
export const FLOOR_SCORE: -203;

export class CatalogHashMismatch extends Error {
  name: "CatalogHashMismatch";
  code: "catalog-hash-mismatch";
  constructor();
}

export function derivePartialState(
  req: CatalogRequirement,
  aos: ObjectiveDetermination[],
  fipsOverlay?: FipsOverlay | null,
): PartialState;

export function score(input: ScoreInput): AssessmentScore;

export function legalityForNotMet(
  req: CatalogRequirement,
  finding: Finding,
  partialState: PartialState,
): ConditionalLegality;
