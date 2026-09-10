import type { OperationalPoaItem } from "./lib/rollup.mjs";
import type { PoamItem } from "./lib/poamGuard.mjs";

export type { OperationalPoaItem, PoamItem };
export type AssetCategory = "cui" | "spa" | "crma" | "specialized" | "oos";
export type ScopeKind = "enterprise" | "enclave";
export type FlowChannel = "email" | "file" | "cad" | "removable-media" | "saas" | "other";
export type SpecializedKind = "ot" | "iiot" | "iot" | "gfe" | "restricted-is" | "test-equipment";
export type Finding = "met" | "not-met" | "na" | "not-reviewed";
export type CmmcStatus =
  | "assessment-incomplete"
  | "no-cmmc-status"
  | "conditional-l2-self"
  | "final-l2-self";
export type Weight = 0 | 1 | 3 | 5;

export interface Organization {
  id: string;
  name: string;
  fictional: true;
  cage: string;
  employeeCount: number | null;
  affirmingOfficial: {
    name: string;
    title: string;
    email: string;
  } | null;
}

export interface Scope {
  kind: ScopeKind;
  narrative: string;
  isolationSummary: string;
  cuiCategoriesGeneric: string[];
  diagramEvidenceId: string | null;
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  justification: string;
  specializedKind?: SpecializedKind;
  notes: string;
}

export interface CuiFlow {
  id: string;
  fromAssetId: string;
  toAssetId: string;
  channel: FlowChannel;
  inBoundary: boolean;
  notes: string;
}

export interface ObjectiveDetermination {
  aoId: string;
  finding: Finding;
  rationale: string;
  evidenceIds: string[];
  assessedAt: string | null;
  assessedBy: string | null;
}

export interface Determination {
  reqId: string;
  objectives: ObjectiveDetermination[];
  fipsOverlay?: { enc: Finding; fips: Finding };
  finding: Finding;
  naJustification: string;
  implementationStub: string;
  owner: string;
  enduringException: boolean;
  sspCitation: string;
  temporaryDeficiency: boolean;
}

export type EvidenceKind =
  | "policy"
  | "sop"
  | "config"
  | "screenshot"
  | "ticket"
  | "training"
  | "esp_crm"
  | "diagram"
  | "interview"
  | "log_export"
  | "physical";

export interface EvidenceItem {
  id: string;
  title: string;
  kind: EvidenceKind;
  uri: string;
  sha256?: string;
  capturedAt: string;
  expiresAt?: string;
  aoIds: string[];
  owner: string;
  draft: boolean;
  notes: string;
}

export interface PoamItem {
  id: string;
  reqId: string;
  weakness: string;
  tasks: string;
  owner: string;
  due: string;
  status: "open" | "in-progress" | "closed";
  conditionalLegal: boolean;
  illegalCode?: string;
}

export interface OperationalPoaItem {
  id: string;
  reqId: string;
  deficiency: string;
  progress: string;
  reviewedAt: string;
  owner: string;
}

export interface SspSection {
  id: string;
  key: string;
  title: string;
  body: string;
  generatedFrom: string;
}

export interface FamilyReview {
  family: string;
  reviewed: boolean;
  reviewer: string;
  reviewedAt: string | null;
  notes: string;
}

export interface ScoreBlocker {
  id: string;
  severity: "blocker" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  citation?: string;
}

export interface DeductedRow {
  reqId: string;
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

export interface Assessment {
  id: string;
  standard: "NIST-SP-800-171-R2";
  catalogHash: string;
  organization: Organization;
  scope: Scope;
  assets: Asset[];
  flows: CuiFlow[];
  determinations: Record<string, Determination>;
  evidence: EvidenceItem[];
  poams: PoamItem[];
  operationalPoas: OperationalPoaItem[];
  ssp: SspSection[];
  familyReviews: FamilyReview[];
  prepMarkedAt: string | null;
  schemaVersion: 1;
}
