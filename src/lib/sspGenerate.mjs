/** Living SSP outline from scope + assets/flows + determination stubs. Stale hash is a warning, not NLP. */

import catalogFile from "../data/catalog.json" with { type: "json" };

export const SSP_CORE_KEYS = Object.freeze([
  "purpose",
  "boundary",
  "environment",
  "cui-flows",
  "roles",
  "inheritance-esp",
]);

const CORE_TITLES = {
  purpose: "Purpose",
  boundary: "System boundary",
  environment: "Environment of operation",
  "cui-flows": "CUI flows",
  roles: "Roles and responsibilities",
  "inheritance-esp": "Inheritance / ESP",
};

const SAMPLE = "SAMPLE only. Not CUI. Not a SPRS submission.";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  return value == null ? "" : String(value);
}

function catalogReqs() {
  return asList(catalogFile?.requirements).filter((row) => row && str(row.reqId));
}

/** FNV-1a pair. Stale-stub detector only — not a catalog hash. */
function hashText(text) {
  let h1 = 2166136261;
  let h2 = 2166136261 ^ 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 16777619);
    h2 ^= c + (h1 & 0xffff);
    h2 = Math.imul(h2, 16777619);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

function namesIn(assets, category) {
  return assets
    .filter((row) => str(row?.category) === category)
    .map((row) => str(row?.name).trim() || str(row?.id) || "(unnamed)")
    .join("; ");
}

function listOrNone(text) {
  return str(text).trim() || "(none)";
}

/**
 * Hash of scope + assets + flows only. Determinations feed req:* stubs but
 * do not stale the boundary hash — that would become an NLP-style check.
 */
export function scopeGraphHash(assessment) {
  const scope = assessment?.scope && typeof assessment.scope === "object" ? assessment.scope : {};
  const assets = asList(assessment?.assets).map((row) => ({
    id: str(row?.id),
    name: str(row?.name),
    category: str(row?.category),
    justification: str(row?.justification),
    specializedKind: str(row?.specializedKind),
    notes: str(row?.notes),
  }));
  const flows = asList(assessment?.flows).map((row) => ({
    id: str(row?.id),
    fromAssetId: str(row?.fromAssetId),
    toAssetId: str(row?.toAssetId),
    channel: str(row?.channel),
    inBoundary: row?.inBoundary === true,
    notes: str(row?.notes),
  }));
  return hashText(
    JSON.stringify({
      scope: {
        kind: str(scope.kind),
        narrative: str(scope.narrative),
        isolationSummary: str(scope.isolationSummary),
        cuiCategoriesGeneric: asList(scope.cuiCategoriesGeneric).map(str),
        diagramEvidenceId: scope.diagramEvidenceId == null ? "" : str(scope.diagramEvidenceId),
      },
      assets,
      flows,
    }),
  );
}

function section(key, title, body, generatedFrom) {
  return { id: key, key, title, body, generatedFrom };
}

function purposeBody(assessment) {
  const org = assessment?.organization && typeof assessment.organization === "object" ? assessment.organization : {};
  const scope = assessment?.scope && typeof assessment.scope === "object" ? assessment.scope : {};
  const kind = str(scope.kind) === "enterprise" ? "Enterprise" : "Enclave";
  const name = str(org.name).trim() || "Unnamed organization (fictional)";
  const cage = str(org.cage).trim() || "XXXXX";
  return [
    `${name} CMMC Level 2 (Self) System Security Plan.`,
    `Assessment Scope is ${kind}. Fake CAGE ${cage}. Fictional sample pack.`,
    SAMPLE,
  ].join("\n");
}

function boundaryBody(assessment) {
  const scope = assessment?.scope && typeof assessment.scope === "object" ? assessment.scope : {};
  const assets = asList(assessment?.assets);
  const kind = str(scope.kind) === "enterprise" ? "Enterprise" : "Enclave";
  return [
    `System boundary (${kind}, SAMPLE).`,
    str(scope.narrative).trim() || "(no boundary narrative)",
    `Isolation: ${str(scope.isolationSummary).trim() || "(none)"}`,
    `CUI assets: ${listOrNone(namesIn(assets, "cui"))}`,
    `SPA: ${listOrNone(namesIn(assets, "spa"))}`,
    `Specialized: ${listOrNone(namesIn(assets, "specialized"))}`,
    `CRMA: ${listOrNone(namesIn(assets, "crma"))}`,
    `OOS: ${listOrNone(namesIn(assets, "oos"))}`,
    `Diagram pointer: ${str(scope.diagramEvidenceId).trim() || "(none)"}`,
    SAMPLE,
  ].join("\n");
}

function environmentBody(assessment) {
  const org = assessment?.organization && typeof assessment.organization === "object" ? assessment.organization : {};
  const scope = assessment?.scope && typeof assessment.scope === "object" ? assessment.scope : {};
  const cats = asList(scope.cuiCategoriesGeneric)
    .map(str)
    .map((row) => row.trim())
    .filter(Boolean);
  const count = org.employeeCount == null || org.employeeCount === "" ? "(unset)" : String(org.employeeCount);
  return [
    "Environment of operation (SAMPLE).",
    `Employee count: ${count}.`,
    str(scope.isolationSummary).trim() || "(no isolation summary)",
    `Generic CUI categories: ${cats.length ? cats.join("; ") : "(none)"}`,
    SAMPLE,
  ].join("\n");
}

