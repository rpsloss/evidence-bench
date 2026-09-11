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
  L1_EXPORT_FILENAMES,
  L1_FINDINGS_CSV_COLUMNS,
  L1_SNAPSHOT_FILENAMES,
  L1_SPRS_CSV_COLUMNS,
  SAMPLE_WATERMARK,
  buildL1ExportPack,
  buildL1Snapshot,
  canExportL1Zip,
  l1AffirmationChecklist,
  l1ExportReady,
  markL1ExportReady,
} from "../src/lib/l1Export.mjs";
import { EXPORT_FILENAMES } from "../src/lib/exportPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const l1 = JSON.parse(fs.readFileSync(path.join(root, "src/data/l1-catalog.json"), "utf8")).requirements;

function asL1(seed) {
  return {
    ...seed,
    engagement: { ...seed.engagement, workingLevel: "level-1-self" },
  };
}

function wipeReq(seed, reqId) {
  const src = l1.find((row) => row.reqId === reqId);
  return {
    ...seed,
    determinations: {
      ...seed.determinations,
      [reqId]: {
        ...seed.determinations[reqId],
        finding: "not-reviewed",
        objectives: src.objectives.map((ao) => ({
          aoId: ao.aoId,
          finding: "not-reviewed",
          rationale: "",
          evidenceIds: [],
        })),
      },
    },
  };
}

function failReq(seed, reqId) {
  const src = l1.find((row) => row.reqId === reqId);
  return {
    ...seed,
    determinations: {
      ...seed.determinations,
      [reqId]: {
        ...seed.determinations[reqId],
        finding: "not-met",
        objectives: src.objectives.map((ao) => ({
          aoId: ao.aoId,
          finding: "not-met",
          rationale: "L1 gap (sample)",
          evidenceIds: [],
        })),
      },
    },
  };
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
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const start = i + 30 + nameLen + extraLen;
    const body = buf.subarray(start, start + comp);
    if (method !== 0) throw new Error(`compressed member ${name}`);
    files.push({ name, body: body.toString("utf8") });
    i = start + comp;
  }
  return files;
}

function csvRecords(text) {
  return text
    .split(/\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.trimEnd());
}

const temps = [];
const servers = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-l1exp-"));
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
        headers: payload
          ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
          : {},
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
          const raw = buf.toString("utf8");
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body });
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
    fs.rmSync(temps.pop(), { recursive: true, force: true });
  }
});

