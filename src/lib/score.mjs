/** Catalog-pure 170.24 score. MFA/FIPS are derived; never accepted as score-API enums. */

import { conditionalLegality, deductedWeight } from "./poamGuard.mjs";
import { rollupRequirement } from "./rollup.mjs";

export const MAX_SCORE = 110;
export const FLOOR_SCORE = -203;

const MET_OR_NA = new Set(["met", "na"]);

export class CatalogHashMismatch extends Error {
  constructor() {
    super("catalog-hash-mismatch");
    this.name = "CatalogHashMismatch";
    this.code = "catalog-hash-mismatch";
  }
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  return value == null ? "" : String(value);
}

function findingOf(aos, key) {
  for (const ao of asList(aos)) {
    if (str(ao?.letter) === key) return ao.finding;
    if (str(ao?.aoId).endsWith(`[${key}]`)) return ao.finding;
  }
  return "not-reviewed";
}

/**
 * @param {object} req
 * @param {object[]} aos
 * @param {{ enc?: string, fips?: string } | null | undefined} fipsOverlay
 * @returns {"all-met" | "partial-3" | "none-5" | "incomplete" | "contradictory"}
 */
export function derivePartialState(req, aos, fipsOverlay) {
  const pc = req?.partialCredit;
  if (!pc || typeof pc !== "object") return "all-met";
  const allMet = asList(pc.states?.allMet).map(str);
  const mustMet = asList(pc.states?.partial?.mustMet).map(str);
  const mustNotMet = asList(pc.states?.partial?.mustNotMet).map(str);

  const valueOf = (key) => {
    if (pc.kind === "fips") {
      if (!fipsOverlay || typeof fipsOverlay !== "object") return "not-reviewed";
      if (key === "enc" || key === "fips") {
        const v = fipsOverlay[key];
        return v === "met" || v === "not-met" || v === "na" || v === "not-reviewed" ? v : "not-reviewed";
      }
    }
    return findingOf(aos, key);
  };

  const keys = [...new Set([...allMet, ...mustMet, ...mustNotMet])];
  if (keys.some((k) => valueOf(k) === "not-reviewed")) return "incomplete";
  if (allMet.length && allMet.every((k) => MET_OR_NA.has(valueOf(k)))) return "all-met";
  if (
    mustMet.length &&
    mustMet.every((k) => MET_OR_NA.has(valueOf(k))) &&
    mustNotMet.length &&
    mustNotMet.every((k) => valueOf(k) === "not-met")
  ) {
    return "partial-3";
  }
  const hasNotMet = keys.some((k) => valueOf(k) === "not-met");
  const hasMet = keys.some((k) => MET_OR_NA.has(valueOf(k)));
  // Mixed leftover MFA letters are not a coherent "none" — warn, still deduct 5.
  if (pc.kind === "mfa" && hasNotMet && hasMet) return "contradictory";
  return "none-5";
}

function reasonFor(req, partialState, weight) {
  if (req?.partialCredit?.kind === "mfa") {
    if (partialState === "partial-3") return "mfa-remote-and-privileged-only";
    if (partialState === "contradictory") return "mfa-contradictory";
    return "mfa-none";
  }
  if (req?.partialCredit?.kind === "fips") {
    if (partialState === "partial-3") return "fips-encrypt-not-fips";
    return "fips-none";
  }
  if (req?.reqId === "3.12.4") return "ssp-not-met";
  return weight === 0 ? "not-met-weight-0" : "not-met";
}

function blocker(id, severity, title, detail, href, citation) {
  const row = { id, severity, title, detail, href };
  if (citation) row.citation = citation;
  return row;
}

export function legalityForNotMet(req, finding, partialState) {
  return conditionalLegality({
    req,
    finding,
    partialState,
    deductedWeight: deductedWeight(req, partialState, finding),
  });
}

