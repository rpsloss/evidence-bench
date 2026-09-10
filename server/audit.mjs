import fs from "node:fs";
import path from "node:path";

const ACTIONS = new Set(["get", "put", "export", "reload-sample", "decrypt", "decrypt-fail"]);
const OUTCOMES = new Set(["ok", "fail", "miss"]);

function nonNegInt(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/** Append one access audit line. Never writes CUI, PII, filenames, contents, or key material. */
export function writeAudit(auditPath, rec = {}) {
  if (!auditPath || typeof auditPath !== "string") return { ok: false };
  const action = typeof rec.action === "string" && ACTIONS.has(rec.action) ? rec.action : null;
  const outcome = typeof rec.outcome === "string" && OUTCOMES.has(rec.outcome) ? rec.outcome : null;
  if (!action || !outcome) return { ok: false };
  const row = {
    timestamp: new Date().toISOString(),
    action,
    outcome,
    bytesIn: nonNegInt(rec.bytesIn ?? rec.bytes),
    bytesOut: nonNegInt(rec.bytesOut ?? rec.bytes ?? 0),
  };
  try {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.appendFileSync(auditPath, `${JSON.stringify(row)}\n`, { encoding: "utf8", mode: 0o600 });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export const appendAudit = writeAudit;

export function readAuditLines(auditPath) {
  if (!auditPath || !fs.existsSync(auditPath)) return [];
  return fs
    .readFileSync(auditPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
