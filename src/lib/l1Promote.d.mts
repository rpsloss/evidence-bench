import type { Assessment, Determination } from "../types";
import type { CatalogRequirement } from "./rollup.mjs";
import type { AssemblerPunchList, PunchListHomeItem } from "./familyProgress.mjs";

export function l1MappedReqIds(catalog?: CatalogRequirement[]): string[];
export function l1MappedReqIdSet(catalog?: CatalogRequirement[]): Set<string>;
export function l1MappedAoIdSet(catalog?: CatalogRequirement[]): Set<string>;
export function unansweredDet(req: CatalogRequirement): Determination;

export function canPromoteToL2(
  assessment: Assessment | null | undefined | unknown,
): { ok: true; error: null } | { ok: false; error: "not-l2-required" | "intake" | "not-working-l1" | "l1-incomplete" };

export function promoteToL2(
  assessment: Assessment,
  at?: string,
):
  | { ok: true; error: null; assessment: Assessment }
  | { ok: false; error: "not-l2-required" | "intake" | "not-working-l1" | "l1-incomplete" };

export interface L2DeltaPunchList extends AssemblerPunchList {
  creditedFromL1: string[];
  isDelta: true;
  counts: AssemblerPunchList["counts"] & { creditedFromL1: number; l2DeltaReqs: number };
}

export function l2DeltaPunchList(
  assessment: Assessment | null | undefined | unknown,
  catalog?: CatalogRequirement[],
  now?: number,
): L2DeltaPunchList;

export function l2DeltaHomeItems(
  assessment: Assessment | null | undefined | unknown,
  catalog?: CatalogRequirement[],
  now?: number,
): PunchListHomeItem[];

export function promoteErrorMessage(error: string | null | undefined): string;
