const ASSET_CATEGORIES = new Set(["cui", "spa", "crma", "specialized", "oos"]);
const FLOW_CHANNELS = new Set(["email", "file", "cad", "removable-media", "saas", "other"]);
const CUI_NAME_RE = /cui|fouo|itar/i;

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

  const evidence = Array.isArray(raw.evidence) ? raw.evidence : [];
  const warnings = cuiFilenameWarnings({
    assets: raw.assets,
    flows: raw.flows,
    evidence,
    organization: raw.organization,
    scope: raw.scope,
  });

  const assessment = {
    id: typeof raw.id === "string" ? raw.id : "assessment",
    standard: "NIST-SP-800-171-R2",
    catalogHash: typeof raw.catalogHash === "string" ? raw.catalogHash : "",
    organization: { ...org, fictional: true },
    scope,
    assets: raw.assets,
    flows: raw.flows,
    evidence,
    determinations:
      raw.determinations && typeof raw.determinations === "object" && !Array.isArray(raw.determinations)
        ? raw.determinations
        : {},
    poams: Array.isArray(raw.poams) ? raw.poams : [],
    operationalPoas: Array.isArray(raw.operationalPoas) ? raw.operationalPoas : [],
    ssp: Array.isArray(raw.ssp) ? raw.ssp : [],
    familyReviews: Array.isArray(raw.familyReviews) ? raw.familyReviews : [],
    prepMarkedAt: raw.prepMarkedAt ?? null,
    schemaVersion: 1,
  };

  return { ok: true, assessment, warnings };
}
