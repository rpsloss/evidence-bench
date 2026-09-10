import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/index.mjs";
import { buildHarborPrecision } from "../src/data/harbor-precision.mjs";
import {
  COMPLETIONS,
  completionLabel,
  familyProgressBoard,
  familyProgressRows,
  handoffMarkdown,
} from "../src/lib/familyProgress.mjs";
import { buildAssemblerSnapshot } from "../src/lib/exportPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.json"), "utf8")).requirements;

function reqsIn(family) {
  return catalog.filter((row) => row.family === family);
}

function wipeFamily(seed, family) {
  const determinations = { ...seed.determinations };
  for (const row of reqsIn(family)) {
    determinations[row.reqId] = {
      ...determinations[row.reqId],
      finding: "not-reviewed",
      objectives: row.objectives.map((ao) => ({
        aoId: ao.aoId,
        finding: "not-reviewed",
        rationale: "",
        evidenceIds: [],
      })),
      ...(row.partialCredit?.kind === "fips"
        ? { fipsOverlay: { enc: "not-reviewed", fips: "not-reviewed" } }
        : {}),
    };
  }
  return { ...seed, determinations };
}

function answerFirstAo(seed, family) {
  const row = reqsIn(family)[0];
  const current = seed.determinations[row.reqId];
  const objectives = current.objectives.map((ao, i) => (i === 0 ? { ...ao, finding: "not-met" } : ao));
  return {
    ...seed,
    determinations: {
      ...seed.determinations,
      [row.reqId]: { ...current, finding: "not-reviewed", objectives },
    },
  };
}

function stripFamilyEvidence(seed, family) {
  const aoIds = new Set();
  for (const row of reqsIn(family)) {
    for (const ao of row.objectives) aoIds.add(ao.aoId);
  }
  return {
    ...seed,
    evidence: seed.evidence.map((item) => ({
      ...item,
      aoIds: (item.aoIds || []).filter((id) => !aoIds.has(id)),
    })),
  };
}

const temps = [];
const servers = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-progress-"));
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

