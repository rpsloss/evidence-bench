import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { insertPoamItem, validateAssessment } from "../server/assessment.mjs";
import { createApp } from "../server/index.mjs";
import { buildHarborPrecision } from "../src/data/harbor-precision.mjs";
import { citationForIllegal } from "../src/lib/poamGuard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "src/data/catalog.json"), "utf8")).requirements;

function req(id) {
  return catalog.find((row) => row.reqId === id);
}

function aoFinding(ao, finding) {
  return {
    aoId: ao.aoId,
    finding,
    rationale: "sample",
    evidenceIds: [],
    assessedAt: "2026-01-15T00:00:00Z",
    assessedBy: "sample",
  };
}

function determinationFor(row, finding) {
  const det = {
    reqId: row.reqId,
    objectives: row.objectives.map((ao) => aoFinding(ao, finding)),
    naJustification: "",
    implementationStub: "sample",
    owner: "sample",
    enduringException: false,
    sspCitation: "",
    temporaryDeficiency: false,
  };
  if (row.partialCredit?.kind === "fips") {
    det.fipsOverlay = { enc: finding, fips: finding };
  }
  return det;
}

function poamDraft(reqId) {
  return {
    id: `poam-${reqId}`,
    reqId,
    weakness: "sample gap",
    tasks: "sample task",
    owner: "sample",
    due: "2026-12-31",
    status: "open",
  };
}

function assessmentWith(reqId, finding, extraDet = {}) {
  const row = req(reqId);
  const seed = buildHarborPrecision();
  return {
    ...seed,
    determinations: {
      ...seed.determinations,
      [reqId]: { ...determinationFor(row, finding), ...extraDet },
    },
    poams: seed.poams.filter((item) => item.reqId !== reqId),
  };
}

const temps = [];
const servers = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eb-poam-"));
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

function rpc(server, method, urlPath, body) {
  const { port } = server.address();
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          "content-type": "application/json",
          ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = raw;
          }
          resolve({ status: res.statusCode, body: json });
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

