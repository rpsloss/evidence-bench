import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendAudit } from "./auditLog.mjs";
import { insertPoamItem, validateAssessment } from "./assessment.mjs";
import { errorClass, loadPackage, savePackage, storePaths } from "./packageStore.mjs";
import { buildHarborPrecision } from "../src/data/harbor-precision.mjs";
import catalogFile from "../src/data/catalog.json" with { type: "json" };
import catalogMeta from "../src/data/catalog.meta.json" with { type: "json" };
import { CatalogHashMismatch, scoreFromAssessment } from "../src/lib/score.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const defaultAssessmentPath = path.join(dataDir, "assessment.json.enc");

const LISTEN_HOST = "127.0.0.1";
const LOCAL_VITE_ORIGIN = "http://127.0.0.1:5173";
const CLIENT_AUDIT_ACTIONS = new Set(["export", "reload-sample"]);

function scoreEnvelope(assessment) {
  try {
    return scoreFromAssessment(assessment, catalogFile.requirements, catalogMeta.catalogSha256);
  } catch (err) {
    if (err instanceof CatalogHashMismatch || err?.code === "catalog-hash-mismatch") return null;
    throw err;
  }
}

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

export function createApp(options = {}) {
  const assessmentPath = options.assessmentPath || defaultAssessmentPath;
  const { auditPath } = storePaths(assessmentPath);

  const app = express();
  app.use(cors({ origin: LOCAL_VITE_ORIGIN }));
  app.use(express.json({ limit: "2mb" }));

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
      res.json({ assessment: null, score: null });
      return;
    }
    logEvent("assessment.load.ok", { status: 200 });
    res.json({ assessment: result.package, score: scoreEnvelope(result.package) });
  });

  app.put("/api/assessment", (req, res) => {
    const checked = validateAssessment(req.body);
    if (!checked.ok) {
      if (checked.errorClass === "PoamRejected") {
        logEvent("poam.rejected", { status: 400, errorClass: checked.error });
      } else {
        logEvent("assessment.save.fail", { status: checked.status, errorClass: checked.errorClass });
      }
      const body = { error: checked.error, errorClass: checked.errorClass };
      if (typeof checked.reqId === "string" && checked.reqId) body.reqId = checked.reqId;
      res.status(checked.status).json(body);
      return;
    }
    try {
      const saved = savePackage(assessmentPath, checked.assessment);
      logEvent("assessment.save.ok", { status: 200, bytes: saved.bytes, warningCount: checked.warnings.length });
      res.json({
        ok: true,
        savedAt: new Date().toISOString(),
        warnings: checked.warnings,
        poams: checked.assessment.poams,
      });
    } catch (err) {
      logEvent("assessment.save.fail", { status: 500, errorClass: errorClass(err) });
      res.status(500).json({ error: "assessment-save-failed", errorClass: errorClass(err) });
    }
  });

  app.post("/api/poam", (req, res) => {
    const loaded = loadPackage(assessmentPath);
    if (!loaded.ok) {
      logEvent("assessment.load.fail", { status: 500, errorClass: loaded.errorClass });
      res.status(500).json({ error: "assessment-unreadable", errorClass: loaded.errorClass });
      return;
    }
    if (loaded.missing || !loaded.package) {
      res.status(400).json({ error: "assessment-missing" });
      return;
    }
    const draft = req.body?.item && typeof req.body.item === "object" ? req.body.item : req.body;
    const inserted = insertPoamItem(loaded.package, draft);
    if (!inserted.ok) {
      logEvent("poam.rejected", { status: 400, errorClass: inserted.error });
      res.status(400).json({ error: inserted.error, errorClass: "PoamRejected" });
      return;
    }
    try {
      const saved = savePackage(assessmentPath, inserted.assessment);
      logEvent("assessment.save.ok", { status: 200, bytes: saved.bytes, warningCount: 0 });
      const body = {
        ok: true,
        item: inserted.item,
        conditionalLegal: inserted.item.conditionalLegal,
        illegalCode: inserted.item.illegalCode,
      };
      if (inserted.citation) body.citation = inserted.citation;
      res.status(200).json(body);
    } catch (err) {
      logEvent("assessment.save.fail", { status: 500, errorClass: errorClass(err) });
      res.status(500).json({ error: "assessment-save-failed", errorClass: errorClass(err) });
    }
  });

  app.post("/api/seed", (_req, res) => {
    const assessment = buildHarborPrecision();
    try {
      const saved = savePackage(assessmentPath, assessment, { createKeyIfMissing: true });
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

  return app;
}

export function startServer(options = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const app = createApp(options);
  const port = Number(options.port || process.env.PORT || 8787);
  return app.listen(port, LISTEN_HOST, () => {
    logEvent("api.listen", { port });
    console.log("SPRS remains the system of record via human entry. Not a SPRS submission.");
  });
}

const thisFile = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked && path.resolve(thisFile) === invoked) {
  startServer();
}
