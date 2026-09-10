import type { FamilyReview } from "../types";

export const FAMILIES: readonly { id: string; name: string }[];
export const FAMILY_IDS: readonly string[];

export function emptyFamilyReview(family: string): FamilyReview;
export function isFamilyReviewed(row: unknown): boolean;
export function normalizeFamilyReviews(raw: unknown): FamilyReview[];
export function reviewForFamily(raw: unknown, family: string): FamilyReview;
export function familyReviewRows(
  raw: unknown,
): Array<FamilyReview & { id: string; name: string }>;
export function allFamiliesReviewed(raw: unknown): boolean;
export function reviewedFamilyCount(raw: unknown): number;
export function gatedPrepMarkedAt(rawReviews: unknown, prepMarkedAt: unknown): string | null;
export function upsertFamilyReview(raw: unknown, next: Partial<FamilyReview> & { family?: string }): FamilyReview[];
