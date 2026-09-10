/** 170.21 legality is derived. Insert 400 only for met/NA or duplicate req. */

function asList(value) {
  return Array.isArray(value) ? [...value] : value == null ? [] : Array.from(value);
}

function str(value) {
  return value == null ? "" : String(value);
}

function asWeight(value, fallback) {
  if (value === 0 || value === 1 || value === 3 || value === 5) return value;
  return fallback;
}

/**
 * Catalog weight, except MFA/FIPS 0/3/5 from derivePartialState.
 * A stored NOT MET partial-credit row never deducts 0 (keeper refusal → 5).
 * @param {object} req
 * @param {string | null | undefined} partialState
 * @param {string | null | undefined} finding
 * @returns {0 | 1 | 3 | 5}
 */
export function deductedWeight(req, partialState, finding) {
  if (req?.partialCredit) {
    if (finding === "not-met") {
      if (partialState === "partial-3") return 3;
      return 5;
    }
    if (partialState === "partial-3") return 3;
    if (partialState === "none-5" || partialState === "contradictory") return 5;
    if (partialState === "all-met" || partialState === "incomplete") return 0;
  }
  return asWeight(req?.weight, 1);
}

const BANNED_CITATIONS = {
  "3.1.20": "32 CFR 170.21(a)(2)(iii)(A)",
  "3.1.22": "32 CFR 170.21(a)(2)(iii)(B)",
  "3.12.4": "32 CFR 170.21(a)(2)(iii)(C)",
  "3.10.3": "32 CFR 170.21(a)(2)(iii)(D)",
  "3.10.4": "32 CFR 170.21(a)(2)(iii)(E)",
  "3.10.5": "32 CFR 170.21(a)(2)(iii)(F)",
};

/**
 * Chip copy for a Conditional-illegal register row. Not legal advice.
 * @param {string | null | undefined} illegalCode
 * @param {string | null | undefined} reqId
 */
export function citationForIllegal(illegalCode, reqId) {
  if (illegalCode === "banned-requirement") {
    return BANNED_CITATIONS[str(reqId)] || "32 CFR 170.21(a)(2)(iii)";
  }
  if (illegalCode === "weight-gt-1" || illegalCode === "fips-exception-not-met") {
    return "32 CFR 170.21(a)(2)(ii)";
  }
  return "32 CFR 170.21(a)(2)";
}

/**
 * Stored flag is not authority — score() re-runs this.
 * @param {{ req: object, finding: string, partialState?: string | null, deductedWeight?: number | null }} input
 */
export function conditionalLegality(input) {
  const req = input?.req;
  const finding = input?.finding;
  if (finding !== "not-met" || !req) return { conditionalLegal: false };
  if (req.poamBannedForConditional === true) {
    return { conditionalLegal: false, illegalCode: "banned-requirement" };
  }
  const partialState = input.partialState ?? null;
  if (req.partialCredit?.kind === "fips" && partialState === "none-5") {
    return { conditionalLegal: false, illegalCode: "fips-exception-not-met" };
  }
  if (req.partialCredit?.kind === "fips" && partialState === "partial-3") {
    return { conditionalLegal: true };
  }
  const weight =
    input.deductedWeight === 0 || input.deductedWeight === 1 || input.deductedWeight === 3 || input.deductedWeight === 5
      ? input.deductedWeight
      : deductedWeight(req, partialState, finding);
  if (weight > 1) return { conditionalLegal: false, illegalCode: "weight-gt-1" };
  return { conditionalLegal: true };
}

/**
 * @param {{ req: object, finding: string, existingPoams?: object[], item: object, partialState?: string, deductedWeight?: number }} input
 */
export function poamGuard(input) {
  const req = input?.req;
  const finding = input?.finding;
  const item = input?.item && typeof input.item === "object" ? input.item : {};
  if (finding === "met" || finding === "na") {
    return { ok: false, reject: "requirement-is-met" };
  }
  const reqId = str(item.reqId || req?.reqId);
  const existing = asList(input?.existingPoams);
  if (existing.some((row) => row && str(row.reqId) === reqId)) {
    return { ok: false, reject: "duplicate-req" };
  }
  const legality = conditionalLegality({
    req,
    finding,
    partialState: input?.partialState,
    deductedWeight: input?.deductedWeight,
  });
  const next = {
    id: str(item.id),
    reqId,
    weakness: str(item.weakness),
    tasks: str(item.tasks),
    owner: str(item.owner),
    due: str(item.due),
    status: item.status === "in-progress" || item.status === "closed" ? item.status : "open",
    conditionalLegal: legality.conditionalLegal === true,
  };
  if (!next.conditionalLegal && legality.illegalCode) next.illegalCode = legality.illegalCode;
  const out = { ok: true, item: next };
  if (!next.conditionalLegal) {
    out.citation = citationForIllegal(next.illegalCode, next.reqId);
  }
  return out;
}