function cuiFlowsBody(assessment) {
  const assets = asList(assessment?.assets);
  const byId = new Map();
  for (const asset of assets) {
    const id = str(asset?.id);
    if (id) byId.set(id, str(asset?.name).trim() || id);
  }
  const flows = asList(assessment?.flows);
  const lines = flows.map((flow) => {
    const from = byId.get(str(flow?.fromAssetId)) || str(flow?.fromAssetId) || "(from)";
    const to = byId.get(str(flow?.toAssetId)) || str(flow?.toAssetId) || "(to)";
    const channel = str(flow?.channel).trim() || "other";
    const bound = flow?.inBoundary === true ? "in-boundary" : "out-of-boundary";
    const notes = str(flow?.notes).trim();
    return `${from} → ${to} via ${channel} (${bound})${notes ? `. ${notes}` : "."}`;
  });
  return ["CUI flows (SAMPLE).", ...(lines.length ? lines : ["(no CUI flows recorded)"]), SAMPLE].join("\n");
}

function rolesBody(assessment) {
  const org = assessment?.organization && typeof assessment.organization === "object" ? assessment.organization : {};
  const official = org.affirmingOfficial && typeof org.affirmingOfficial === "object" ? org.affirmingOfficial : {};
  const name = str(official.name).trim() || "(unset)";
  const title = str(official.title).trim() || "(no title)";
  return [
    "Roles and responsibilities (SAMPLE).",
    `Affirming official (local prep only, not a PIEE identity): ${name} · ${title}.`,
    "Requirement owners live on the per-requirement stubs.",
    SAMPLE,
  ].join("\n");
}

function inheritanceBody(assessment) {
  const assets = asList(assessment?.assets);
  const evidence = asList(assessment?.evidence);
  const namedEsp = assets.some((row) => /esp|csp|fedramp/i.test(`${str(row?.name)} ${str(row?.notes)} ${str(row?.justification)}`));
  const crm = evidence.some((row) => str(row?.kind) === "esp_crm");
  const line =
    namedEsp || crm
      ? "An ESP/CSP relationship is named in this sample pack. CRM stub only — not a FedRAMP equivalency engine."
      : "N/A: no ESP. This fictional pack does not use a Cloud Service Provider or External Service Provider for CUI. Not a FedRAMP equivalency engine.";
  return ["Inheritance / ESP (SAMPLE).", line, SAMPLE].join("\n");
}

function ssp3124Body(assessment, det) {
  const scope = assessment?.scope && typeof assessment.scope === "object" ? assessment.scope : {};
  const stub = str(det?.implementationStub).trim();
  return [
    "CA.L2-3.12.4 System Security Plan (SAMPLE).",
    "This SSP describes the Assessment Scope, environment of operation, CUI flows, and how 800-171 Rev 2 requirements are implemented (stubs).",
    str(scope.narrative).trim() || "(no boundary narrative)",
    stub || "No implementation stub yet.",
    "Emptying this body marks the assessment incomplete (32 CFR 170.24). Other sections are not a substitute while this section exists.",
    SAMPLE,
  ].join("\n");
}

function reqBody(req, det) {
  const finding = str(det?.finding).trim() || "not-reviewed";
  const stub = str(det?.implementationStub).trim();
  const owner = str(det?.owner).trim();
  const lines = [
    `${str(req.cmmcId)} ${str(req.title)} (SAMPLE stub). Finding: ${finding}.`,
    stub || "No implementation stub yet.",
  ];
  if (owner) lines.push(`Owner: ${owner}.`);
  if (finding === "na") {
    const why = str(det?.naJustification).trim();
    if (why) lines.push(`N/A justification: ${why}.`);
  }
  if (det?.enduringException === true) {
    lines.push(`Enduring exception; SSP citation: ${str(det.sspCitation).trim() || "(missing)"}.`);
  }
  lines.push(SAMPLE);
  return lines.join("\n");
}

function coreBodies(assessment) {
  return {
    purpose: purposeBody(assessment),
    boundary: boundaryBody(assessment),
    environment: environmentBody(assessment),
    "cui-flows": cuiFlowsBody(assessment),
    roles: rolesBody(assessment),
    "inheritance-esp": inheritanceBody(assessment),
  };
}

export function generateSspOutline(assessment) {
  const pack = assessment && typeof assessment === "object" ? assessment : {};
  const hash = scopeGraphHash(pack);
  const bodies = coreBodies(pack);
  const sections = SSP_CORE_KEYS.map((key) => section(key, CORE_TITLES[key], bodies[key], hash));
  const determinations = pack.determinations && typeof pack.determinations === "object" ? pack.determinations : {};
  for (const req of catalogReqs()) {
    const det = determinations[req.reqId];
    const title = `${str(req.cmmcId)} ${str(req.title)}`.trim();
    const body = req.reqId === "3.12.4" ? ssp3124Body(pack, det) : reqBody(req, det);
    sections.push(section(`req:${req.reqId}`, title, body, hash));
  }
  return sections;
}

export function sspSectionStale(sectionRow, hash) {
  if (!sectionRow || typeof sectionRow !== "object") return false;
  return str(sectionRow.generatedFrom) !== str(hash);
}

export function sspWarnings(assessment) {
  const sections = asList(assessment?.ssp);
  const hash = scopeGraphHash(assessment);
  const warnings = [];
  const boundary = sections.find((row) => str(row?.key) === "boundary");
  if (!str(boundary?.body).trim()) {
    warnings.push({
      id: "empty-ssp-boundary",
      severity: "warning",
      title: "Empty boundary body",
      detail: "SSP boundary stub is empty. Graph QC only — not NLP. Not a SPRS score.",
      href: "/ssp",
    });
  }
  // Boundary only: editing that stub (stamping generatedFrom) dismisses without wiping req:*.
  if (boundary && sspSectionStale(boundary, hash)) {
    warnings.push({
      id: "ssp-stale",
      severity: "warning",
      title: "SSP stub is stale",
      detail: "SSP boundary stub is stale; regenerate or edit.",
      href: "/ssp",
    });
  }
  return warnings;
}
