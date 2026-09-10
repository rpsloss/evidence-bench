export type AssetCategory = "cui" | "spa" | "crma" | "specialized" | "oos";
export type ScopeKind = "enterprise" | "enclave";
export type FlowChannel = "email" | "file" | "cad" | "removable-media" | "saas" | "other";
export type SpecializedKind = "ot" | "iiot" | "iot" | "gfe" | "restricted-is" | "test-equipment";

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

export interface ScoreBlocker {
  id: string;
  severity: "blocker" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  citation?: string;
}

export interface Assessment {
  id: string;
  standard: "NIST-SP-800-171-R2";
  catalogHash: string;
  organization: Organization;
  scope: Scope;
  assets: Asset[];
  flows: CuiFlow[];
  determinations: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  poams: unknown[];
  operationalPoas: unknown[];
  ssp: unknown[];
  familyReviews: unknown[];
  prepMarkedAt: string | null;
  schemaVersion: 1;
}
