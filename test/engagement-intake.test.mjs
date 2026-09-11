import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/index.mjs";
import { validateAssessment } from "../server/assessment.mjs";
import { buildHarborPrecision } from "../src/data/harbor-precision.mjs";
import {
  confirmIntake,
  coerceWorkingLevel,
  engagementNextAction,
  isWorkingLevel1,
  normalizeEngagement,
  requiredLevelFromInformation,
  uniqueCages,
} from "../src/lib/engagement.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const temps = [];
const servers = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-intake-"));
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
    const dir = temps.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("engagement intake", () => {
  it("maps FCI-only to Level 1 and CUI/both to Level 2; unknown stays undetermined", () => {
    assert.equal(requiredLevelFromInformation("unknown"), "undetermined");
    assert.equal(requiredLevelFromInformation("fci-only"), "level-1-self");
    assert.equal(requiredLevelFromInformation("cui"), "level-2-self");
    assert.equal(requiredLevelFromInformation("both"), "level-2-self");
    assert.equal(coerceWorkingLevel("level-1-self", "level-2-self"), "level-1-self");
    assert.equal(coerceWorkingLevel("level-2-self", "level-1-self"), "level-1-self");
    assert.equal(coerceWorkingLevel("undetermined", "level-2-self"), "level-2-self");
  });

  it("Harbor seed is CUI → Level 2 (Self) with intake already confirmed", () => {
    const seed = buildHarborPrecision();
    const engagement = normalizeEngagement(seed.engagement);
    assert.equal(engagement.informationType, "cui");
    assert.equal(engagement.requiredLevel, "level-2-self");
    assert.equal(engagement.workingLevel, "level-2-self");
    assert.equal(engagement.currentPhase, "l2-prep");
    assert.ok(engagement.intakeNotedAt);
    assert.equal(isWorkingLevel1(engagement), false);
    assert.deepEqual(uniqueCages(seed.organization, engagement), ["XXXXX"]);
    const next = engagementNextAction(engagement, { href: "/requirements?family=AC", title: "Review AC" });
    assert.equal(next.href, "/requirements?family=AC");
    assert.match(next.title, /Review AC/);
  });

  it("FCI-only cannot work Level 2; missing engagement defaults to intake", () => {
    const forced = normalizeEngagement({
      informationType: "fci-only",
      workingLevel: "level-2-self",
      intakeNotedAt: "2026-09-11T00:00:00.000Z",
    });
    assert.equal(forced.requiredLevel, "level-1-self");
    assert.equal(forced.workingLevel, "level-1-self");
    assert.equal(forced.currentPhase, "l1-prep");
    assert.equal(isWorkingLevel1(forced), true);
    const next = engagementNextAction(forced);
    assert.equal(next.href, "/requirements");
    assert.match(next.title, /Open Level 1/);
    assert.match(next.detail, /no POA&M/);

    const missing = normalizeEngagement(undefined);
    assert.equal(missing.informationType, "unknown");
    assert.equal(missing.currentPhase, "intake");
    assert.equal(missing.intakeNotedAt, null);
    assert.match(engagementNextAction(missing).title, /Finish intake/);
  });

  it("confirmIntake is a local stamp and unknown information clears it", () => {
    const confirmed = confirmIntake({ informationType: "cui" }, "2026-09-11T12:00:00.000Z");
    assert.equal(confirmed.intakeNotedAt, "2026-09-11T12:00:00.000Z");
    assert.equal(confirmed.currentPhase, "l2-prep");
    const cleared = normalizeEngagement({ ...confirmed, informationType: "unknown" });
    assert.equal(cleared.intakeNotedAt, null);
    assert.equal(cleared.currentPhase, "intake");
    const blocked = confirmIntake({ informationType: "unknown" });
    assert.equal(blocked.intakeNotedAt, null);
  });

  it("PUT persists engagement and coerces illegal Level 2 on FCI-only", async () => {
    const dir = tempDir();
    const server = await listen(createApp({ assessmentPath: path.join(dir, "assessment.json.enc") }));
    const seed = buildHarborPrecision();
    const put = await rpc(server, "PUT", "/api/assessment", { json: { assessment: seed } });
    assert.equal(put.status, 200);
    const got = await rpc(server, "GET", "/api/assessment");
    assert.equal(got.status, 200);
    assert.equal(got.body.assessment.engagement.informationType, "cui");
    assert.equal(got.body.assessment.engagement.workingLevel, "level-2-self");

    const fci = {
      ...seed,
      engagement: {
        informationType: "fci-only",
        workingLevel: "level-2-self",
        additionalCages: ["YYYYY", "yyyyy"],
        intakeNotedAt: "2026-09-11T00:00:00.000Z",
      },
    };
    const put2 = await rpc(server, "PUT", "/api/assessment", { json: { assessment: fci } });
    assert.equal(put2.status, 200);
    const got2 = await rpc(server, "GET", "/api/assessment");
    assert.equal(got2.status, 200);
    const saved = got2.body.assessment.engagement;
    assert.equal(saved.informationType, "fci-only");
    assert.equal(saved.requiredLevel, "level-1-self");
    assert.equal(saved.workingLevel, "level-1-self");
    assert.equal(saved.currentPhase, "l1-prep");
    assert.deepEqual(saved.additionalCages, ["YYYYY"]);

    const stripped = { ...seed };
    delete stripped.engagement;
    const put3 = validateAssessment({ assessment: stripped });
    assert.equal(put3.ok, true);
    assert.equal(put3.assessment.engagement.informationType, "unknown");
    assert.equal(put3.assessment.engagement.currentPhase, "intake");
  });

  it("Intake and Home do not submit or affirm; POA&M is disabled copy on Level 1", () => {
    const intake = fs.readFileSync(path.join(root, "src/pages/Intake.tsx"), "utf8");
    const home = fs.readFileSync(path.join(root, "src/pages/Home.tsx"), "utf8");
    const poam = fs.readFileSync(path.join(root, "src/pages/Poam.tsx"), "utf8");
    const note = fs.readFileSync(path.join(root, "src/components/WorkingLevelNote.tsx"), "utf8");
    const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
    assert.match(intake, /Engagement intake/);
    assert.match(intake, /does not submit, sign, or affirm/);
    assert.match(intake, /fci-only/);
    assert.equal(/\/api\/sprs|\/api\/affirm|\/api\/submit/.test(intake), false);
    assert.match(home, /engagementNextAction/);
    assert.match(home, /Finish intake|Intake/);
    assert.match(app, /\/intake/);
    assert.match(note, /POA&M is not permitted at Level 1/);
    assert.match(poam, /workingL1/);
    assert.equal(/\/api\/sprs|\/api\/affirm|\/api\/submit/.test(home), false);
  });
});
