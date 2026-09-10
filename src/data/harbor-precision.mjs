/** Fictional Harbor Precision org/scope/assets/flows, evidence, POA&M, and SSP outline. */

import catalogFile from "./catalog.json" with { type: "json" };
import catalogMeta from "./catalog.meta.json" with { type: "json" };
import { generateSspOutline } from "../lib/sspGenerate.mjs";

const NOT_MET_SEED = new Set(["3.2.3", "3.4.9"]);
const EVIDENCE_CAPTURED = "2026-08-01T00:00:00Z";
const EVIDENCE_OWNER = "Jordan Hale (fictional)";

function aoFinding(ao, finding) {
  const gap =
    finding === "not-met"
      ? "Harbor seed gap (sample). 1-point NOT MET stub."
      : "Harbor MET stub (sample). Unclassified URI pointer in the evidence registry.";
  return {
    aoId: ao.aoId,
    finding,
    rationale: gap,
    evidenceIds: [],
    assessedAt: null,
    assessedBy: null,
  };
}

/** Browser-safe 64-hex filler. Pointer metadata only — not a hash of CUI bytes. */
function sampleSha256(label) {
  let h = 2166136261;
  const s = `unclass-sample:${label}`;
  let out = "";
  for (let i = 0; i < 64; i += 1) {
    h ^= s.charCodeAt(i % s.length);
    h = Math.imul(h, 16777619) >>> 0;
    out += (h & 0xf).toString(16);
  }
  return out;
}

function harborEvidence() {
  const items = [];
  for (const req of catalogFile.requirements) {
    if (!req?.reqId || NOT_MET_SEED.has(req.reqId)) continue;
    const aoIds = (req.objectives || []).map((ao) => ao.aoId).filter(Boolean);
    const uri = `file:///unclass/sample/harbor/${String(req.family).toLowerCase()}-${req.reqId}-policy.pdf`;
    items.push({
      id: `ev-met-${req.reqId}`,
      title: `${req.cmmcId} policy (sample unclassified pointer)`,
      kind: "policy",
      uri,
      sha256: sampleSha256(uri),
      capturedAt: EVIDENCE_CAPTURED,
      aoIds,
      owner: EVIDENCE_OWNER,
      draft: false,
      notes: "Harbor MET pointer. SAMPLE. Not CUI. Bytes are not stored in this app.",
    });
  }
  items.push({
    id: "ev-stale-screenshot",
    title: "Stale IdP login screenshot (sample unclassified pointer)",
    kind: "screenshot",
    uri: "file:///unclass/sample/harbor/idp-login-stale-screenshot.png",
    sha256: sampleSha256("stale-screenshot"),
    capturedAt: "2025-01-15T00:00:00Z",
    expiresAt: "2025-04-15T00:00:00Z",
    aoIds: ["3.5.3[b]"],
    owner: EVIDENCE_OWNER,
    draft: false,
    notes: "Stale on purpose for the gap board. SAMPLE. Not CUI.",
  });
  items.push({
    id: "ev-unmapped-policy",
    title: "Unmapped acceptable-use policy (sample unclassified pointer)",
    kind: "policy",
    uri: "file:///unclass/sample/harbor/acceptable-use-unmapped.pdf",
    capturedAt: EVIDENCE_CAPTURED,
    aoIds: [],
    owner: EVIDENCE_OWNER,
    draft: false,
    notes: "Unmapped on purpose — empty aoIds never credit MET. SAMPLE. Not CUI.",
  });
  return items;
}

function stubDetermination(req) {
  const finding = NOT_MET_SEED.has(req.reqId) ? "not-met" : "met";
  const det = {
    reqId: req.reqId,
    objectives: req.objectives.map((ao) => aoFinding(ao, finding)),
    finding,
    naJustification: "",
    implementationStub: "Harbor Precision (fictional) stub. SAMPLE only. Not CUI.",
    owner: "Jordan Hale (fictional)",
    enduringException: false,
    sspCitation: "",
    temporaryDeficiency: false,
  };
  if (req.partialCredit?.kind === "fips") {
    det.fipsOverlay = { enc: finding, fips: finding };
  }
  return det;
}

function harborDeterminations() {
  const determinations = {};
  for (const req of catalogFile.requirements) {
    if (!req?.reqId) continue;
    determinations[req.reqId] = stubDetermination(req);
  }
  return determinations;
}

function harborPoam(reqId, weakness, tasks) {
  return {
    id: `poam-${reqId}`,
    reqId,
    weakness,
    tasks,
    owner: "Jordan Hale (fictional)",
    due: "2026-06-30",
    status: "open",
    conditionalLegal: true,
  };
}

export function buildHarborPrecision() {
  const assessment = {
    id: "asmt-harbor-precision-l2-self",
    standard: "NIST-SP-800-171-R2",
    catalogHash: catalogMeta.catalogSha256,
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
    determinations: harborDeterminations(),
    evidence: harborEvidence(),
    poams: [
      harborPoam(
        "3.2.3",
        "Insider-threat awareness training is not yet delivered in this fictional enclave.",
        "Deliver a sample insider-threat awareness module to managers and employees.",
      ),
      harborPoam(
        "3.4.9",
        "User-installed software is not yet controlled and monitored in this fictional enclave.",
        "Publish a sample user-software policy and monitor installs on CUI assets.",
      ),
    ],
    operationalPoas: [],
    ssp: [],
    familyReviews: [],
    prepMarkedAt: null,
    schemaVersion: 1,
  };
  // 3.12.4 body must be present so clearing it can demonstrate assessment-incomplete.
  assessment.ssp = generateSspOutline(assessment);
  return assessment;
}
