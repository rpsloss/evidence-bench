/** AES-256-GCM at rest. Never log plaintext, keys, or CUI. */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const ENC_MAGIC = Buffer.from("EBENC01\n");
export const IV_LEN = 12;
export const TAG_LEN = 16;
export const KEY_LEN = 32;
export const KEY_FILENAME = ".package-key";
export const AUDIT_FILENAME = "audit.log";

export function resolveDataDir(targetPath) {
  const dir = path.dirname(targetPath);
  const base = path.basename(dir);
  if (base === "evidence" || base === "artifacts") return path.dirname(dir);
  return dir;
}

export function resolveKeyPath(targetPath) {
  return path.join(resolveDataDir(targetPath), KEY_FILENAME);
}

export function resolveAuditPath(targetPath) {
  return path.join(resolveDataDir(targetPath), AUDIT_FILENAME);
}

export function isEncryptedBuffer(buf) {
  return Buffer.isBuffer(buf) && buf.length >= ENC_MAGIC.length && buf.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC);
}

function fsyncDir(dirPath) {
  try {
    const fd = fs.openSync(dirPath, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Directory fsync is best-effort on some platforms.
  }
}

export function atomicWriteBuffer(destPath, buffer, options = {}) {
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  const mode = options.mode ?? 0o600;
  const tmpPath = path.join(
    dir,
    `${path.basename(destPath)}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`,
  );
  const fd = fs.openSync(tmpPath, "w", mode);
  try {
    fs.writeFileSync(fd, buffer);
    fs.fsyncSync(fd);
  } catch (err) {
    try {
      fs.closeSync(fd);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    throw err;
  }
  fs.closeSync(fd);
  if (options.crashAfterTempWrite) {
    const err = new Error("simulated-crash");
    err.name = "SimulatedCrash";
    throw err;
  }
  fs.renameSync(tmpPath, destPath);
  try {
    fs.chmodSync(destPath, mode);
  } catch {
    // chmod best-effort
  }
  fsyncDir(dir);
  return { ok: true, bytes: buffer.length };
}

export function loadKey(keyPath) {
  if (!fs.existsSync(keyPath)) {
    const err = new Error("KeyMissing");
    err.name = "KeyMissing";
    throw err;
  }
  const key = fs.readFileSync(keyPath);
  if (!Buffer.isBuffer(key) || key.length !== KEY_LEN) {
    const err = new Error("KeyInvalid");
    err.name = "KeyInvalid";
    throw err;
  }
  return key;
}

export function loadOrCreateKey(keyPath) {
  if (fs.existsSync(keyPath)) return loadKey(keyPath);
  const key = crypto.randomBytes(KEY_LEN);
  atomicWriteBuffer(keyPath, key, { mode: 0o600 });
  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {
    // chmod best-effort
  }
  return key;
}

export function encryptBuffer(plaintext, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ENC_MAGIC, iv, tag, ciphertext]);
}

export function decryptBuffer(blob, key) {
  if (!isEncryptedBuffer(blob)) {
    const err = new Error("NotEncrypted");
    err.name = "NotEncrypted";
    throw err;
  }
  const min = ENC_MAGIC.length + IV_LEN + TAG_LEN;
  if (blob.length < min) {
    const err = new Error("DecryptionError");
    err.name = "DecryptionError";
    throw err;
  }
  const iv = blob.subarray(ENC_MAGIC.length, ENC_MAGIC.length + IV_LEN);
  const tag = blob.subarray(ENC_MAGIC.length + IV_LEN, min);
  const ciphertext = blob.subarray(min);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    const err = new Error("DecryptionError");
    err.name = "DecryptionError";
    throw err;
  }
}

export function encryptToFile(destPath, plaintext, options = {}) {
  const key = loadOrCreateKey(options.keyPath || resolveKeyPath(destPath));
  const blob = encryptBuffer(plaintext, key);
  atomicWriteBuffer(destPath, blob, options);
  return {
    ok: true,
    diskBytes: blob.length,
    plainBytes: Buffer.isBuffer(plaintext) ? plaintext.length : Buffer.byteLength(plaintext),
  };
}

export function decryptFromFile(filePath, options = {}) {
  const raw = fs.readFileSync(filePath);
  if (!isEncryptedBuffer(raw)) return { encrypted: false, buffer: raw };
  const key = loadKey(options.keyPath || resolveKeyPath(filePath));
  return { encrypted: true, buffer: decryptBuffer(raw, key) };
}
