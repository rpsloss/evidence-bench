import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHarborPrecision } from "../src/data/harbor-precision.mjs";
import { scopeBlockers } from "../src/lib/scope.mjs";

function base(overrides = {}) {
  return {
    organization: {
      id: "org",
      name: "Harbor Precision (fictional)",
      fictional: true,
      cage: "XXXXX",
      employeeCount: 18,
      affirmingOfficial: { name: "Jordan Hale (fictional)", title: "Owner", email: "j@harbor-precision.example" },
    },
    scope: {
      kind: "enclave",
      narrative: "enclave",
      isolationSummary: "isolated",
      cuiCategoriesGeneric: ["engineering drawings (generic)"],
      diagramEvidenceId: "diagram-1",
      ...overrides.scope,
    },
    assets: overrides.assets,
    flows: overrides.flows,
  };
}

describe("scope graph blockers", () => {
  it("flags an OOS asset on an in-boundary CUI flow as a blocker", () => {
    const assessment = base({
      assets: [
        { id: "cad", name: "CAD", category: "cui", justification: "", notes: "" },
        { id: "guest", name: "Guest PC", category: "oos", justification: "isolated", notes: "" },
      ],
      flows: [{ id: "f1", fromAssetId: "cad", toAssetId: "guest", channel: "file", inBoundary: true, notes: "" }],
    });
    const blockers = scopeBlockers(assessment);
    const hit = blockers.filter((b) => b.severity === "blocker" && b.id.startsWith("oos-in-flow"));
    assert.equal(hit.length, 1);
    assert.equal(hit[0].href, "/assets");
    assert.match(hit[0].detail, /Guest PC/);
  });

  it("flags specialized, crma, and oos assets without justification as blockers", () => {
    const assessment = base({
      assets: [
        { id: "mill", name: "Mill", category: "specialized", specializedKind: "ot", justification: "  ", notes: "" },
        { id: "pcs", name: "Office PCs", category: "crma", justification: "", notes: "" },
        { id: "wifi", name: "Guest Wi-Fi", category: "oos", justification: "", notes: "" },
        { id: "cad", name: "CAD", category: "cui", justification: "", notes: "" },
      ],
      flows: [],
    });
    const missing = scopeBlockers(assessment).filter((b) => b.id.startsWith("missing-justification"));
    const ids = missing.map((b) => b.id).sort();
    assert.deepEqual(ids, [
      "missing-justification:mill",
      "missing-justification:pcs",
      "missing-justification:wifi",
    ]);
    assert.equal(missing.every((b) => b.severity === "blocker"), true);
  });

  it("does not emit an OOS-in-flow blocker when the Harbor mill is specialized and off the CUI path", () => {
    const seed = buildHarborPrecision();
    const mill = seed.assets.find((a) => a.id === "cnc-mill");
    assert.equal(mill?.category, "specialized");
    assert.equal(
      seed.flows.some(
        (f) => f.inBoundary === true && (f.fromAssetId === "cnc-mill" || f.toAssetId === "cnc-mill"),
      ),
      false,
    );
    const blockers = scopeBlockers(seed);
    assert.equal(
      blockers.some((b) => b.id.startsWith("oos-in-flow")),
      false,
    );
    assert.equal(
      blockers.some((b) => b.severity === "blocker"),
      false,
    );
  });

  it("treats a missing diagram pointer as a warning, not a blocker", () => {
    const seed = buildHarborPrecision();
    assert.equal(seed.scope.diagramEvidenceId, null);
    const missing = scopeBlockers(seed).filter((b) => b.id === "missing-diagram");
    assert.equal(missing.length, 1);
    assert.equal(missing[0].severity, "warning");

    const withDiagram = scopeBlockers({
      ...seed,
      scope: { ...seed.scope, diagramEvidenceId: "diagram-1" },
    });
    assert.equal(
      withDiagram.some((b) => b.id === "missing-diagram"),
      false,
    );
  });
});
