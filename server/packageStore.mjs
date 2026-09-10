import fs from "node:fs";
import { writeAudit } from "./audit.mjs";
import {
  atomicWriteBuffer,
  decryptBuffer,
  encryptBuffer,
  encryptToFile,
  isEncryptedBuffer,
  loadKey,
  loadOrCreateKey,
  resolveAuditPath,
  resolveKeyPath,
} from "./atRest.mjs";

export { isEncryptedBuffer };

export function errorClass(err) {
  if (!err) return "UnknownError";
  if (typeof err === "string") return "Error";
  return err.name || err.constructor?.name || "Error";
}

export function storePaths(targetPath) {
  return {
    keyPath: resolveKeyPath(targetPath),
    auditPath: resolveAuditPath(targetPath),
  };
}

export function parsePackageJson(raw) {
  if (typeof raw !== "string") {
    return { ok: false, errorClass: "TypeError", package: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, errorClass: errorClass(err), package: null };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errorClass: "InvalidPackageShape", package: null };
  }
  return { ok: true, errorClass: null, package: parsed };
}

function auditEnabled(options) {
  return options?.audit !== false;
}

function audit(options, targetPath, rec) {
  if (!auditEnabled(options)) return;
  const auditPath = options?.auditPath || resolveAuditPath(targetPath);
  writeAudit(auditPath, rec);
}

function looksLikeJson(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return false;
  const trimmed = buf.toString("utf8").trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function unlinkPlaintextSibling(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const buf = fs.readFileSync(filePath);
    if (isEncryptedBuffer(buf)) return;
    if (looksLikeJson(buf)) fs.unlinkSync(filePath);
  } catch {
    // best-effort: never wipe the canonical file on backup cleanup failure
  }
}

function backupPreviousGood(packagePath) {
  if (!fs.existsSync(packagePath)) return;
  const current = fs.readFileSync(packagePath);
  if (!isEncryptedBuffer(current)) return;
  atomicWriteBuffer(`${packagePath}.bak`, current);
}

function keyForSave(packagePath, options = {}) {
  const keyPath = options.keyPath || resolveKeyPath(packagePath);
  if (options.createKeyIfMissing) return loadOrCreateKey(keyPath);
  if (fs.existsSync(packagePath)) {
    const raw = fs.readFileSync(packagePath);
    if (isEncryptedBuffer(raw)) return loadKey(keyPath);
  }
  return loadOrCreateKey(keyPath);
}

export function loadPackage(packagePath, options = {}) {
  try {
    if (!fs.existsSync(packagePath)) {
      audit(options, packagePath, { action: "get", outcome: "miss", bytesIn: 0, bytesOut: 0 });
      return { ok: true, missing: true, package: null, errorClass: null, bytes: 0, encrypted: false };
    }
    const raw = fs.readFileSync(packagePath);
    const bytes = raw.length;

    if (isEncryptedBuffer(raw)) {
      let key;
      try {
        key = loadKey(options.keyPath || resolveKeyPath(packagePath));
      } catch (err) {
        audit(options, packagePath, { action: "decrypt-fail", outcome: "fail", bytesIn: bytes, bytesOut: 0 });
        return { ok: false, missing: false, package: null, errorClass: errorClass(err), bytes, encrypted: true };
      }
      let plain;
      try {
        plain = decryptBuffer(raw, key);
      } catch (err) {
        audit(options, packagePath, { action: "decrypt-fail", outcome: "fail", bytesIn: bytes, bytesOut: 0 });
        return { ok: false, missing: false, package: null, errorClass: errorClass(err), bytes, encrypted: true };
      }
      const parsed = parsePackageJson(plain.toString("utf8"));
      if (!parsed.ok) {
        audit(options, packagePath, { action: "get", outcome: "fail", bytesIn: bytes, bytesOut: 0 });
        return { ok: false, missing: false, package: null, errorClass: parsed.errorClass, bytes, encrypted: true };
      }
      audit(options, packagePath, { action: "get", outcome: "ok", bytesIn: bytes, bytesOut: plain.length });
      return { ok: true, missing: false, package: parsed.package, errorClass: null, bytes, encrypted: true };
    }

    const parsed = parsePackageJson(raw.toString("utf8"));
    if (!parsed.ok) {
      audit(options, packagePath, { action: "get", outcome: "fail", bytesIn: bytes, bytesOut: 0 });
      return { ok: false, missing: false, package: null, errorClass: parsed.errorClass, bytes, encrypted: false };
    }
    audit(options, packagePath, { action: "get", outcome: "ok", bytesIn: bytes, bytesOut: bytes });
    return { ok: true, missing: false, package: parsed.package, errorClass: null, bytes, encrypted: false };
  } catch (err) {
    audit(options, packagePath, { action: "get", outcome: "fail", bytesIn: 0, bytesOut: 0 });
    return { ok: false, missing: false, package: null, errorClass: errorClass(err), bytes: 0, encrypted: false };
  }
}