/** Align stored finding with the MFA/FIPS table before deduct/status. */
function scoringState(req, det, evidence, operationalPoas) {
  const rolled = rollupRequirement(req, det, evidence, operationalPoas);
  let finding = rolled.finding;
  const partialState = req.partialCredit
    ? derivePartialState(req, rolled.objectives, det?.fipsOverlay)
    : finding === "not-reviewed"
      ? "incomplete"
      : finding === "not-met"
        ? "none-5"
        : "all-met";
  if (req.partialCredit && partialState === "incomplete") finding = "not-reviewed";
  const deductState =
    finding === "not-met" && req.partialCredit && partialState === "all-met" ? "none-5" : partialState;
  return { finding, partialState, deductState };
}

/**
 * @param {{
 *   catalog: object[],
 *   determinations?: object,
 *   sspBody?: string,
 *   poams?: object[],
 *   evidence?: object[],
 *   operationalPoas?: object[],
 *   catalogHash?: string | null,
 *   expectedCatalogHash?: string | null,
 * }} input
 */
export function score(input) {
  const expected = str(input?.expectedCatalogHash).trim();
  if (expected && str(input?.catalogHash).trim() !== expected) {
    throw new CatalogHashMismatch();
  }

  const catalog = asList(input?.catalog);
  const determinations = input?.determinations && typeof input.determinations === "object" ? input.determinations : {};
  const evidence = asList(input?.evidence);
  const operationalPoas = asList(input?.operationalPoas);
  const poams = asList(input?.poams);
  const sspPresent = str(input?.sspBody).trim().length > 0;

  const deducted = [];
  const blockers = [];
  const notMetIds = [];
  let notReviewedCount = 0;
  let allMetOrNa = catalog.length > 0;
  let contradictoryMfa = false;

  for (const req of catalog) {
    if (!req || typeof req !== "object") continue;
    const reqId = str(req.reqId);
    const det = determinations[reqId];
    const { finding, deductState } = scoringState(req, det, evidence, operationalPoas);

    if (finding === "not-reviewed") {
      notReviewedCount += 1;
      allMetOrNa = false;
      continue;
    }
    if (finding !== "met" && finding !== "na") allMetOrNa = false;
    if (finding !== "not-met") continue;

    notMetIds.push(reqId);
    const weight = deductedWeight(req, deductState, finding);
    deducted.push({ reqId, weight, reason: reasonFor(req, deductState, weight) });
    if (deductState === "contradictory") contradictoryMfa = true;
  }

  const raw = MAX_SCORE - deducted.reduce((n, row) => n + row.weight, 0);
  const poamsByReq = new Map();
  for (const row of poams) {
    if (!row || typeof row !== "object") continue;
    const id = str(row.reqId);
    if (id && !poamsByReq.has(id)) poamsByReq.set(id, row);
  }

  let everyNotMetHasPoam = true;
  let everyPoamLegal = true;
  const missing = [];
  const illegal = [];
  for (const reqId of notMetIds) {
    const req = catalog.find((r) => r && str(r.reqId) === reqId);
    const det = determinations[reqId];
    const { deductState } = scoringState(req, det, evidence, operationalPoas);
    const item = poamsByReq.get(reqId);
    if (!item) {
      everyNotMetHasPoam = false;
      missing.push(reqId);
      everyPoamLegal = false;
      continue;
    }
    const legality = conditionalLegality({
      req,
      finding: "not-met",
      partialState: deductState,
      deductedWeight: deductedWeight(req, deductState, "not-met"),
    });
    if (legality.conditionalLegal !== true) {
      everyPoamLegal = false;
      illegal.push(reqId);
    }
  }

  const incomplete = notReviewedCount > 0 || !sspPresent;
  const poamLegal = everyNotMetHasPoam && everyPoamLegal;
  const conditionalEligible = !incomplete && !allMetOrNa && raw >= 88 && sspPresent && poamLegal;

  let status;
  if (incomplete) status = "assessment-incomplete";
  else if (allMetOrNa) status = "final-l2-self";
  else if (conditionalEligible) status = "conditional-l2-self";
  else status = "no-cmmc-status";

  if (!sspPresent) {
    blockers.push(
      blocker(
        "ssp-missing",
        "blocker",
        "SSP missing",
        "SSP missing or empty. 32 CFR 170.24: an assessment cannot be completed without an SSP. Not a SPRS score.",
        "/ssp",
        "32 CFR 170.24(c)(2)(i)(5)",
      ),
    );
  }
  if (notReviewedCount > 0) {
    blockers.push(
      blocker(
        "not-reviewed",
        "blocker",
        "Objectives unanswered",
        `${notReviewedCount} requirement(s) are not-reviewed. Not a SPRS score.`,
        "/requirements",
        "32 CFR 170.16(c)(1)",
      ),
    );
  }
  if (contradictoryMfa) {
    blockers.push(
      blocker(
        "mfa-contradictory",
        "warning",
        "MFA objectives are contradictory",
        "3.5.3 letters do not match all-users or remote-and-privileged-only. Deduct 5. Not MET.",
        "/requirements",
        "32 CFR 170.24(c)(2)(i)(4)",
      ),
    );
  }
  if (notMetIds.includes("3.12.4")) {
    blockers.push(
      blocker(
        "ssp-not-met",
        "blocker",
        "CA.L2-3.12.4 is NOT MET",
        "Weight 0 so raw may still be 110, but SPRS would show No CMMC Status. Not Final. Not Conditional-legal.",
        "/ssp",
        "32 CFR 170.21(a)(2)(iii)(C)",
      ),
    );
  }
  if (missing.length) {
    blockers.push(
      blocker(
        "poam-missing",
        "blocker",
        "NOT MET missing from the POA&M register",
        `${missing.length} NOT MET requirement(s) have no PoamItem. The gap stays off Conditional.`,
        "/poam",
        "32 CFR 170.24(c)(2)(i)(6)",
      ),
    );
  }
  if (illegal.length) {
    blockers.push(
      blocker(
        "poam-illegal",
        "blocker",
        "POA&M item is not 170.21-legal",
        `${illegal.length} NOT MET item(s) stay on the register and block Conditional.`,
        "/poam",
        "32 CFR 170.21(a)(2)",
      ),
    );
  }
  if (!incomplete && raw < 88) {
    blockers.push(
      blocker(
        "score-below-88",
        "blocker",
        "Score below 88",
        `Score ${raw} is below 88. SPRS would show No CMMC Status. Do not affirm.`,
        "/",
        "32 CFR 170.21(a)(2)",
      ),
    );
  }

  return {
    raw,
    max: MAX_SCORE,
    floor: FLOOR_SCORE,
    status,
    conditionalEligible,
    poamLegal,
    sspPresent,
    blockers,
    deducted,
    computedAt: new Date().toISOString(),
  };
}

