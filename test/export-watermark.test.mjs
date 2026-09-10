import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/index.mjs";
import { emitSampleExport } from "../server/emitApi.mjs";
import { buildHarborPrecision } from "../src/data/harbor-precision.mjs";
import {
  affirmationChecklist,
  buildExportPack,
  canExportZip,
  CHECKLIST_PREFIX,
  EXPORT_FILENAMES,
  exportReady,
  FAMILY_IDS,
  familyReviewsComplete,
  markExportReady,
  POAM_CSV_COLUMNS,
  SAMPLE_WATERMARK,
  SCOPE_CSV_COLUMNS,
  SPRS_CSV_COLUMNS,
} from "../src/lib/exportPack.mjs";
import { storedFinding } from "../src/lib/rollup.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.json"), "utf8")).requirements;
const FINDINGS = new Set(["Met", "Not Met", "N/A"]);
const CAPTURED = "2026-01-15T00:00:00Z";

function req(id) {
  return catalog.find((row) => row.reqId === id);
}

function withMetEvidence(seed, { draft = false } = {}) {
  const evidence = [];
  for (const row of catalog) {
    const det = seed.determinations[row.reqId];
    if (!det) continue;
    for (const ao of det.objectives) {
      if (ao.finding !== "met") continue;
      evidence.push({
        id: `ev-${ao.aoId}`,
        title: `Sample evidence ${ao.aoId}`,
        kind: "policy",
        uri: `file:///sample/unclass/${ao.aoId}.pdf`,
        capturedAt: CAPTURED,
        aoIds: [ao.aoId],
        owner: "sample",
        draft,
        notes: "Unclassified pointer only.",
      });
    }
  }
  return { ...seed, evidence };
}

function allFamilyReviews() {
  return FAMILY_IDS.map((family) => ({
    family,
    reviewed: true,
    reviewer: "sample consultant",
    reviewedAt: CAPTURED,
    notes: "SAMPLE review flag",
  }));
}

function unzipStore(bytes) {
  const buf = Buffer.from(bytes);
  const files = [];
  let i = 0;
  while (i + 30 <= buf.length) {
    const sig = buf.readUInt32LE(i);
    if (sig !== 0x04034b50) break;
    const method = buf.readUInt16LE(i + 8);
    const comp = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString("utf8");
    const start = i + 30 + nameLen + extraLen;
    const data = buf.slice(start, start + comp);
    assert.equal(method, 0, `zip member ${name} must be stored so SAMPLE stays literal`);
    files.push({ name, body: data.toString("utf8") });
    i = start + comp;
  }
  return files;
}

function csvRecords(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith("#"));
}

function sprsByReq(text) {
  const map = new Map();
  for (const line of csvRecords(text).slice(1)) {
    const cols = line.split(",");
    map.set(cols[2], { family: cols[0], cmmcId: cols[1], finding: cols[4], mfa: cols[6], fips: cols[7] });
  }
  return map;
}

const temps = [];
const servers = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-export-"));
  temps.push(dir);
  return dir;
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
    servers.push(server);
  });
}

function rpc(server, method, urlPath, { json, binary } = {}) {
  const { port } = server.address();
  const payload = json === undefined ? undefined : JSON.stringify(json);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (binary) {
            resolve({ status: res.statusCode, headers: res.headers, buf });
            return;
          }
          let body = null;
          const raw = buf.toString("utf8");
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body, buf });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

