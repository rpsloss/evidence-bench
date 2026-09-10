export type ReqId = string;
export type AoId = string;
export type Finding = "met" | "not-met" | "na" | "not-reviewed";
export type Weight = 0 | 1 | 3 | 5;
export type OverlayKey = "enc" | "fips";

export interface CatalogObjective {
  aoId: AoId;
  letter: string;
  determineIf: string;
}

export interface PartialCreditMap {
  kind: "mfa" | "fips";
  overlayObjectives?: { key: OverlayKey; determineIf: string }[];
  states: {
    allMet: string[];
    partial: { mustMet: string[]; mustNotMet: string[] };
  };
}

export interface CatalogRequirement {
  cmmcId: string;
  reqId: ReqId;
  family: string;
  title: string;
  statement: string;
  basicOrDerived: "basic" | "derived";
  weight: Weight;
  poamBannedForConditional: boolean;
  naAllowed: boolean;
  objectives: CatalogObjective[];
  partialCredit?: PartialCreditMap;
}

export interface ObjectiveDetermination {
  aoId: AoId;
  finding: Finding;
  rationale?: string;
  evidenceIds?: string[];
  assessedAt?: string | null;
  assessedBy?: string | null;
  letter?: string;
}

export interface FipsOverlay {
  enc: Finding;
  fips: Finding;
}

export interface Determination {
  reqId: ReqId;
  objectives?: ObjectiveDetermination[];
  fipsOverlay?: FipsOverlay;
  finding?: Finding;
  naJustification?: string;
  implementationStub?: string;
  owner?: string;
  enduringException?: boolean;
  sspCitation?: string;
  temporaryDeficiency?: boolean;
}

export interface EvidenceItem {
  id: string;
  title: string;
  kind: string;
  uri: string;
  sha256?: string;
  capturedAt: string;
  expiresAt?: string;
  aoIds: AoId[];
  owner: string;
  draft: boolean;
  notes?: string;
}

export interface OperationalPoaItem {
  id: string;
  reqId: ReqId;
  deficiency?: string;
  progress?: string;
  reviewedAt: string;
  owner?: string;
}

export type NaReject = "na-not-allowed" | "na-justification-required";

export interface RollupResult {
  reqId: ReqId;
  finding: Finding;
  wouldBeFinding: Finding;
  objectives: ObjectiveDetermination[];
}

export function deriveFipsAoFinding(overlay: FipsOverlay | null | undefined): Finding;
export function effectiveObjectives(
  req: CatalogRequirement,
  determination?: Determination | null,
): ObjectiveDetermination[];
export function rollupWouldBeFinding(
  req: CatalogRequirement,
  objectives: ObjectiveDetermination[],
): Finding;
export function evidenceSupportsMet(
  objectives: ObjectiveDetermination[],
  evidence: EvidenceItem[] | null | undefined,
): boolean;
export function applyNa(
  req: CatalogRequirement,
  naJustification?: string | null,
): { ok: true } | { ok: false; reject: NaReject };
export function rollupRequirement(
  req: CatalogRequirement,
  determination: Determination | null | undefined,
  evidence?: EvidenceItem[] | null,
  operationalPoas?: OperationalPoaItem[] | null,
): RollupResult;
export function storedFinding(
  req: CatalogRequirement,
  determination: Determination | null | undefined,
  evidence?: EvidenceItem[] | null,
  operationalPoas?: OperationalPoaItem[] | null,
): Finding;
export function storedFindings(
  catalog: CatalogRequirement[],
  determinations: Record<string, Determination> | null | undefined,
  evidence?: EvidenceItem[] | null,
  operationalPoas?: OperationalPoaItem[] | null,
): Record<string, Finding>;
