import type { Assessment, ScoreBlocker, SspSection } from "../types";

export const SSP_CORE_KEYS: readonly [
  "purpose",
  "boundary",
  "environment",
  "cui-flows",
  "roles",
  "inheritance-esp",
];

export function scopeGraphHash(assessment: Assessment | null | undefined | unknown): string;

export function generateSspOutline(assessment: Assessment | null | undefined | unknown): SspSection[];

export function sspSectionStale(
  sectionRow: SspSection | null | undefined | unknown,
  hash: string,
): boolean;

export function sspWarnings(assessment: Assessment | null | undefined | unknown): ScoreBlocker[];
