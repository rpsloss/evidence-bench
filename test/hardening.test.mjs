import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function routePaths(src) {
  const paths = [];
  const re = /app\.(get|post|put|delete)\(\s*[`'"]([^`'"]+)[`'"]/g;
  let m;
  while ((m = re.exec(src))) paths.push(m[2]);
  return paths;
}

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

  it("package.json has no multer dependency", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.equal(Object.hasOwn(pkg.dependencies || {}, "multer"), false);
    assert.equal(Object.hasOwn(pkg.devDependencies || {}, "multer"), false);
  });

  it("has no storedName upload path", () => {
    const src = fs.readFileSync(path.join(root, "server/index.mjs"), "utf8");
    assert.equal(/\/api\/evidence\/upload/.test(src), false);
    assert.equal(/\bmulter\b/.test(src), false);
    assert.equal(/storedName\s*=/.test(src), false);
  });
});
