import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

const millHarbor = {
  assets: [
    { id: "cad-ws", name: "CAD workstation", category: "cui", justification: "", notes: "" },
    { id: "mailbox", name: "Enclave mailbox", category: "cui", justification: "", notes: "" },
    {
      id: "cnc-mill",
      name: "CNC mill",
      category: "specialized",
      specializedKind: "ot",
      justification: "OT CNC; cannot fully secure; isolated from CUI enclave.",
      notes: "",
    },
    {
      id: "office-pcs",
      name: "Office PCs",
      category: "crma",
      justification: "Policy forbids CUI on these workstations.",
      notes: "",
    },
    {
      id: "visitor-wifi",
      name: "Visitor Wi-Fi",
      category: "oos",
      justification: "Isolated guest VLAN; no CUI.",
      notes: "",
    },
  ],
  flows: [
    { id: "flow-cad-mail", fromAssetId: "cad-ws", toAssetId: "mailbox", channel: "email", inBoundary: true, notes: "" },
  ],
};

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
    const blockers = scopeBlockers(base(millHarbor));
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
    const withDiagram = scopeBlockers(base(millHarbor));
    assert.equal(
      withDiagram.some((b) => b.id === "missing-diagram"),
      false,
    );

    const missing = scopeBlockers(
      base({
        ...millHarbor,
        scope: {
          kind: "enclave",
          narrative: "enclave",
          isolationSummary: "isolated",
          cuiCategoriesGeneric: [],
          diagramEvidenceId: null,
        },
      }),
    );
    const diagram = missing.filter((b) => b.id === "missing-diagram");
    assert.equal(diagram.length, 1);
    assert.equal(diagram[0].severity, "warning");
  });
});