/**
 * Atomic save: serialize + validate, AES-256-GCM, snapshot current ciphertext
 * to `.bak`, write temp in the same directory, fsync, rename.
 *
 * Existing encrypted files require the current key (no mint-over-ciphertext)
 * unless options.createKeyIfMissing is set (explicit seed/reload).
 * options.crashAfterTempWrite is test-only: leave the temp file and skip rename.
 * options.audit === false skips the access audit line.
 */
export function savePackage(packagePath, pkg, options = {}) {
  if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) {
    const err = new Error("InvalidPackageShape");
    err.name = "InvalidPackageShape";
    throw err;
  }

  const json = JSON.stringify(pkg, null, 2);
  const check = parsePackageJson(json);
  if (!check.ok) {
    const err = new Error("SerializeFailed");
    err.name = "SerializeFailed";
    throw err;
  }

  const plain = Buffer.from(json, "utf8");
  const key = keyForSave(packagePath, options);
  const payload = encryptBuffer(plain, key);

  backupPreviousGood(packagePath);

  try {
    atomicWriteBuffer(packagePath, payload, { crashAfterTempWrite: options.crashAfterTempWrite });
  } catch (err) {
    if (errorClass(err) !== "SimulatedCrash") {
      audit(options, packagePath, { action: "put", outcome: "fail", bytesIn: plain.length, bytesOut: 0 });
    }
    throw err;
  }

  unlinkPlaintextSibling(`${packagePath}.bak`);
  unlinkPlaintextSibling(`${packagePath}.plain`);

  audit(options, packagePath, { action: "put", outcome: "ok", bytesIn: plain.length, bytesOut: payload.length });
  return { ok: true, bytes: payload.length };
}

export function saveEncryptedBytes(destPath, plainBuf, options = {}) {
  const result = encryptToFile(destPath, Buffer.isBuffer(plainBuf) ? plainBuf : Buffer.from(plainBuf), options);
  return { ok: true, bytes: result.diskBytes ?? result.bytes ?? 0 };
}

export function loadPossiblyEncryptedBytes(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { ok: true, missing: true, buffer: null, errorClass: null, bytes: 0, encrypted: false };
  }
  const raw = fs.readFileSync(filePath);
  if (!isEncryptedBuffer(raw)) {
    return { ok: true, missing: false, buffer: raw, errorClass: null, bytes: raw.length, encrypted: false };
  }
  try {
    const key = loadKey(options.keyPath || resolveKeyPath(filePath));
    const plain = decryptBuffer(raw, key);
    return { ok: true, missing: false, buffer: plain, errorClass: null, bytes: raw.length, encrypted: true };
  } catch (err) {
    return { ok: false, missing: false, buffer: null, errorClass: errorClass(err), bytes: raw.length, encrypted: true };
  }
}