/** 3.12.4 body is the incomplete-assessment gate; other SSP sections are fallback. */
export function sspBodyOf(assessment) {
  const ssp = assessment?.ssp;
  if (typeof ssp === "string") return ssp;
  const sections = asList(ssp);
  const hit = sections.find((row) => {
    if (!row || typeof row !== "object") return false;
    const key = str(row.key);
    const id = str(row.id);
    const title = str(row.title);
    return key === "req:3.12.4" || id.includes("3.12.4") || title.includes("3.12.4");
  });
  if (hit && typeof hit.body === "string") return hit.body;
  return sections.map((row) => str(row?.body)).join("\n");
}

/**
 * Score an Assessment object. Empty catalogHash is treated as the expected hash
 * so pre-catalog packages still score; a non-matching hash still refuses.
 */
export function scoreFromAssessment(assessment, catalog, expectedCatalogHash) {
  const expected = str(expectedCatalogHash).trim();
  const got = str(assessment?.catalogHash).trim();
  return score({
    catalog: asList(catalog),
    determinations: assessment?.determinations,
    sspBody: sspBodyOf(assessment),
    poams: assessment?.poams,
    evidence: assessment?.evidence,
    operationalPoas: assessment?.operationalPoas,
    catalogHash: got || expected,
    expectedCatalogHash: expected || null,
  });
}
