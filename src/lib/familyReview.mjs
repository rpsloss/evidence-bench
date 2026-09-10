/** Consultant family-review flags. All 14 required before prepMarkedAt. Does not submit or affirm. */

/** SPRS L2 Self family stepper order. */
export const FAMILIES = [
  { id: "AC", name: "Access Control" },
  { id: "AT", name: "Awareness and Training" },
  { id: "AU", name: "Audit and Accountability" },
  { id: "CM", name: "Configuration Management" },
  { id: "IA", name: "Identification and Authentication" },
  { id: "IR", name: "Incident Response" },
  { id: "MA", name: "Maintenance" },
  { id: "MP", name: "Media Protection" },
  { id: "PS", name: "Personnel Security" },
  { id: "PE", name: "Physical Protection" },
  { id: "RA", name: "Risk Assessment" },
  { id: "CA", name: "Security Assessment" },
  { id: "SC", name: "System and Communications Protection" },
  { id: "SI", name: "System and Information Integrity" },
];

export const FAMILY_IDS = FAMILIES.map((row) => row.id);

const FAMILY_SET = new Set(FAMILY_IDS);

function str(value) {
  return value == null ? "" : String(value);
}

export function emptyFamilyReview(family) {
  return {
    family,
    reviewed: false,
    reviewer: "",
    reviewedAt: null,
    notes: "",
  };
}

function coerceReview(row, family) {
  const base = emptyFamilyReview(family);
  if (!row || typeof row !== "object" || Array.isArray(row)) return base;
  const reviewedAt = str(row.reviewedAt).trim();
  return {
    family,
    reviewed: row.reviewed === true,
    reviewer: typeof row.reviewer === "string" ? row.reviewer : "",
    reviewedAt: reviewedAt || null,
    notes: typeof row.notes === "string" ? row.notes : "",
  };
}

/**
 * Always 14 rows in SPRS order. Unknown families dropped; missing families filled.
 * @param {unknown} raw
 */
export function normalizeFamilyReviews(raw) {
  const found = new Map();
  if (Array.isArray(raw)) {
    for (const row of raw) {
      const family = str(row?.family).trim().toUpperCase();
      if (!FAMILY_SET.has(family)) continue;
      found.set(family, coerceReview(row, family));
    }
  }
  return FAMILY_IDS.map((id) => found.get(id) || emptyFamilyReview(id));
}

export function reviewForFamily(raw, family) {
  const id = str(family).trim().toUpperCase();
  return normalizeFamilyReviews(raw).find((row) => row.family === id) || emptyFamilyReview(id);
}

export function familyReviewRows(raw) {
  const reviews = normalizeFamilyReviews(raw);
  return FAMILIES.map((meta, i) => ({
    id: meta.id,
    name: meta.name,
    ...reviews[i],
    family: meta.id,
  }));
}

export function allFamiliesReviewed(raw) {
  return normalizeFamilyReviews(raw).every((row) => row.reviewed === true);
}

export function reviewedFamilyCount(raw) {
  return normalizeFamilyReviews(raw).filter((row) => row.reviewed === true).length;
}

/** prepMarkedAt stays null until every family is reviewed. Not a CMMC Status Date. */
export function gatedPrepMarkedAt(rawReviews, prepMarkedAt) {
  if (!allFamiliesReviewed(rawReviews)) return null;
  if (typeof prepMarkedAt !== "string") return null;
  const value = prepMarkedAt.trim();
  return value || null;
}

export function upsertFamilyReview(raw, next) {
  const family = str(next?.family).trim().toUpperCase();
  if (!FAMILY_SET.has(family)) return normalizeFamilyReviews(raw);
  return normalizeFamilyReviews(raw).map((row) => (row.family === family ? coerceReview({ ...row, ...next }, family) : row));
}