describe("assembler family progress", () => {
  it("exposes unfinished / partial / gapped / present and does not invent a SPRS finding", () => {
    assert.deepEqual([...COMPLETIONS], ["unfinished", "partial", "gapped", "present"]);
    assert.equal(completionLabel("partial"), "Partial");
    assert.equal(completionLabel("gapped"), "Gapped");
  });

  it("Harbor seed is present on all 14 families; next action is consultant review", () => {
    const seed = buildHarborPrecision();
    const board = familyProgressBoard(seed);
    assert.equal(board.families.length, 14);
    assert.equal(board.counts.present, 14);
    assert.equal(board.counts.partial, 0);
    assert.equal(board.counts.gapped, 0);
    assert.equal(board.counts.unfinished, 0);
    assert.equal(
      board.families.every((row) => row.completion === "present" && row.reviewed === false),
      true,
    );
    assert.equal(board.next.family, "AC");
    assert.equal(board.next.href, "/requirements?family=AC");
    assert.match(board.next.title, /Review AC/);
    const ac = board.families[0];
    assert.equal(ac.family, "AC");
    assert.ok(ac.aoCount > 0);
    assert.equal(ac.unansweredAos, 0);
    assert.equal(ac.evidenceGaps, 0);
    assert.equal(ac.poamGaps, 0);
    const at = board.families.find((row) => row.family === "AT");
    assert.equal(at.notMet >= 1, true);
  });

  it("wiped family is unfinished; one answered AO is partial; stripped MET pointers are gapped", () => {
    const seed = buildHarborPrecision();
    const unfinished = familyProgressRows(wipeFamily(seed, "AC")).find((row) => row.family === "AC");
    assert.equal(unfinished.completion, "unfinished");
    assert.equal(unfinished.unansweredAos, unfinished.aoCount);

    const partial = familyProgressRows(answerFirstAo(wipeFamily(seed, "AC"), "AC")).find(
      (row) => row.family === "AC",
    );
    assert.equal(partial.completion, "partial");
    assert.ok(partial.unansweredAos > 0);
    assert.ok(partial.unansweredAos < partial.aoCount);

    const gapped = familyProgressRows(stripFamilyEvidence(seed, "AC")).find((row) => row.family === "AC");
    assert.equal(gapped.completion, "gapped");
    assert.equal(gapped.unansweredAos, 0);
    assert.ok(gapped.evidenceGaps > 0);
  });

  it("next action prefers unfinished over partial over gapped over review", () => {
    const seed = buildHarborPrecision();
    const mixed = stripFamilyEvidence(answerFirstAo(wipeFamily(wipeFamily(seed, "AC"), "AU"), "AU"), "CM");
    const board = familyProgressBoard(mixed);
    assert.equal(board.counts.unfinished, 1);
    assert.equal(board.counts.partial, 1);
    assert.equal(board.counts.gapped, 1);
    assert.equal(board.next.family, "AC");
    assert.match(board.next.title, /Start AC/);
  });

  it("handoff markdown is SAMPLE, lists partial as a status, and is not a SPRS file", () => {
    const seed = wipeFamily(buildHarborPrecision(), "PS");
    const md = handoffMarkdown(seed, { raw: 108, status: "conditional-l2-self" });
    assert.match(md, /UNCLASSIFIED \/\/ SAMPLE \/\/ NOT A SPRS SUBMISSION/);
    assert.match(md, /Not a SPRS file/);
    assert.match(md, /\| PS Personnel Security \| unfinished \|/);
    assert.match(md, /Completion is assembler work status/);
    assert.equal(/sub-par/i.test(md), false);
  });

  it("assembler snapshot zip is allowed on an unfinished pack and omits sprs-manual-entry.csv", () => {
    const assessment = wipeFamily(buildHarborPrecision(), "AC");
    const pack = buildAssemblerSnapshot({ assessment, createdAt: "2026-09-10T00:00:00.000Z" });
    assert.equal(pack.ok, true);
    assert.equal(pack.filename, "evidence-bench-assembler-snapshot.zip");
    assert.equal(Boolean(pack.files["sprs-manual-entry.csv"]), false);
    assert.match(pack.files["HANDOFF.md"], /Start AC/);
    assert.match(pack.files["HANDOFF.md"], /UNCLASSIFIED \/\/ SAMPLE \/\/ NOT A SPRS SUBMISSION/);
    assert.match(pack.files["README.md"], /not a SPRS submission/i);
    const members = unzipStore(pack.zip);
    assert.equal(
      members.every((row) => row.body.includes("UNCLASSIFIED // SAMPLE // NOT A SPRS SUBMISSION")),
      true,
    );
  });

  it("POST /api/snapshot returns a watermarked zip for Harbor and for an unfinished pack", async () => {
    const dir = tempDir();
    const server = await listen(createApp({ assessmentPath: path.join(dir, "assessment.json.enc") }));
    const put = await rpc(server, "PUT", "/api/assessment", { json: { assessment: buildHarborPrecision() } });
    assert.equal(put.status, 200);
    const res = await rpc(server, "POST", "/api/snapshot", { binary: true });
    assert.equal(res.status, 200);
    assert.match(String(res.headers["content-disposition"]), /evidence-bench-assembler-snapshot\.zip/);
    const members = unzipStore(res.buf);
    assert.ok(members.some((row) => row.name === "HANDOFF.md"));
    assert.equal(
      members.some((row) => row.name === "sprs-manual-entry.csv"),
      false,
    );

    const unfinished = wipeFamily(buildHarborPrecision(), "IR");
    const put2 = await rpc(server, "PUT", "/api/assessment", { json: { assessment: unfinished } });
    assert.equal(put2.status, 200);
    const res2 = await rpc(server, "POST", "/api/snapshot", { binary: true });
    assert.equal(res2.status, 200);
    const handoff = unzipStore(res2.buf).find((row) => row.name === "HANDOFF.md");
    assert.match(handoff.body, /Start IR/);
  });
});
