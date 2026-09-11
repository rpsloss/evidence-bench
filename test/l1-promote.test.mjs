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
  canPromoteToL2,
  l1MappedReqIdSet,
  l2DeltaPunchList,
  promoteToL2,
} from "../src/lib/l1Promote.mjs";
import { l1ScoreFromAssessment, nextL1Action } from "../src/lib/l1Score.mjs";
import { scoreFromAssessment } from "../src/lib/score.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.json"), "utf8")).requirements;
const catalogMeta = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.meta.json"), "utf8"));

const temps = [];
const servers = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-promo-"));
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

function asL1Floor(seed) {
  return {
    ...seed,
    engagement: { ...seed.engagement, workingLevel: "level-1-self" },
  };
}

describe("L1→L2 promotion", () => {
  it("maps 17 Level 1 171 IDs and leaves 93 as the L2 delta", () => {
    const mapped = l1MappedReqIdSet();
    assert.equal(mapped.size, 17);
    assert.equal(catalog.length - mapped.size, 93);
    assert.equal(mapped.has("3.1.1"), true);
    assert.equal(mapped.has("3.10.4"), true);
    assert.equal(mapped.has("3.2.3"), false);
    assert.equal(mapped.has("3.12.4"), false);
  });

  it("L1-first Harbor is Final Level 1 with unanswered L2 delta", () => {
    const seed = buildHarborL1First();
    assert.equal(seed.id, "asmt-harbor-precision-l1-first");
    assert.equal(seed.engagement.workingLevel, "level-1-self");
    assert.equal(l1ScoreFromAssessment(seed).status, "final-l1-self");
    const l2 = scoreFromAssessment(seed, catalog, catalogMeta.catalogSha256);
    assert.equal(l2.status, "assessment-incomplete");
    const mapped = l1MappedReqIdSet();
    const unansweredReqs = catalog.filter((row) => seed.determinations[row.reqId]?.finding === "not-reviewed");
    assert.equal(unansweredReqs.length, 93);
    assert.equal(unansweredReqs.every((row) => !mapped.has(row.reqId)), true);
    assert.equal(seed.poams.length, 0);
    assert.equal(seed.ssp.length, 0);
    assert.match(nextL1Action(seed).title, /Promote to Level 2/);
    assert.equal(canPromoteToL2(seed).ok, true);
  });

  it("promote credits the 17, opens L2, and does not invent L2 MET on the delta", () => {
    const seed = buildHarborL1First();
    const promoted = promoteToL2(seed, "2026-09-11T15:00:00.000Z");
    assert.equal(promoted.ok, true);
    const next = promoted.assessment;
    const engagement = normalizeEngagement(next.engagement);
    assert.equal(engagement.workingLevel, "level-2-self");
    assert.equal(engagement.promotedFromL1At, "2026-09-11T15:00:00.000Z");
    assert.equal(engagement.l1CreditedReqIds.length, 17);
    assert.ok(next.ssp.length > 0);
    const delta = l2DeltaPunchList(next);
    assert.equal(delta.isDelta, true);
    assert.equal(delta.counts.creditedFromL1, 17);
    assert.equal(delta.counts.l2DeltaReqs, 93);
    assert.ok(delta.counts.unansweredAos > 0);
    assert.equal(
      delta.unansweredAos.some((row) => row.reqId === "3.1.1"),
      false,
    );
    assert.equal(
      delta.unansweredAos.some((row) => row.reqId === "3.12.4"),
      true,
    );
    const l2 = scoreFromAssessment(next, catalog, catalogMeta.catalogSha256);
    assert.equal(l2.status, "assessment-incomplete");
  });

  it("does not wipe a full Harbor L2 pack when promoting from a Level 1 floor check", () => {
    const seed = asL1Floor(buildHarborPrecision());
    assert.equal(canPromoteToL2(seed).ok, true);
    const promoted = promoteToL2(seed, "2026-09-11T15:00:00.000Z");
    assert.equal(promoted.ok, true);
    assert.equal(promoted.assessment.determinations["3.2.3"].finding, "not-met");
    assert.equal(promoted.assessment.poams.length, 2);
    assert.ok(promoted.assessment.ssp.length > 0);
    const delta = l2DeltaPunchList(promoted.assessment);
    assert.equal(delta.counts.unansweredAos, 0);
    assert.equal(delta.counts.creditedFromL1, 17);
  });

  it("refuses FCI-only, missing intake, and unanswered Level 1", () => {
    const fci = buildHarborL1First();
    fci.engagement = { ...fci.engagement, informationType: "fci-only", workingLevel: "level-1-self" };
    assert.equal(canPromoteToL2(fci).error, "not-l2-required");

    const noIntake = buildHarborL1First();
    noIntake.engagement = { ...noIntake.engagement, intakeNotedAt: null };
    assert.equal(canPromoteToL2(noIntake).error, "intake");

    const l2 = buildHarborPrecision();
    assert.equal(canPromoteToL2(l2).error, "not-working-l1");

    const incomplete = buildHarborL1First();
    incomplete.determinations["3.1.1"] = {
      ...incomplete.determinations["3.1.1"],
      finding: "not-reviewed",
      objectives: incomplete.determinations["3.1.1"].objectives.map((ao) => ({ ...ao, finding: "not-reviewed" })),
    };
    assert.equal(canPromoteToL2(incomplete).error, "l1-incomplete");
    assert.equal(promoteToL2(incomplete).ok, false);
  });

  it("PUT persists promotion stamps", async () => {
    const dir = tempDir();
    const server = await listen(createApp({ assessmentPath: path.join(dir, "assessment.json.enc") }));
    const promoted = promoteToL2(buildHarborL1First(), "2026-09-11T15:00:00.000Z");
    const put = await rpc(server, "PUT", "/api/assessment", { json: { assessment: promoted.assessment } });
    assert.equal(put.status, 200);
    const got = await rpc(server, "GET", "/api/assessment");
    assert.equal(got.status, 200);
    assert.equal(got.body.assessment.engagement.workingLevel, "level-2-self");
    assert.equal(got.body.assessment.engagement.promotedFromL1At, "2026-09-11T15:00:00.000Z");
    assert.equal(got.body.assessment.engagement.l1CreditedReqIds.length, 17);
  });

  it("Home and Intake expose promote without SPRS submit", () => {
    const home = fs.readFileSync(path.join(root, "src/pages/Home.tsx"), "utf8");
    const intake = fs.readFileSync(path.join(root, "src/pages/Intake.tsx"), "utf8");
    const reqs = fs.readFileSync(path.join(root, "src/pages/Requirements.tsx"), "utf8");
    assert.match(home, /Promote to Level 2/);
    assert.match(home, /Load L1-first Harbor/);
    assert.match(home, /L2 delta punch list/);
    assert.match(intake, /Promote to Level 2/);
    assert.match(reqs, /L1 credited/);
    assert.equal(/\/api\/sprs|\/api\/affirm|\/api\/submit/.test(home + intake), false);
  });
});
