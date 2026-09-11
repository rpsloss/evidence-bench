import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import catalogFile from "../src/data/catalog.json" with { type: "json" };
import catalogMeta from "../src/data/catalog.meta.json" with { type: "json" };
import { normalizeEngagement } from "../src/lib/engagement.mjs";
import { gatedPrepMarkedAt, normalizeFamilyReviews } from "../src/lib/familyReview.mjs";
import { poamGuard } from "../src/lib/poamGuard.mjs";
import { effectiveObjectives, storedFinding, guardNaWrite, filter171AAoIds } from "../src/lib/rollup.mjs";
import { derivePartialState } from "../src/lib/score.mjs";

const ASSET_CATEGORIES = new Set(["cui", "spa", "crma", "specialized", "oos"]);
const FLOW_CHANNELS = new Set(["email", "file", "cad", "removable-media", "saas", "other"]);
const CUI_NAME_RE = /cui|fouo|itar/i;
const CATALOG_BY_ID = new Map((catalogFile.requirements || []).map((row) => [row.reqId, row]));

const catalogPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/data/catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")).requirements;

function str(value) {
  return value == null ? "" : String(value);
}

function catalogReq(reqId) {
  const id = str(reqId);
  return catalog.find((row) => row && str(row.reqId) === id) || null;
}

function poamFinding(assessment, req) {
  if (!req) return "not-reviewed";
  const reqId = str(req.reqId);
  const det = assessment?.determinations?.[reqId];
  return storedFinding(req, det, assessment?.evidence, assessment?.operationalPoas);
}

function poamPartialState(assessment, req) {
  if (!req?.partialCredit) return undefined;
  const det = assessment?.determinations?.[str(req.reqId)];
  return derivePartialState(req, effectiveObjectives(req, det), det?.fipsOverlay);
}

function guardOnePoam(assessment, item, existingPoams) {
  const reqId = str(item?.reqId);
  const req = catalogReq(reqId);
  return poamGuard({
    req,
    finding: poamFinding(assessment, req),
    existingPoams,
    item,
    partialState: poamPartialState(assessment, req),
  });
}

/** Same guard POST /api/poam and PUT /api/assessment use. Insert 400 only met/duplicate. */
export function guardAssessmentPoams(assessment) {
  const guarded = [];
  for (const item of Array.isArray(assessment?.poams) ? assessment.poams : []) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const result = guardOnePoam(assessment, item, guarded);
    if (!result.ok) return { ok: false, reject: result.reject };
    guarded.push(result.item);
  }
  return { ok: true, poams: guarded };
}

/**
 * Insert one register row. 400 only requirement-is-met / duplicate-req (and empty reqId).
 * 5-point / banned / FIPS-none still 200 with conditionalLegal false.
 */
export function insertPoamItem(assessment, draft) {
  const item = draft && typeof draft === "object" && !Array.isArray(draft) ? { ...draft } : {};
  const reqId = str(item.reqId).trim();
  if (!reqId) return { ok: false, status: 400, error: "invalid-reqId" };
  item.reqId = reqId;
  if (!str(item.id).trim()) item.id = `poam-${reqId}`;
  const current = {
    ...assessment,
    poams: Array.isArray(assessment?.poams) ? assessment.poams : [],
    determinations:
      assessment?.determinations && typeof assessment.determinations === "object" && !Array.isArray(assessment.determinations)
        ? assessment.determinations
        : {},
    evidence: Array.isArray(assessment?.evidence) ? assessment.evidence : [],
    operationalPoas: Array.isArray(assessment?.operationalPoas) ? assessment.operationalPoas : [],
  };
  const result = guardOnePoam(current, item, current.poams);
  if (!result.ok) return { ok: false, status: 400, error: result.reject };
  return {
    ok: true,
    status: 200,
    item: result.item,
    citation: result.citation,
    assessment: { ...current, poams: [...current.poams, result.item] },
  };
}

export function hasStoredName(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasStoredName);
  if (Object.prototype.hasOwnProperty.call(value, "storedName")) return true;
  return Object.values(value).some(hasStoredName);
}

function basenameOf(value) {
  const s = String(value || "").trim();
  const parts = s.split(/[/\\]/);
  return parts[parts.length - 1] || s;
}

function looksLikeFilename(value) {
  const s = String(value || "");
  const base = basenameOf(s);
  return /[/\\]/.test(s) || /\.[a-z0-9]{2,8}$/i.test(base);
}

export function cuiFilenameWarnings(node, acc = []) {
  if (!node || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const item of node) cuiFilenameWarnings(item, acc);
    return acc;
  }
  for (const [key, value] of Object.entries(node)) {
    if (
      (key === "uri" || key === "notes") &&
      typeof value === "string" &&
      looksLikeFilename(value) &&
      CUI_NAME_RE.test(basenameOf(value))
    ) {
      acc.push({ field: key, message: "CUI-like filename; unclass pointers only" });
    }
    if (value && typeof value === "object") cuiFilenameWarnings(value, acc);
  }
  return acc;
}

function fail(status, error, extra = {}) {
  return { ok: false, status, error, ...extra };
}

