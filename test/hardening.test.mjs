import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { validateAssessment } from "../server/assessment.mjs";
import { loadPackage, savePackage } from "../server/packageStore.mjs";
import { resolveKeyPath } from "../server/atRest.mjs";
import { buildHarborPrecision } from "../src/data/harbor-precision.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function routePaths(src) {
  const paths = [];
  const re = /app\.(get|post|put|delete)\(\s*[`'"]([^`'"]+)[`'"]/g;
  let m;
  while ((m = re.exec(src))) paths.push(m[2]);
  return paths;
}

const temps = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("hardening", () => {
  it("does not register SPRS submit or affirm routes", () => {
    const src = fs.readFileSync(path.join(root, "server/index.mjs"), "utf8");
    const banned = new Set(["/api/sprs", "/api/affirm", "/api/submit"]);
    for (const p of routePaths(src)) {
      assert.equal(banned.has(p), false, `banned route ${p}`);
    }
  });

  it("binds the API to loopback and does not use a wildcard bind host", () => {
    const src = fs.readFileSync(path.join(root, "server/index.mjs"), "utf8");
    assert.match(src, /LISTEN_HOST\s*=\s*"127\.0\.0\.1"/);
    assert.match(src, /listen\(\s*port\s*,\s*LISTEN_HOST/);
    assert.match(src, /LOCAL_VITE_ORIGIN\s*=\s*"http:\/\/127\.0\.0\.1:5173"/);
    assert.match(src, /cors\(\s*\{\s*origin:\s*LOCAL_VITE_ORIGIN/);
    assert.equal(/\blisten\([^)]*0\.0\.0\.0/.test(src), false);
    assert.equal(/LISTEN_HOST\s*=\s*"0\.0\.0\.0"/.test(src), false);
    assert.equal(src.includes("0.0.0.0"), false);
  });

  it("keeps Vite on 127.0.0.1:5173", () => {
    const src = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
    assert.match(src, /host:\s*"127\.0\.0\.1"/);
    assert.match(src, /port:\s*5173/);
    assert.equal(src.includes("0.0.0.0"), false);
  });

  it("package.json and package-lock.json have no multer dependency", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.equal(Object.hasOwn(pkg.dependencies || {}, "multer"), false);
    assert.equal(Object.hasOwn(pkg.devDependencies || {}, "multer"), false);
    const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
    const rootPkg = lock.packages?.[""] || {};
    assert.equal(Object.hasOwn(rootPkg.dependencies || {}, "multer"), false);
    assert.equal(Object.hasOwn(rootPkg.devDependencies || {}, "multer"), false);
    assert.equal(
      Object.keys(lock.packages || {}).some((k) => k === "node_modules/multer" || k.endsWith("/multer")),
      false,
    );
  });

  it("has no storedName upload path", () => {
    const src = fs.readFileSync(path.join(root, "server/index.mjs"), "utf8");
    assert.equal(/\/api\/evidence\/upload/.test(src), false);
    assert.equal(/\bmulter\b/.test(src), false);
    assert.equal(/storedName\s*=/.test(src), false);
  });

  it("rejects storedName anywhere on the assessment", () => {
    const seed = buildHarborPrecision();
    const rootHit = validateAssessment({ assessment: { ...seed, storedName: "blob.bin" } });
    assert.equal(rootHit.ok, false);
    assert.equal(rootHit.status, 400);
    assert.equal(rootHit.error, "storedName-not-allowed");

    const assets = seed.assets.map((row, i) => (i === 0 ? { ...row, storedName: "x" } : row));
    const assetHit = validateAssessment({ assessment: { ...seed, assets } });
    assert.equal(assetHit.ok, false);
    assert.equal(assetHit.error, "storedName-not-allowed");

    const evidenceHit = validateAssessment({
      assessment: { ...seed, evidence: [{ storedName: "upload.bin" }] },
    });
    assert.equal(evidenceHit.ok, false);
    assert.equal(evidenceHit.error, "storedName-not-allowed");
  });

  it("warns on CUI-like filenames without rejecting the PUT", () => {
    const seed = buildHarborPrecision();
    const assets = seed.assets.map((row, i) => (i === 0 ? { ...row, notes: "cui-drawing.pdf" } : row));
    const warned = validateAssessment({ assessment: { ...seed, assets } });
    assert.equal(warned.ok, true);
    assert.ok(warned.warnings.length >= 1);
    assert.equal(
      warned.warnings.some((w) => w.message.includes("CUI-like filename")),
      true,
    );

    const clean = validateAssessment({
      assessment: {
        ...seed,
        assets: seed.assets.map((row, i) => (i === 0 ? { ...row, notes: "recruiting.pdf" } : row)),
      },
    });
    assert.equal(clean.ok, true);
    assert.equal(clean.warnings.length, 0);
  });

  it("rotates .bak to the previous ciphertext on each save", () => {
    const dir = tempDir();
    const file = path.join(dir, "assessment.json.enc");
    savePackage(file, { n: 1 }, { audit: false });
    savePackage(file, { n: 2 }, { audit: false });
    assert.deepEqual(loadPackage(file + ".bak", { audit: false }).package, { n: 1 });
    savePackage(file, { n: 3 }, { audit: false });
    assert.deepEqual(loadPackage(file + ".bak", { audit: false }).package, { n: 2 });
    assert.deepEqual(loadPackage(file, { audit: false }).package, { n: 3 });
  });

  it("does not mint a new key over existing ciphertext", () => {
    const dir = tempDir();
    const file = path.join(dir, "assessment.json.enc");
    savePackage(file, { n: 1 }, { audit: false });
    const before = fs.readFileSync(file);
    const keyPath = resolveKeyPath(file);
    fs.unlinkSync(keyPath);
    assert.throws(() => savePackage(file, { n: 2 }, { audit: false }), (err) => err.name === "KeyMissing");
    assert.deepEqual(fs.readFileSync(file), before);
    assert.equal(fs.existsSync(keyPath), false);
  });
});
