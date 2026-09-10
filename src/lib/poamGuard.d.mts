import type { CatalogRequirement, Finding, ReqId, Weight } from "./rollup.mjs";

export type PartialState = "all-met" | "partial-3" | "none-5" | "incomplete" | "contradictory";

export type PoamInsertReject = "requirement-is-met" | "duplicate-req";
export type ConditionalIllegalCode = "banned-requirement" | "weight-gt-1" | "fips-exception-not-met";
export type PoamStatus = "open" | "in-progress" | "closed";

export interface PoamItem {
  id: string;
  reqId: ReqId;
  weakness: string;
  tasks: string;
  owner: string;
  due: string;
  status: PoamStatus;
  conditionalLegal: boolean;
  illegalCode?: ConditionalIllegalCode;
}

export type PoamDraft = Omit<PoamItem, "conditionalLegal" | "illegalCode"> & {
  conditionalLegal?: boolean;
  illegalCode?: ConditionalIllegalCode;
};

export interface ConditionalLegality {
  conditionalLegal: boolean;
  illegalCode?: ConditionalIllegalCode;
}

export type PoamGuardResult =
  | { ok: true; item: PoamItem }
  | { ok: false; reject: PoamInsertReject };

export function deductedWeight(req: CatalogRequirement, partialState?: PartialState | null): Weight;

export function conditionalLegality(input: {
  req: CatalogRequirement;
  finding: Finding;
  partialState?: PartialState | null;
  deductedWeight?: Weight | number | null;
}): ConditionalLegality;

export function poamGuard(input: {
  req: CatalogRequirement;
  finding: Finding;
  existingPoams?: Iterable<Pick<PoamItem, "reqId">> | null;
  item: PoamDraft;
  partialState?: PartialState | null;
  deductedWeight?: Weight | number | null;
}): PoamGuardResult;
