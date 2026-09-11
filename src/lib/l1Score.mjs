/** Level 1 (Self) pass/fail. 15 FAR rows, 17 mapped 171 IDs. No POA&M. Not a SPRS score. */

import l1CatalogFile from "../data/l1-catalog.json" with { type: "json" };
import { storedFinding } from "./rollup.mjs";

export const L1_FAMILIES = Object.freeze([
  { id: "AC", name: "Access Control" },
  { id: "IA", name: "Identification and Authentication" },
  { id: "MP", name: "Media Protection" },
  { id: "PE", name: "Physical Protection" },
  { id: "SC", name: "System and Communications Protection" },
  { id: "SI", name: "System and Information Integrity" },
]);

export const L1_FAMILY_IDS = Object.freeze(L1_FAMILIES.map((row) => row.id));

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  return value == null ? "" : String(value);
}

export function l1CatalogRequirements(catalog = l1CatalogFile.requirements) {
  return asList(catalog).filter((row) => row && str(row.cmmcId) && str(row.reqId));
}

export function l1Groups(catalog = l1CatalogFile.requirements) {
  const map = new Map();
  const order = [];
  for (const req of l1CatalogRequirements(catalog)) {
    const id = str(req.cmmcId);
    if (!map.has(id)) {
      map.set(id, []);
      order.push(id);
    }
    map.get(id).push(req);
  }
  return order.map((cmmcId) => {
    const reqs = map.get(cmmcId);
    const first = reqs[0];
    return {
      cmmcId,
      family: str(first.family),
      farParagraph: str(first.farParagraph),
      title: reqs.length === 1 ? str(first.title) : `${str(first.title)} (+${reqs.length - 1} phrases)`,
      reqs,
    };
  });
}

export function l1GroupFinding(group, assessment) {
  const dets =
    assessment?.determinations && typeof assessment.determinations === "object" ? assessment.determinations : {};
  const evidence = asList(assessment?.evidence);
  const operationalPoas = asList(assessment?.operationalPoas);
  const findings = asList(group?.reqs).map((req) => storedFinding(req, dets[req.reqId], evidence, operationalPoas));
  if (findings.length === 0) return "not-reviewed";
  if (findings.some((f) => f === "not-reviewed")) return "not-reviewed";
  if (findings.some((f) => f === "not-met")) return "not-met";
  if (findings.every((f) => f === "na")) return "na";
  if (findings.every((f) => f === "met" || f === "na")) return "met";
  return "not-reviewed";
}

export function l1ScoreFromAssessment(assessment, catalog = l1CatalogFile.requirements) {
  const groups = l1Groups(catalog);
  let met = 0;
  let notMet = 0;
  let unanswered = 0;
  let na = 0;
  const rows = groups.map((group) => {
    const finding = l1GroupFinding(group, assessment);
    if (finding === "met") met += 1;
    else if (finding === "not-met") notMet += 1;
    else if (finding === "na") na += 1;
    else unanswered += 1;
    return { ...group, finding };
  });
  const total = groups.length;
  let status = "assessment-incomplete";
  let complianceResult = null;
  if (unanswered === 0 && notMet === 0) {
    status = "final-l1-self";
    complianceResult = "MET";
  } else if (unanswered === 0) {
    status = "not-met";
    complianceResult = "NOT MET";
  }
  return {
    status,
    complianceResult,
    met,
    notMet,
    unanswered,
    na,
    total,
    rows,
    poamPermitted: false,
    computedAt: new Date().toISOString(),
  };
}

export function l1FamilyProgress(assessment, catalog = l1CatalogFile.requirements) {
  const groups = l1Groups(catalog);
  return L1_FAMILIES.map((meta) => {
    const familyGroups = groups.filter((row) => row.family === meta.id);
    const findings = familyGroups.map((row) => l1GroupFinding(row, assessment));
    const unanswered = findings.filter((f) => f === "not-reviewed").length;
    const notMet = findings.filter((f) => f === "not-met").length;
    const met = findings.filter((f) => f === "met" || f === "na").length;
    let completion = "present";
    if (familyGroups.length === 0 || unanswered === familyGroups.length) completion = "unfinished";
    else if (unanswered > 0) completion = "partial";
    else if (notMet > 0) completion = "gapped";
    return {
      family: meta.id,
      name: meta.name,
      groupCount: familyGroups.length,
      unanswered,
      notMet,
      met,
      completion,
    };
  });
}

export function nextL1Action(assessment, catalog = l1CatalogFile.requirements) {
  const families = l1FamilyProgress(assessment, catalog);
  const unfinished = families.find((row) => row.completion === "unfinished");
  if (unfinished) {
    return {
      href: `/requirements?family=${unfinished.family}`,
      title: `Start ${unfinished.family}`,
      detail: `${unfinished.name} has no answered Level 1 objectives.`,
    };
  }
  const partial = families.find((row) => row.completion === "partial");
  if (partial) {
    return {
      href: `/requirements?family=${partial.family}`,
      title: `Resume ${partial.family}`,
      detail: `${partial.unanswered} Level 1 requirement(s) in ${partial.name} still unanswered.`,
    };
  }
  const gapped = families.find((row) => row.completion === "gapped");
  if (gapped) {
    return {
      href: `/requirements?family=${gapped.family}`,
      title: `Close Level 1 gaps in ${gapped.family}`,
      detail: `${gapped.notMet} NOT MET Level 1 requirement(s) in ${gapped.name}. POA&M is not permitted (32 CFR 170.21(a)(1)).`,
    };
  }
  return {
    href: "/export",
    title: "Level 1 SPRS pack next",
    detail:
      "All 15 FAR 52.204-21 requirements are answered. The Level 1 typing sheet (compliance result, CAGE, status date) is the next slice.",
  };
}
