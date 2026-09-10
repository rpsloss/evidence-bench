import type { Assessment } from "../types";

/** Fictional machine-shop seed. Layer 1: org / scope / assets / flows only. */
export function buildHarborPrecision(): Assessment {
  return {
    id: "asmt-harbor-precision-l2-self",
    standard: "NIST-SP-800-171-R2",
    catalogHash: "",
    organization: {
      id: "org-harbor-precision",
      name: "Harbor Precision (fictional)",
      fictional: true,
      cage: "XXXXX",
      employeeCount: 18,
      affirmingOfficial: {
        name: "Jordan Hale (fictional)",
        title: "Owner / Affirming Official (sample)",
        email: "jordan.hale@harbor-precision.example",
      },
    },
    scope: {
      kind: "enclave",
      narrative:
        "Fictional Harbor Precision CUI enclave covers CAD authoring and a dedicated mailbox. The shop-floor CNC mill is a Specialized Asset and is not on a CUI flow.",
      isolationSummary:
        "The mill sits on a shop-floor VLAN with no route to the CUI enclave. Visitor Wi-Fi is an isolated out-of-scope segment.",
      cuiCategoriesGeneric: ["engineering drawings (generic)", "specifications (generic)"],
      diagramEvidenceId: null,
    },
    assets: [
      {
        id: "cad-ws",
        name: "CAD workstation (fictional)",
        category: "cui",
        justification: "",
        notes: "Unclassified pointer only. Authoring station inside the enclave.",
      },
      {
        id: "mailbox",
        name: "Enclave mailbox (fictional)",
        category: "cui",
        justification: "",
        notes: "Dedicated mailbox for CUI-marked mail. Not a personal inbox.",
      },
      {
        id: "idp",
        name: "Enclave IdP (fictional)",
        category: "spa",
        justification: "",
        notes: "Identity provider protecting the enclave.",
      },
      {
        id: "firewall",
        name: "Enclave firewall (fictional)",
        category: "spa",
        justification: "",
        notes: "Perimeter for the CUI enclave.",
      },
      {
        id: "cnc-mill",
        name: "CNC mill (fictional Haas-class)",
        category: "specialized",
        specializedKind: "ot",
        justification:
          "OT CNC that can display a drawing but cannot run IT MFA; isolated from the CUI enclave; managed as a Specialized Asset (32 CFR 170.19).",
        notes: "Not an endpoint of any CUI flow.",
      },
      {
        id: "office-pcs",
        name: "Office PCs (accounting / HR)",
        category: "crma",
        justification:
          "Policy forbids CUI on these workstations. They are not physically or logically isolated from the enclave LAN, so they are CRMA rather than out of scope.",
        notes: "Contractor Risk Managed Assets.",
      },
      {
        id: "visitor-wifi",
        name: "Visitor Wi-Fi AP (fictional)",
        category: "oos",
        justification:
          "Logically isolated guest VLAN with no route to the CUI enclave; does not process, store, or transmit CUI.",
        notes: "Out of scope; isolation evidence lives with the OSA.",
      },
    ],
    flows: [
      {
        id: "flow-cad-mail",
        fromAssetId: "cad-ws",
        toAssetId: "mailbox",
        channel: "email",
        inBoundary: true,
        notes: "CAD operator sends drawings to the enclave mailbox.",
      },
      {
        id: "flow-mail-cad",
        fromAssetId: "mailbox",
        toAssetId: "cad-ws",
        channel: "email",
        inBoundary: true,
        notes: "Inbound CUI-marked mail to the CAD workstation.",
      },
    ],
    determinations: {},
    evidence: [],
    poams: [],
    operationalPoas: [],
    ssp: [],
    familyReviews: [],
    prepMarkedAt: null,
    schemaVersion: 1,
  };
}