describe("Level 1 SPRS typing sheet", () => {
  it("Harbor Level 1 floor check emits MET typing sheet with 17 findings and no POA&M", () => {
    const seed = asL1(buildHarborPrecision());
    assert.equal(canExportL1Zip(seed), true);
    const pack = buildL1ExportPack({ assessment: seed, createdAt: "2026-09-11T12:00:00.000Z" });
    assert.equal(pack.ok, true);
    assert.equal(pack.filename, "evidence-bench-l1-sample.zip");
    assert.deepEqual(Object.keys(pack.files), [...L1_EXPORT_FILENAMES]);
    assert.equal(Object.hasOwn(pack.files, "sprs-manual-entry.csv"), false);
    assert.equal(Object.hasOwn(pack.files, "poam.csv"), false);
    assert.equal(Object.hasOwn(pack.files, "ssp.md"), false);

    const sprs = csvRecords(pack.files["l1-sprs-entry.csv"]);
    assert.equal(sprs[0], L1_SPRS_CSV_COLUMNS);
    assert.equal(sprs[1], "Level 1 (Self),,Enclave,XXXXX,MET,18,Harbor Precision (fictional),true");
    assert.match(pack.files["l1-sprs-entry.csv"], /cmmcStatusDate = leave blank here/);

    const findings = csvRecords(pack.files["l1-far-findings.csv"]);
    assert.equal(findings[0], L1_FINDINGS_CSV_COLUMNS);
    assert.equal(findings.length, 18);
    assert.equal(
      findings.slice(1).every((row) => row.endsWith(",Met")),
      true,
    );
    assert.match(pack.files["l1-far-findings.csv"], /PE\.L1-b\.1\.ix/);
    assert.match(pack.files["HANDOFF.md"], /No POA&M/);
    assert.match(pack.files["README.md"], /not a CMMC Status Date/);
    assert.match(pack.files["COLUMNS.md"], /32 CFR 170\.15/);
    assert.equal(pack.files["README.md"].includes("UNCLASSIFIED // SAMPLE // NOT A SPRS SUBMISSION"), true);

    const members = unzipStore(pack.zip);
    assert.deepEqual(
      members.map((row) => row.name).sort(),
      [...L1_EXPORT_FILENAMES].sort(),
    );
    for (const file of members) {
      assert.match(file.body, /UNCLASSIFIED \/\/ SAMPLE \/\/ NOT A SPRS SUBMISSION/);
    }
  });

  it("refuses unanswered Level 1 rows; NOT MET still exports as NOT MET", () => {
    const unanswered = asL1(wipeReq(buildHarborPrecision(), "3.1.1"));
    assert.equal(canExportL1Zip(unanswered), false);
    const refused = buildL1ExportPack({ assessment: unanswered });
    assert.equal(refused.ok, false);
    assert.equal(refused.error, "not-reviewed");

    const gap = asL1(failReq(buildHarborPrecision(), "3.1.20"));
    assert.equal(canExportL1Zip(gap), true);
    const pack = buildL1ExportPack({ assessment: gap });
    assert.equal(pack.ok, true);
    assert.match(pack.files["l1-sprs-entry.csv"], /,NOT MET,/);
    assert.match(pack.files["l1-far-findings.csv"], /3\.1\.20,External Connections,Not Met/);
    const checks = l1AffirmationChecklist(gap);
    assert.equal(checks.find((row) => row.id === "compliance-final").satisfied, false);
    assert.equal(checks.find((row) => row.id === "no-not-reviewed").satisfied, true);
    assert.equal(checks.find((row) => row.id === "poam-not-permitted").satisfied, true);
  });

  it("snapshot omits the typing sheet and allows unanswered rows", () => {
    const seed = asL1(wipeReq(buildHarborPrecision(), "3.10.4"));
    const pack = buildL1Snapshot({ assessment: seed });
    assert.equal(pack.ok, true);
    assert.deepEqual(Object.keys(pack.files), [...L1_SNAPSHOT_FILENAMES]);
    assert.equal(Object.hasOwn(pack.files, "l1-sprs-entry.csv"), false);
    assert.match(pack.files["l1-far-findings.csv"], /3\.10\.4,.+,Unanswered/);
    assert.match(pack.files["HANDOFF.md"], /PE\.L1-b\.1\.ix/);
  });

  it("export-ready needs intake plus answered rows; Harbor L1 is ready to stamp", () => {
    const seed = asL1(buildHarborPrecision());
    assert.equal(l1ExportReady(seed), true);
    const marked = markL1ExportReady(seed, "2026-09-11T12:00:00.000Z");
    assert.equal(marked.ok, true);
    assert.equal(marked.assessment.prepMarkedAt, "2026-09-11T12:00:00.000Z");

    const noIntake = asL1({
      ...buildHarborPrecision(),
      engagement: { ...buildHarborPrecision().engagement, workingLevel: "level-1-self", intakeNotedAt: null },
    });
    assert.equal(markL1ExportReady(noIntake).ok, false);
    assert.equal(l1AffirmationChecklist(seed).map((row) => row.id).join(","), [
      "intake-confirmed",
      "cages-present",
      "ao-named",
      "no-not-reviewed",
      "evidence-met",
      "compliance-final",
      "poam-not-permitted",
      "sample-banner",
    ].join(","));
  });

  it("POST /api/export follows working level; L2 Harbor still emits the 110-row CSV", async () => {
    const dir = tempDir();
    const server = await listen(createApp({ assessmentPath: path.join(dir, "assessment.json.enc") }));
    const l2put = await rpc(server, "PUT", "/api/assessment", { json: { assessment: buildHarborPrecision() } });
    assert.equal(l2put.status, 200);
    const l2 = await rpc(server, "POST", "/api/export", { binary: true });
    assert.equal(l2.status, 200);
    assert.match(String(l2.headers["content-disposition"]), /evidence-bench-sample\.zip/);
    assert.equal(
      unzipStore(l2.buf).some((row) => row.name === "sprs-manual-entry.csv"),
      true,
    );

    const complete = asL1(buildHarborPrecision());
    const put = await rpc(server, "PUT", "/api/assessment", { json: { assessment: complete } });
    assert.equal(put.status, 200);
    const res = await rpc(server, "POST", "/api/export", { binary: true });
    assert.equal(res.status, 200);
    assert.match(String(res.headers["content-disposition"]), /evidence-bench-l1-sample\.zip/);
    const names = unzipStore(res.buf).map((row) => row.name);
    assert.equal(names.includes("l1-sprs-entry.csv"), true);
    assert.equal(names.includes("sprs-manual-entry.csv"), false);
    assert.equal(names.includes("poam.csv"), false);

    const snap = await rpc(server, "POST", "/api/snapshot", { binary: true });
    assert.equal(snap.status, 200);
    assert.match(String(snap.headers["content-disposition"]), /evidence-bench-l1-snapshot\.zip/);
    const snapNames = unzipStore(snap.buf).map((row) => row.name);
    assert.equal(snapNames.includes("l1-sprs-entry.csv"), false);
  });

  it("Export UI has a Level 1 typing sheet and still never submits", () => {
    const src = fs.readFileSync(path.join(root, "src/pages/Export.tsx"), "utf8");
    assert.match(src, /What to type into SPRS/);
    assert.match(src, /l1-sprs-entry/);
    assert.match(src, /32 CFR 170\.15/);
    assert.equal(/\/api\/sprs|\/api\/affirm|\/api\/submit/.test(src), false);
    assert.equal(EXPORT_FILENAMES.includes("sprs-manual-entry.csv"), true);
  });
});
