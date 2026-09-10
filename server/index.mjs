import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendAudit } from "./auditLog.mjs";
import { errorClass, loadPackage, savePackage, storePaths } from "./packageStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const assessmentPath = path.join(dataDir, "assessment.json.enc");
const { auditPath } = storePaths(assessmentPath);

fs.mkdirSync(dataDir, { recursive: true });

const LISTEN_HOST = "127.0.0.1";
const LOCAL_VITE_ORIGIN = "http://127.0.0.1:5173";
const CLIENT_AUDIT_ACTIONS = new Set(["export", "reload-sample"]);
const ASSET_CATEGORIES = new Set(["cui", "spa", "crma", "specialized", "oos"]);
const FLOW_CHANNELS = new Set(["email", "file", "cad", "removable-media", "saas", "other"]);
const CUI_NAME_RE = /cui|fouo|itar/i;

const app = express();
app.use(cors({ origin: LOCAL_VITE_ORIGIN }));
app.use(express.json({ limit: "2mb" }));

function logEvent(event, fields = {}) {
  const allowed = new Set(["status", "errorClass", "bytes", "port", "warningCount"]);
  const parts = [];
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.has(key)) continue;
    if (typeof value === "number" || typeof value === "boolean") parts.push(`${key}=${value}`);
    else if (typeof value === "string" && /^[A-Za-z0-9._-]+$/.test(value) && value.length <= 64) {
      parts.push(`${key}=${value}`);
    }
  }
  console.log(`[eb] ${event}${parts.length ? ` ${parts.join(" ")}` : ""}`);
}

function harborPrecisionAssessment() {
  return {
    id: "asmt-harbor-precision-l2-self",
    standard: "NIST-SP-800-171-R2",
    catalogHash: "",
    organization: {
      id: "org-harbor-precision",
      name: "Harbor Precision (fictional)",
      fictional: true,
      cage: "XXXXX",
      employeeCount: 18,
      affirmingOfficial: {
        name: "Jordan Hale (fictional)",
        title: "Owner / Affirming Official (sample)",
        email: "jordan.hale@harbor-precision.example",
      },
    },
    scope: {
      kind: "enclave",
      narrative:
        "Fictional Harbor Precision CUI enclave covers CAD authoring and a dedicated mailbox. The shop-floor CNC mill is a Specialized Asset and is not on a CUI flow.",
      isolationSummary:
        "The mill sits on a shop-floor VLAN with no route to the CUI enclave. Visitor Wi-Fi is an isolated out-of-scope segment.",
      cuiCategoriesGeneric: ["engineering drawings (generic)", "specifications (generic)"],
      diagramEvidenceId: null,
    },
    assets: [
      {
        id: "cad-ws",
        name: "CAD workstation (fictional)",
        category: "cui",
        justification: "",
        notes: "Unclassified pointer only. Authoring station inside the enclave.",
      },
      {
        id: "mailbox",
        name: "Enclave mailbox (fictional)",
        category: "cui",
        justification: "",
        notes: "Dedicated mailbox for CUI-marked mail. Not a personal inbox.",
      },
      {
        id: "idp",
        name: "Enclave IdP (fictional)",
        category: "spa",
        justification: "",
        notes: "Identity provider protecting the enclave.",
      },
      {
        id: "firewall",
        name: "Enclave firewall (fictional)",
        category: "spa",
        justification: "",
        notes: "Perimeter for the CUI enclave.",
      },
      {
        id: "cnc-mill",
        name: "CNC mill (fictional Haas-class)",
        category: "specialized",
        specializedKind: "ot",
        justification:
          "OT CNC that can display a drawing but cannot run IT MFA; isolated from the CUI enclave; managed as a Specialized Asset (32 CFR 170.19).",
        notes: "Not an endpoint of any CUI flow.",
      },
      {
        id: "office-pcs",
        name: "Office PCs (accounting / HR)",
        category: "crma",
        justification:
          "Policy forbids CUI on these workstations. They are not physically or logically isolated from the enclave LAN, so they are CRMA rather than out of scope.",
        notes: "Contractor Risk Managed Assets.",
      },
      {
        id: "visitor-wifi",
        name: "Visitor Wi-Fi AP (fictional)",
        category: "oos",
        justification:
          "Logically isolated guest VLAN with no route to the CUI enclave; does not process, store, or transmit CUI.",
        notes: "Out of scope; isolation evidence lives with the OSA.",
      },
    ],
    flows: [
      {
        id: "flow-cad-mail",
        fromAssetId: "cad-ws",
        toAssetId: "mailbox",
        channel: "email",
        inBoundary: true,
        notes: "CAD operator sends drawings to the enclave mailbox.",
      },
      {
        id: "flow-mail-cad",
        fromAssetId: "mailbox",
        toAssetId: "cad-ws",
        channel: "email",
        inBoundary: true,
        notes: "Inbound CUI-marked mail to the CAD workstation.",
      },
    ],
    determinations: {},
    evidence: [],
    poams: [],
    operationalPoas: [],
    ssp: [],
    familyReviews: [],
    prepMarkedAt: null,
    schemaVersion: 1,
  };
}

