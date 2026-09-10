/** AO roll-up then evidence gate. Overlay keys are never 171A objectives. */

const FINDINGS = new Set(["met", "not-met", "na", "not-reviewed"]);
const MET_OR_NA = new Set(["met", "na"]);

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  return value == null ? "" : String(value);
}

function asFinding(value) {
  return FINDINGS.has(value) ? value : "not-reviewed";
}

function letterOf(ao) {
  if (ao && str(ao.letter)) return str(ao.letter);
  const m = /\[([a-z]+)\]$/i.exec(str(ao?.aoId));
  return m ? m[1] : "";
}

/**
 * 3.13.11 [a] is derived from Open Objective overlays, never from a user enum.
 * @param {{ enc?: string, fips?: string } | null | undefined} overlay
 * @returns {"met" | "not-met" | "na" | "not-reviewed"}
 */
export function deriveFipsAoFinding(overlay) {
  if (!overlay || typeof overlay !== "object") return "not-reviewed";
  const enc = asFinding(overlay.enc);
  const fips = asFinding(overlay.fips);
  if (enc === "not-reviewed" || fips === "not-reviewed") return "not-reviewed";
  if (enc === "not-met") return "not-met";
  if (fips === "not-met") return "not-met";
  if (enc === "na" && fips === "na") return "na";
  return "met";
}

export const EVIDENCE_KINDS = [
  "policy",
  "sop",
  "config",
  "screenshot",
  "ticket",
  "training",
  "esp_crm",
  "diagram",
  "interview",
  "log_export",
  "physical",
];