describe("POA&M register", () => {
  it("Harbor seed records 3.2.3 and 3.4.9 as 1-pt Conditional-legal rows", () => {
    const seed = buildHarborPrecision();
    assert.equal(seed.organization.cage, "XXXXX");
    assert.equal(seed.organization.fictional, true);
    assert.deepEqual(
      seed.poams.map((row) => row.reqId).sort(),
      ["3.2.3", "3.4.9"],
    );
    for (const row of seed.poams) {
      assert.equal(row.conditionalLegal, true);
      assert.equal(row.illegalCode, undefined);
      assert.equal(req(row.reqId).weight, 1);
      assert.equal(seed.determinations[row.reqId].objectives.every((ao) => ao.finding === "not-met"), true);
    }
    const checked = validateAssessment({ assessment: seed });
    assert.equal(checked.ok, true);
    assert.equal(checked.assessment.poams.every((row) => row.conditionalLegal === true), true);
  });

  it("T6: POST 3.1.20 NOT MET inserts 200, banned-requirement, not 400", async () => {
    const dir = tempDir();
    const server = await listen(createApp({ assessmentPath: path.join(dir, "assessment.json.enc") }));
    const assessment = assessmentWith("3.1.20", "not-met");
    const put = await rpc(server, "PUT", "/api/assessment", { assessment });
    assert.equal(put.status, 200);
    const res = await rpc(server, "POST", "/api/poam", poamDraft("3.1.20"));
    assert.equal(res.status, 200);
    assert.notEqual(res.status, 400);
    assert.equal(res.body.item.conditionalLegal, false);
    assert.equal(res.body.conditionalLegal, false);
    assert.equal(res.body.item.illegalCode, "banned-requirement");
    assert.equal(res.body.illegalCode, "banned-requirement");
    assert.equal(res.body.citation, citationForIllegal("banned-requirement", "3.1.20"));
    assert.match(res.body.citation, /170\.21\(a\)\(2\)\(iii\)\(A\)/);
  });

  it("T8: POST 3.13.11 none (enc=not-met) inserts 200, fips-exception-not-met", async () => {
    const dir = tempDir();
    const server = await listen(createApp({ assessmentPath: path.join(dir, "assessment.json.enc") }));
    const assessment = assessmentWith("3.13.11", "not-met", { fipsOverlay: { enc: "not-met", fips: "not-met" } });
    const put = await rpc(server, "PUT", "/api/assessment", { assessment });
    assert.equal(put.status, 200);
    const res = await rpc(server, "POST", "/api/poam", poamDraft("3.13.11"));
    assert.equal(res.status, 200);
    assert.equal(res.body.item.conditionalLegal, false);
    assert.equal(res.body.item.illegalCode, "fips-exception-not-met");
    assert.equal(res.body.citation, "32 CFR 170.21(a)(2)(ii)");
  });

  it("T23: PUT 5-point NOT MET PoamItem is 200, weight-gt-1, does not bypass POST guard", async () => {
    const dir = tempDir();
    const server = await listen(createApp({ assessmentPath: path.join(dir, "assessment.json.enc") }));
    const assessment = {
      ...assessmentWith("3.1.1", "not-met"),
      poams: [
        {
          ...poamDraft("3.1.1"),
          conditionalLegal: true,
        },
      ],
    };
    const put = await rpc(server, "PUT", "/api/assessment", { assessment });
    assert.equal(put.status, 200);
    assert.notEqual(put.status, 400);
    const row = put.body.poams.find((item) => item.reqId === "3.1.1");
    assert.ok(row);
    assert.equal(row.conditionalLegal, false);
    assert.equal(row.illegalCode, "weight-gt-1");

    const postDir = tempDir();
    const postServer = await listen(createApp({ assessmentPath: path.join(postDir, "assessment.json.enc") }));
    const base = assessmentWith("3.1.1", "not-met");
    const seeded = await rpc(postServer, "PUT", "/api/assessment", { assessment: base });
    assert.equal(seeded.status, 200);
    const posted = await rpc(postServer, "POST", "/api/poam", poamDraft("3.1.1"));
    assert.equal(posted.status, 200);
    assert.notEqual(posted.status, 400);
    assert.equal(posted.body.item.conditionalLegal, false);
    assert.equal(posted.body.item.illegalCode, "weight-gt-1");
    assert.equal(posted.body.citation, "32 CFR 170.21(a)(2)(ii)");
  });

  it("5-point insert via extracted guard is 200 not 400", () => {
    const assessment = assessmentWith("3.5.1", "not-met");
    const inserted = insertPoamItem(assessment, poamDraft("3.5.1"));
    assert.equal(inserted.ok, true);
    assert.equal(inserted.status, 200);
    assert.notEqual(inserted.status, 400);
    assert.equal(inserted.item.conditionalLegal, false);
    assert.equal(inserted.item.illegalCode, "weight-gt-1");
    assert.equal(inserted.citation, "32 CFR 170.21(a)(2)(ii)");
  });

  it("400 only for requirement-is-met and duplicate-req", async () => {
    const dir = tempDir();
    const server = await listen(createApp({ assessmentPath: path.join(dir, "assessment.json.enc") }));
    const na = assessmentWith("3.13.5", "na");
    na.determinations["3.13.5"].naJustification = "No publicly accessible systems (sample).";
    const putNa = await rpc(server, "PUT", "/api/assessment", { assessment: na });
    assert.equal(putNa.status, 200);
    const naInsert = await rpc(server, "POST", "/api/poam", poamDraft("3.13.5"));
    assert.equal(naInsert.status, 400);
    assert.equal(naInsert.body.error, "requirement-is-met");

    const dup = await rpc(server, "POST", "/api/poam", poamDraft("3.2.3"));
    assert.equal(dup.status, 400);
    assert.equal(dup.body.error, "duplicate-req");

    const bypass = validateAssessment({
      assessment: {
        ...na,
        poams: [...na.poams, poamDraft("3.13.5")],
      },
    });
    assert.equal(bypass.ok, false);
    assert.equal(bypass.status, 400);
    assert.equal(bypass.error, "requirement-is-met");
  });
});