function rejectNaAttempts(determinations) {
  if (!determinations || typeof determinations !== "object" || Array.isArray(determinations)) return null;
  for (const [reqId, det] of Object.entries(determinations)) {
    if (!det || typeof det !== "object" || Array.isArray(det)) continue;
    const req = CATALOG_BY_ID.get(det.reqId) || CATALOG_BY_ID.get(reqId);
    if (!req) continue;
    const result = guardNaWrite(req, det);
    if (!result.ok) {
      const errorClass = result.reject === "na-not-allowed" ? "NaNotAllowed" : "NaJustificationRequired";
      return fail(400, result.reject, { errorClass, reqId: req.reqId });
    }
  }
  return null;
}

export function validateAssessment(body) {
  const raw = body?.assessment;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return fail(400, "Expected { assessment }", { errorClass: "InvalidAssessmentShape" });
  }
  if (hasStoredName(raw)) {
    return fail(400, "storedName-not-allowed", { errorClass: "StoredNameRejected" });
  }
  const org = raw.organization;
  if (!org || typeof org !== "object" || Array.isArray(org)) {
    return fail(400, "invalid-organization", { errorClass: "InvalidOrganization" });
  }
  if (typeof org.name !== "string" || !org.name.trim()) {
    return fail(400, "invalid-organization", { errorClass: "InvalidOrganization" });
  }
  if (typeof org.cage !== "string") {
    return fail(400, "invalid-organization", { errorClass: "InvalidOrganization" });
  }
  const scope = raw.scope;
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    return fail(400, "invalid-scope", { errorClass: "InvalidScope" });
  }
  if (scope.kind !== "enterprise" && scope.kind !== "enclave") {
    return fail(400, "invalid-scope-kind", { errorClass: "InvalidScopeKind" });
  }
  if (!Array.isArray(raw.assets)) {
    return fail(400, "invalid-assets", { errorClass: "InvalidAssets" });
  }
  for (const asset of raw.assets) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      return fail(400, "invalid-assets", { errorClass: "InvalidAssets" });
    }
    if (typeof asset.id !== "string" || !asset.id.trim()) {
      return fail(400, "invalid-assets", { errorClass: "InvalidAssets" });
    }
    if (!ASSET_CATEGORIES.has(asset.category)) {
      return fail(400, "invalid-assets", { errorClass: "InvalidAssets" });
    }
  }
  if (!Array.isArray(raw.flows)) {
    return fail(400, "invalid-flows", { errorClass: "InvalidFlows" });
  }
  for (const flow of raw.flows) {
    if (!flow || typeof flow !== "object" || Array.isArray(flow)) {
      return fail(400, "invalid-flows", { errorClass: "InvalidFlows" });
    }
    if (typeof flow.id !== "string" || !flow.id.trim()) {
      return fail(400, "invalid-flows", { errorClass: "InvalidFlows" });
    }
    if (typeof flow.inBoundary !== "boolean") {
      return fail(400, "invalid-flows", { errorClass: "InvalidFlows" });
    }
    if (flow.channel != null && !FLOW_CHANNELS.has(flow.channel)) {
      return fail(400, "invalid-flows", { errorClass: "InvalidFlows" });
    }
  }

  const catalogReqs = catalogFile.requirements || [];
  const evidence = (Array.isArray(raw.evidence) ? raw.evidence : []).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return { ...item, aoIds: filter171AAoIds(item.aoIds, catalogReqs) };
  });
  const determinations =
    raw.determinations && typeof raw.determinations === "object" && !Array.isArray(raw.determinations)
      ? raw.determinations
      : {};
  const naReject = rejectNaAttempts(determinations);
  if (naReject) return naReject;

  const warnings = cuiFilenameWarnings({
    assets: raw.assets,
    flows: raw.flows,
    evidence,
    organization: raw.organization,
    scope: raw.scope,
  });

  const catalogHash =
    typeof raw.catalogHash === "string" && raw.catalogHash.trim()
      ? raw.catalogHash
      : catalogMeta.catalogSha256;

  const assessment = {
    id: typeof raw.id === "string" ? raw.id : "assessment",
    standard: "NIST-SP-800-171-R2",
    catalogHash,
    organization: { ...org, fictional: true },
    engagement: normalizeEngagement(raw.engagement),
    scope,
    assets: raw.assets,
    flows: raw.flows,
    evidence,
    determinations,
    poams: Array.isArray(raw.poams) ? raw.poams : [],
    operationalPoas: Array.isArray(raw.operationalPoas) ? raw.operationalPoas : [],
    ssp: Array.isArray(raw.ssp) ? raw.ssp : [],
    familyReviews: normalizeFamilyReviews(raw.familyReviews),
    prepMarkedAt: gatedPrepMarkedAt(raw.familyReviews, raw.prepMarkedAt),
    schemaVersion: 1,
  };

  const guarded = guardAssessmentPoams(assessment);
  if (!guarded.ok) {
    return fail(400, guarded.reject, { errorClass: "PoamRejected" });
  }
  assessment.poams = guarded.poams;

  return { ok: true, assessment, warnings };
}
