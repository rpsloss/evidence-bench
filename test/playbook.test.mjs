import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/index.mjs";
import { buildHarborL1First, buildHarborPrecision } from "../src/data/harbor-precision.mjs";
import { normalizeEngagement } from "../src/lib/engagement.mjs";
import {
  clockState,
  consultantPlaybook,
  sprsBlockers,
  stampL1Typed,
  stampL2Affirmed,
} from "../src/lib/playbook.mjs";
import { scoreFromAssessment } from "../src/lib/score.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.json"), "utf8")).requirements;
const catalogMeta = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.meta.json"), "utf8"));

const temps = [];
const servers = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-play-"));
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

function rpc(server, method, urlPath, { json } = {}) {
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
          const raw = Buffer.concat(chunks).toString("utf8");
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }
          resolve({ status: res.statusCode, body });
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

function scoreOf(assessment) {
  return scoreFromAssessment(assessment, catalog, catalogMeta.catalogSha256);
}

describe("consultant playbook", () => {
  it("Harbor L2 next item is 14-family review and SPRS is blocked on Export-ready", () => {
    const seed = buildHarborPrecision();
    const book = consultantPlaybook(seed, scoreOf(seed));
    assert.match(book.next.title, /14 families/);
    assert.equal(book.open.some((row) => row.id === "l2-reviews"), true);
    assert.equal(book.sprsBlockers.some((row) => row.id === "l2-reviews"), true);
    assert.match(book.sprsBlockers.find((row) => row.id === "l2-reviews").reason, /not a CMMC Status Date/);
    assert.equal(book.clocks.some((row) => row.id === "l2-annual"), true);
    assert.equal(book.clocks.find((row) => row.id === "l2-annual").state, "missing");
  });

  it("L1-first Harbor is ready to type Level 1, then promote; PE.L1-b.1.ix is done", () => {
    const seed = buildHarborL1First();
    const book = consultantPlaybook(seed, scoreOf(seed));
    assert.equal(book.items.find((row) => row.id === "l1-pe-ix").status, "done");
    assert.equal(book.items.find((row) => row.id === "l1-close").status, "done");
    assert.equal(book.next.id, "l1-type-sprs");
    assert.equal(book.open.some((row) => row.id === "promote-l2"), true);
    assert.equal(book.sprsBlockers.length, 0);
    assert.equal(book.clocks.some((row) => row.id === "l1-annual"), true);
  });

  it("unanswered Level 1 blocks SPRS in plain language and names the visitor trio when PE is open", () => {
    const seed = buildHarborL1First();
    seed.determinations["3.10.4"] = {
      ...seed.determinations["3.10.4"],
      finding: "not-reviewed",
      objectives: seed.determinations["3.10.4"].objectives.map((ao) => ({ ...ao, finding: "not-reviewed" })),
    };
    const book = consultantPlaybook(seed, scoreOf(seed));
    assert.equal(book.items.find((row) => row.id === "l1-pe-ix").status, "todo");
    assert.match(book.items.find((row) => row.id === "l1-pe-ix").detail, /3\.10\.3/);
    assert.equal(book.sprsBlockers.some((row) => row.id === "l1-unanswered"), true);
    assert.match(book.sprsBlockers.find((row) => row.id === "l1-unanswered").reason, /no POA&M/i);
    assert.equal(book.next.id, "l1-pe-ix");
  });

  it("clocks mark overdue after 365 days and stamps persist on PUT", async () => {
    const now = Date.parse("2026-09-11T00:00:00.000Z");
    assert.equal(clockState(null, now).state, "missing");
    assert.equal(clockState("2026-09-01T00:00:00.000Z", now).state, "ok");
    assert.equal(clockState("2025-09-20T00:00:00.000Z", now).state, "soon");
    assert.equal(clockState("2025-08-01T00:00:00.000Z", now).state, "overdue");

    const stamped = {
      ...buildHarborL1First(),
      engagement: stampL1Typed(buildHarborL1First().engagement, "2025-08-01T00:00:00.000Z"),
    };
    const book = consultantPlaybook(stamped, scoreOf(stamped), now);
    assert.equal(book.open.some((row) => row.id === "l1-annual-overdue"), true);
    assert.match(book.open.find((row) => row.id === "l1-annual-overdue").detail, /not the CMMC Status Date/);

    const dir = tempDir();
    const server = await listen(createApp({ assessmentPath: path.join(dir, "assessment.json.enc") }));
    const withStamps = {
      ...buildHarborPrecision(),
      engagement: stampL2Affirmed(stampL1Typed(buildHarborPrecision().engagement, "2026-01-01T00:00:00.000Z"), "2026-02-01T00:00:00.000Z"),
    };
    const put = await rpc(server, "PUT", "/api/assessment", { json: { assessment: withStamps } });
    assert.equal(put.status, 200);
    const got = await rpc(server, "GET", "/api/assessment");
    const engagement = normalizeEngagement(got.body.assessment.engagement);
    assert.equal(engagement.l1TypedAt, "2026-01-01T00:00:00.000Z");
    assert.equal(engagement.l2AffirmedAt, "2026-02-01T00:00:00.000Z");
  });

  it("Home playbook never submits or affirms", () => {
    const home = fs.readFileSync(path.join(root, "src/pages/Home.tsx"), "utf8");
    assert.match(home, /Consultant playbook/);
    assert.match(home, /Blocked for SPRS/);
    assert.match(home, /Stamp: typed L1 in SPRS/);
    assert.match(home, /never submits, signs, or affirms/);
    assert.equal(/\/api\/sprs|\/api\/affirm|\/api\/submit/.test(home), false);
  });
});