afterEach(async () => {
  while (servers.length) {
    const server = servers.pop();
    await new Promise((resolve) => server.close(() => resolve()));
  }
  while (temps.length) {
    const dir = temps.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("export watermark T15", () => {
  it("Harbor seed is zip-exportable but not Export-ready until 14 family reviews", () => {
    const seed = buildHarborPrecision();
    assert.equal(storedFinding(req("3.1.1"), seed.determinations["3.1.1"], seed.evidence), "met");
    assert.equal(familyReviewsComplete(seed), false);
    assert.equal(exportReady(seed), false);
    assert.equal(canExportZip(seed), true);
    const pack = buildExportPack({ assessment: seed });
    assert.equal(pack.ok, true);
    assert.equal(pack.checklist.find((item) => item.id === "evidence-met")?.satisfied, true);
    assert.equal(pack.checklist.find((item) => item.id === "family-reviews")?.satisfied, false);
    const marked = markExportReady(seed);
    assert.equal(marked.ok, false);
  });

  it("T13 draft-only evidence refuses export and would not emit Met", () => {
    const draft = withMetEvidence(buildHarborPrecision(), { draft: true });
    assert.equal(storedFinding(req("3.1.1"), draft.determinations["3.1.1"], draft.evidence), "not-reviewed");
    const pack = buildExportPack({ assessment: draft });
    assert.equal(pack.ok, false);
    assert.equal(pack.error, "not-reviewed");
    assert.equal(canExportZip(draft), false);
    assert.equal(pack.checklist.find((item) => item.id === "evidence-met")?.satisfied, false);
  });

  it("T22 keeper: temporaryDeficiency without operational POA exports Not Met, not 409", () => {
    const assessment = withMetEvidence(buildHarborPrecision());
    assessment.determinations["3.1.3"] = {
      ...assessment.determinations["3.1.3"],
      temporaryDeficiency: true,
    };
    assessment.operationalPoas = [];
    assert.equal(
      storedFinding(
        req("3.1.3"),
        assessment.determinations["3.1.3"],
        assessment.evidence,
        assessment.operationalPoas,
      ),
      "not-met",
    );
    assert.equal(canExportZip(assessment), true);
    const pack = buildExportPack({ assessment });
    assert.equal(pack.ok, true);
    assert.equal(sprsByReq(pack.files["sprs-manual-entry.csv"]).get("3.1.3").finding, "Not Met");
  });

  it("mixed NOT MET + unanswered AO refuses export; FIPS overlay unanswered is red", () => {
    const mixed = withMetEvidence(buildHarborPrecision());
    const det = mixed.determinations["3.1.1"];
    mixed.determinations["3.1.1"] = {
      ...det,
      objectives: det.objectives.map((ao, i) => ({
        ...ao,
        finding: i === 0 ? "not-met" : i === 1 ? "not-reviewed" : ao.finding,
      })),
    };
    assert.equal(storedFinding(req("3.1.1"), mixed.determinations["3.1.1"], mixed.evidence), "not-met");
    assert.equal(canExportZip(mixed), false);
    const pack = buildExportPack({ assessment: mixed });
    assert.equal(pack.ok, false);
    assert.equal(pack.error, "not-reviewed");
    assert.equal(pack.checklist.find((item) => item.id === "no-not-reviewed")?.satisfied, false);

    const overlay = withMetEvidence(buildHarborPrecision());
    overlay.determinations["3.13.11"] = {
      ...overlay.determinations["3.13.11"],
      fipsOverlay: { enc: "met", fips: "not-reviewed" },
    };
    assert.equal(canExportZip(overlay), false);
    const overlayPack = buildExportPack({ assessment: overlay });
    assert.equal(overlayPack.ok, false);
    assert.equal(overlayPack.checklist.find((item) => item.id === "no-not-reviewed")?.satisfied, false);
  });

  it("complete SAMPLE zip: every file contains the watermark; CSV columns frozen", () => {
    const assessment = withMetEvidence(buildHarborPrecision());
    assert.equal(storedFinding(req("3.1.1"), assessment.determinations["3.1.1"], assessment.evidence), "met");
    assert.equal(storedFinding(req("3.2.3"), assessment.determinations["3.2.3"], assessment.evidence), "not-met");
    const pack = buildExportPack({ assessment, createdAt: "2026-09-09T00:00:00.000Z" });
    assert.equal(pack.ok, true);
    assert.equal(pack.watermark, SAMPLE_WATERMARK);
    assert.deepEqual(Object.keys(pack.files), [...EXPORT_FILENAMES]);

    const members = unzipStore(pack.zip);
    assert.deepEqual(
      members.map((row) => row.name).sort(),
      [...EXPORT_FILENAMES].sort(),
    );
    for (const file of members) {
      assert.match(file.body, /UNCLASSIFIED \/\/ SAMPLE \/\/ NOT A SPRS SUBMISSION/);
      assert.equal(file.body, pack.files[file.name]);
    }
    assert.match(Buffer.from(pack.zip).toString("utf8"), /UNCLASSIFIED \/\/ SAMPLE \/\/ NOT A SPRS SUBMISSION/);

    const sprs = csvRecords(pack.files["sprs-manual-entry.csv"]);
    assert.equal(sprs[0], SPRS_CSV_COLUMNS);
    assert.equal(sprs.length, 111);
    const byReq = sprsByReq(pack.files["sprs-manual-entry.csv"]);
    for (const row of byReq.values()) {
      assert.equal(FINDINGS.has(row.finding), true, row.finding);
      assert.notEqual(row.finding, "not-reviewed");
    }
    assert.equal(byReq.get("3.12.4").cmmcId, "CA.L2-3.12.4");
    assert.equal(byReq.get("3.12.4").family, "CA");
    assert.equal(byReq.get("3.12.4").finding, "Met");
    assert.equal(byReq.get("3.2.3").finding, "Not Met");
    assert.equal(byReq.get("3.4.9").finding, "Not Met");
    assert.equal(byReq.get("3.5.3").mfa, "all-users");
    assert.equal(byReq.get("3.13.11").fips, "fips-validated");
    assert.equal(byReq.get("3.1.1").mfa, "");
    assert.equal(byReq.get("3.1.1").fips, "");

    const scope = csvRecords(pack.files["scope.csv"]);
    assert.equal(scope[0], SCOPE_CSV_COLUMNS);
    assert.equal(scope[1], "enclave,18,XXXXX,true,Harbor Precision (fictional)");

    const poam = csvRecords(pack.files["poam.csv"]);
    assert.equal(poam[0], POAM_CSV_COLUMNS);
    assert.equal(poam.length, 3);
    assert.match(poam[1], /^3\.2\.3,AT\.L2-3\.2\.3,1,true,/);
    assert.match(pack.files["README.md"], /not a CMMC Status Date/);
    assert.match(pack.files["checklist.md"], new RegExp(CHECKLIST_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const json = JSON.parse(pack.files["assessment.json"]);
    assert.equal(json.watermark, SAMPLE_WATERMARK);
    assert.equal(json.assessment.organization.cage, "XXXXX");
    assert.equal(json.assessment.organization.fictional, true);
  });

  it("familyReviews empty blocks export-ready; 14 reviews unlock prepMarkedAt only", () => {
    const assessment = withMetEvidence(buildHarborPrecision());
    assert.equal(exportReady(assessment), false);
    const ready = { ...assessment, familyReviews: allFamilyReviews() };
    assert.equal(familyReviewsComplete(ready), true);
    const marked = markExportReady(ready, "2026-09-09T12:00:00.000Z");
    assert.equal(marked.ok, true);
    assert.equal(marked.assessment.prepMarkedAt, "2026-09-09T12:00:00.000Z");
    const pack = buildExportPack({ assessment: ready });
    assert.equal(pack.ok, true);
    assert.equal(pack.exportReady, true);
    assert.equal(pack.checklist.find((item) => item.id === "family-reviews")?.satisfied, true);
  });

  it("POST /api/export refuses Harbor seed and returns a watermarked zip when findings are complete", async () => {
    const dir = tempDir();
    const server = await listen(createApp({ assessmentPath: path.join(dir, "assessment.json.enc") }));
    const seedPut = await rpc(server, "PUT", "/api/assessment", { json: { assessment: buildHarborPrecision() } });
    assert.equal(seedPut.status, 200);
    const seeded = await rpc(server, "POST", "/api/export", { binary: true });
    assert.equal(seeded.status, 200);

    const complete = withMetEvidence(buildHarborPrecision());
    const put = await rpc(server, "PUT", "/api/assessment", { json: { assessment: complete } });
    assert.equal(put.status, 200);
    const res = await rpc(server, "POST", "/api/export", { binary: true });
    assert.equal(res.status, 200);
    assert.match(String(res.headers["content-type"]), /zip/);
    assert.match(String(res.headers["content-disposition"]), /evidence-bench-sample\.zip/);
    const members = unzipStore(res.buf);
    assert.equal(members.length, EXPORT_FILENAMES.length);
    for (const file of members) {
      assert.match(file.body, /UNCLASSIFIED \/\/ SAMPLE \/\/ NOT A SPRS SUBMISSION/);
    }
    const emitted = emitSampleExport(complete);
    assert.equal(emitted.ok, true);
    assert.equal(emitted.manifest.files.every((row) => /^[0-9a-f]{64}$/.test(row.sha256)), true);
  });

  it("Export.tsx has no Affirm button and no SAMPLE unlock", () => {
    const src = fs.readFileSync(path.join(root, "src/pages/Export.tsx"), "utf8");
    assert.match(src, /SAMPLE_WATERMARK/);
    assert.match(src, /prepMarkedAt/);
    assert.match(src, /not a CMMC Status Date/);
    assert.equal(/<(button|a)[^>]*>[^<]*Affirm/i.test(src), false);
    assert.equal(/unlock/i.test(src), false);
    assert.equal(/\/api\/sprs|\/api\/affirm|\/api\/submit/.test(src), false);
    const serverSrc = fs.readFileSync(path.join(root, "server/index.mjs"), "utf8");
    assert.match(serverSrc, /app\.post\(\s*"\/api\/export"/);
    assert.equal(/app\.(get|post|put|delete)\(\s*["'`]\/api\/(sprs|affirm|submit)/.test(serverSrc), false);
  });

  it("frozen checklist ids and UI prefix are stable", () => {
    const items = affirmationChecklist(buildHarborPrecision());
    assert.deepEqual(
      items.map((row) => row.id),
      [
        "ssp-present",
        "no-not-reviewed",
        "evidence-met",
        "status-affirmable",
        "no-banned-unlegal",
        "poam-covers-gaps",
        "family-reviews",
        "sample-banner",
        "scope-graph",
        "ao-named",
        "esp-crm",
      ],
    );
    assert.equal(items.find((row) => row.id === "sample-banner")?.satisfied, true);
    assert.equal(items.find((row) => row.id === "ao-named")?.satisfied, true);
    const ui = fs.readFileSync(path.join(root, "src/pages/Export.tsx"), "utf8");
    assert.match(ui, /CHECKLIST_PREFIX/);
  });
});
