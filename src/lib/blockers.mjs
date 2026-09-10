/** Home chips: score.mjs blockers then scope.mjs blockers. */

import { scopeBlockers } from "./scope.mjs";

const RANK = { blocker: 0, warning: 1, info: 2 };

function asList(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {unknown} assessment
 * @param {{ blockers?: unknown } | null | undefined} scoreResult
 * @returns {{ id: string, severity: "blocker" | "warning" | "info", title: string, detail: string, href: string, citation?: string }[]}
 */
export function combinedBlockers(assessment, scoreResult) {
  const scoreChips = asList(scoreResult?.blockers);
  const scopeChips = scopeBlockers(assessment);
  return [...scoreChips, ...scopeChips];
}

/**
 * @param {unknown} assessment
 * @param {{ blockers?: unknown } | null | undefined} scoreResult
 * @param {number} [n]
 */
export function topBlockers(assessment, scoreResult, n = 5) {
  const limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
  return combinedBlockers(assessment, scoreResult)
    .slice()
    .sort((a, b) => (RANK[a?.severity] ?? 9) - (RANK[b?.severity] ?? 9))
    .slice(0, limit);
}