function hasStoredName(value) {
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

function cuiFilenameWarnings(node, acc = []) {
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

function validateAssessment(body) {
  const raw = body?.assessment;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return fail(400, "Expected { assessment }", { errorClass: "InvalidAssessmentShape" });
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
  if (hasStoredName(evidence)) {
    return fail(400, "storedName-not-allowed", { errorClass: "StoredNameRejected" });
  }

  const warnings = cuiFilenameWarnings({
    assets: raw.assets,
    flows: raw.flows,
    evidence,
    organization: raw.organization,
    scope: raw.scope,
  });

  const assessment = {
    ...raw,
    standard: "NIST-SP-800-171-R2",
    catalogHash: typeof raw.catalogHash === "string" ? raw.catalogHash : "",
    organization: { ...org, fictional: true },
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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    systemOfRecord: "SPRS (human entry)",
    cmmc: "L2-Self-prep",
    framework: "NIST SP 800-171 R2",
  });
});

app.get("/api/assessment", (_req, res) => {
  const result = loadPackage(assessmentPath);
  if (!result.ok) {
    logEvent("assessment.load.fail", { status: 500, errorClass: result.errorClass });
    res.status(500).json({ error: "assessment-unreadable", errorClass: result.errorClass });
    return;
  }
  if (result.missing) {
    logEvent("assessment.load.miss", { status: 200 });
    res.json({ assessment: null });
    return;
  }
  logEvent("assessment.load.ok", { status: 200 });
  res.json({ assessment: result.package });
});

app.put("/api/assessment", (req, res) => {
  const checked = validateAssessment(req.body);
  if (!checked.ok) {
    logEvent("assessment.save.fail", { status: checked.status, errorClass: checked.errorClass });
    res.status(checked.status).json({ error: checked.error, errorClass: checked.errorClass });
    return;
  }
  try {
    const saved = savePackage(assessmentPath, checked.assessment);
    logEvent("assessment.save.ok", { status: 200, bytes: saved.bytes, warningCount: checked.warnings.length });
    res.json({ ok: true, savedAt: new Date().toISOString(), warnings: checked.warnings });
  } catch (err) {
    logEvent("assessment.save.fail", { status: 500, errorClass: errorClass(err) });
    res.status(500).json({ error: "assessment-save-failed", errorClass: errorClass(err) });
  }
});

app.post("/api/seed", (_req, res) => {
  const assessment = harborPrecisionAssessment();
  try {
    const saved = savePackage(assessmentPath, assessment);
    appendAudit(auditPath, { action: "reload-sample", outcome: "ok", bytesIn: 0, bytesOut: saved.bytes });
    logEvent("assessment.seed.ok", { status: 200, bytes: saved.bytes });
    res.json({ assessment });
  } catch (err) {
    logEvent("assessment.seed.fail", { status: 500, errorClass: errorClass(err) });
    res.status(500).json({ error: "seed-failed", errorClass: errorClass(err) });
  }
});

app.post("/api/access-audit", (req, res) => {
  const action = req.body?.action;
  if (!CLIENT_AUDIT_ACTIONS.has(action)) {
    res.status(400).json({ error: "invalid-action" });
    return;
  }
  const outcome = req.body?.outcome === "fail" || req.body?.outcome === "miss" ? req.body.outcome : "ok";
  const bytesIn = req.body?.bytesIn;
  const bytesOut = req.body?.bytesOut ?? req.body?.bytes;
  appendAudit(auditPath, { action, outcome, bytesIn, bytesOut });
  res.json({ ok: true });
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(root, "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  const parseFail = err?.type === "entity.parse.failed" || err instanceof SyntaxError;
  const status = parseFail ? 400 : 500;
  const cls = parseFail ? "SyntaxError" : errorClass(err);
  logEvent("request.fail", { status, errorClass: cls });
  res.status(status).json({
    error: parseFail ? "invalid-json" : "internal",
    errorClass: cls,
  });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, LISTEN_HOST, () => {
  logEvent("api.listen", { port });
  console.log("SPRS remains the system of record via human entry. Not a SPRS submission.");
});