/** Family default freshness. Stale is a gap-board warning, not a MET breaker. */
export const FRESHNESS_DAYS = {
  policy: 365,
  sop: 365,
  config: 90,
  screenshot: 90,
  ticket: 90,
  training: 365,
  esp_crm: 365,
  diagram: 365,
  interview: 365,
  log_export: 90,
  physical: 365,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CUI_NAME_RE = /cui|fouo|itar/i;

export function evidenceBasename(uri) {
  const s = str(uri).trim();
  const parts = s.split(/[/\\]/);
  return parts[parts.length - 1] || s;
}

/** Filename deny-list is a warning, not a detector and not a 400. */
export function cuiFilenameRisk(uri) {
  return CUI_NAME_RE.test(evidenceBasename(uri));
}

export function isStaleEvidence(item, now = Date.now()) {
  if (!item || typeof item !== "object") return false;
  const expires = Date.parse(str(item.expiresAt));
  if (Number.isFinite(expires) && expires < now) return true;
  const captured = Date.parse(str(item.capturedAt));
  if (!Number.isFinite(captured)) return true;
  const days = FRESHNESS_DAYS[str(item.kind)] ?? 90;
  return now - captured > days * DAY_MS;
}

export function catalogAoIdSet(catalog) {
  const set = new Set();
  for (const req of asList(catalog)) {
    for (const ao of asList(req?.objectives)) {
      const id = str(ao?.aoId);
      if (id) set.add(id);
    }
  }
  return set;
}

/** Overlay keys (enc/fips) are not 171A AOs and never attach. */
export function filter171AAoIds(aoIds, catalog) {
  const allowed = catalogAoIdSet(catalog);
  const out = [];
  const seen = new Set();
  for (const raw of asList(aoIds)) {
    const id = str(raw);
    if (!id || !allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function linkedEvidenceIds(aoId, evidence) {
  const id = str(aoId);
  if (!id) return [];
  const out = [];
  for (const item of asList(evidence)) {
    if (!item || typeof item !== "object") continue;
    const itemId = str(item.id);
    if (!itemId) continue;
    const aoIds = asList(item.aoIds).map(str).filter(Boolean);
    if (aoIds.includes(id)) out.push(itemId);
  }
  return out;
}

/**
 * @param {object} req
 * @param {object | null | undefined} determination
 * @param {object[] | null | undefined} evidence
 */
export function effectiveObjectives(req, determination, evidence) {
  const provided = asList(determination?.objectives);
  const byId = new Map();
  for (const row of provided) {
    if (!row || typeof row !== "object") continue;
    const aoId = str(row.aoId);
    if (aoId) byId.set(aoId, row);
  }
  const fipsKind = req?.partialCredit?.kind === "fips";
  const derivedA = fipsKind ? deriveFipsAoFinding(determination?.fipsOverlay) : null;
  return asList(req?.objectives).map((ao) => {
    const aoId = str(ao.aoId);
    const prev = byId.get(aoId);
    const finding = fipsKind && letterOf(ao) === "a" ? derivedA : asFinding(prev?.finding);
    return {
      aoId,
      letter: letterOf(ao) || letterOf(prev),
      finding,
      rationale: str(prev?.rationale),
      // aoIds on EvidenceItem is authoritative; evidenceIds is derived on read.
      evidenceIds: linkedEvidenceIds(aoId, evidence),
      assessedAt: prev?.assessedAt ?? null,
      assessedBy: prev?.assessedBy ?? null,
    };
  });
}

/**
 * Invariant 1. N/A on 3.12.4 never stores `na`.
 * @param {object} req
 * @param {object[]} objectives
 */
export function rollupWouldBeFinding(req, objectives) {
  const catalogAos = asList(req?.objectives);
  if (catalogAos.length === 0) return "not-reviewed";
  const byId = new Map(asList(objectives).map((ao) => [str(ao.aoId), asFinding(ao.finding)]));
  const findings = catalogAos.map((ao) => byId.get(str(ao.aoId)) ?? "not-reviewed");
  if (findings.every((f) => f === "na")) {
    return req?.naAllowed === true ? "na" : "not-reviewed";
  }
  // MFA/FIPS table: any unanswered letter/overlay is incomplete even if another is not-met.
  if (req?.partialCredit && findings.some((f) => f === "not-reviewed")) return "not-reviewed";
  if (findings.some((f) => f === "not-met")) return "not-met";
  if (findings.every((f) => MET_OR_NA.has(f))) return "met";
  return "not-reviewed";
}

function mappedEvidence(aoId, evidence) {
  const id = str(aoId);
  if (!id) return [];
  const out = [];
  for (const item of asList(evidence)) {
    if (!item || typeof item !== "object") continue;
    if (item.draft === true) continue;
    const aoIds = asList(item.aoIds).map(str).filter(Boolean);
    // Empty aoIds is unmapped and never credits MET.
    if (aoIds.length === 0) continue;
    if (!aoIds.includes(id)) continue;
    out.push(item);
  }
  return out;
}

/**
 * Invariant 3. Overlay keys are not 171A letters and never require evidence.
 * @param {object[]} objectives
 * @param {object[] | null | undefined} evidence
 */
export function evidenceSupportsMet(objectives, evidence) {
  for (const ao of asList(objectives)) {
    if (asFinding(ao?.finding) !== "met") continue;
    const items = mappedEvidence(ao.aoId, evidence);
    if (items.length === 0) return false;
    if (!items.some((item) => str(item.kind) !== "interview")) return false;
  }
  return true;
}

/**
 * Gap board: missing / stale / unmapped / draft / missing sha256.
 * Missing is a MET breaker. Stale is a warning unless every linked item is also draft.
 */
export function evidenceGapBoard(catalog, determinations, evidence, now = Date.now()) {
  const items = asList(evidence);
  const dets = determinations && typeof determinations === "object" ? determinations : {};
  const missing = [];
  for (const req of asList(catalog)) {
    if (!req || typeof req !== "object") continue;
    const objectives = effectiveObjectives(req, dets[str(req.reqId)], items);
    for (const ao of objectives) {
      if (asFinding(ao.finding) !== "met") continue;
      if (mappedEvidence(ao.aoId, items).length > 0) continue;
      missing.push({ aoId: ao.aoId, reqId: str(req.reqId), cmmcId: str(req.cmmcId) });
    }
  }
  const unmapped = [];
  const draft = [];
  const stale = [];
  const missingSha256 = [];
  const cuiRisk = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (asList(item.aoIds).map(str).filter(Boolean).length === 0) unmapped.push(item);
    if (item.draft === true) draft.push(item);
    if (isStaleEvidence(item, now)) stale.push(item);
    if (!str(item.sha256).trim()) missingSha256.push(item);
    if (cuiFilenameRisk(item.uri)) cuiRisk.push(item);
  }
  return { missing, unmapped, draft, stale, missingSha256, cuiRisk };
}

function hasOperationalPoa(reqId, operationalPoas) {
  const id = str(reqId);
  return asList(operationalPoas).some(
    (row) => row && typeof row === "object" && str(row.reqId) === id && str(row.reviewedAt).trim(),
  );
}

/**
 * @param {object} req
 * @param {string | null | undefined} naJustification
 */
export function applyNa(req, naJustification) {
  if (req?.naAllowed !== true) return { ok: false, reject: "na-not-allowed" };
  if (!str(naJustification).trim()) return { ok: false, reject: "na-justification-required" };
  return { ok: true };
}

function overlayAllNa(req, determination) {
  if (req?.partialCredit?.kind !== "fips") return false;
  const overlay = determination?.fipsOverlay;
  return Boolean(overlay && overlay.enc === "na" && overlay.fips === "na");
}

/** True when the row is (or would be) requirement-level N/A. */
export function determinationWantsNa(req, determination) {
  const det = determination && typeof determination === "object" ? determination : {};
  if (det.finding === "na") return true;
  const objectives = effectiveObjectives(req, det);
  const aosNa = objectives.length > 0 && objectives.every((ao) => asFinding(ao.finding) === "na");
  if (req?.partialCredit?.kind === "fips") return aosNa && overlayAllNa(req, det);
  return aosNa;
}

/** Write-gate shared by the UI and PUT /api/assessment. */
export function guardNaWrite(req, determination) {
  if (!determinationWantsNa(req, determination)) return { ok: true };
  return applyNa(req, determination?.naJustification);
}

function applyMetGates(req, determination, wouldBe, objectives, evidence, operationalPoas) {
  let finding = wouldBe;
  if (finding === "met" && !evidenceSupportsMet(objectives, evidence)) {
    finding = "not-reviewed";
  }
  if (finding !== "met") return finding;
  const det = determination && typeof determination === "object" ? determination : {};
  const enduring = det.enduringException === true;
  const temporary = det.temporaryDeficiency === true;
  // Mutual exclusion plus the operational-POA / SSP-citation keepers for MET.
  if (enduring && temporary) return "not-met";
  if (enduring && !str(det.sspCitation).trim()) return "not-met";
  if (temporary && !hasOperationalPoa(req.reqId, operationalPoas)) return "not-met";
  return "met";
}

/**
 * @param {object} req
 * @param {object | null | undefined} determination
 * @param {object[] | null | undefined} evidence
 * @param {object[] | null | undefined} operationalPoas
 */
export function rollupRequirement(req, determination, evidence, operationalPoas) {
  const objectives = effectiveObjectives(req, determination, evidence);
  const wouldBeFinding = rollupWouldBeFinding(req, objectives);
  const finding = applyMetGates(req, determination, wouldBeFinding, objectives, evidence, operationalPoas);
  return { reqId: str(req?.reqId), finding, wouldBeFinding, objectives };
}

/** Stored finding after overlays → AO roll-up → evidence gate → temp-deficiency keepers. */
export function storedFinding(req, determination, evidence, operationalPoas) {
  return rollupRequirement(req, determination, evidence, operationalPoas).finding;
}

export function storedFindings(catalog, determinations, evidence, operationalPoas) {
  const dets = determinations && typeof determinations === "object" ? determinations : {};
  const out = {};
  for (const req of asList(catalog)) {
    if (!req || !str(req.reqId)) continue;
    out[req.reqId] = storedFinding(req, dets[req.reqId], evidence, operationalPoas);
  }
  return out;
}
