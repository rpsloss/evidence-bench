/** L1→L2 promotion. Credits the 17 mapped 171 IDs. Does not wipe existing L2 work. */

import catalogFile from "../data/catalog.json" with { type: "json" };
import { normalizeEngagement } from "./engagement.mjs";
import { assemblerPunchList, punchListHomeItems } from "./familyProgress.mjs";
import { l1CatalogRequirements, l1ScoreFromAssessment } from "./l1Score.mjs";
import { storedFinding } from "./rollup.mjs";
import { generateSspOutline } from "./sspGenerate.mjs";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  return value == null ? "" : String(value);
}

export function l1MappedReqIds(catalog = l1CatalogRequirements()) {
  return [...new Set(asList(catalog).map((row) => str(row.reqId)).filter(Boolean))];
}

export function l1MappedReqIdSet(catalog = l1CatalogRequirements()) {
  return new Set(l1MappedReqIds(catalog));
}

export function l1MappedAoIdSet(catalog = l1CatalogRequirements()) {
  const set = new Set();
  for (const req of asList(catalog)) {
    for (const ao of asList(req.objectives)) {
      if (ao?.aoId) set.add(str(ao.aoId));
    }
  }
  return set;
}

export function unansweredDet(req) {
  const det = {
    reqId: str(req.reqId),
    objectives: asList(req.objectives).map((ao) => ({
      aoId: str(ao.aoId),
      finding: "not-reviewed",
      rationale: "",
      evidenceIds: [],
      assessedAt: null,
      assessedBy: null,
    })),
    finding: "not-reviewed",
    naJustification: "",
    implementationStub: "",
    owner: "",
    enduringException: false,
    sspCitation: "",
    temporaryDeficiency: false,
  };
  if (req?.partialCredit?.kind === "fips") {
    det.fipsOverlay = { enc: "not-reviewed", fips: "not-reviewed" };
  }
  return det;
}

export function canPromoteToL2(assessment) {
  const engagement = normalizeEngagement(assessment?.engagement);
  if (engagement.requiredLevel !== "level-2-self") return { ok: false, error: "not-l2-required" };
  if (!str(engagement.intakeNotedAt).trim()) return { ok: false, error: "intake" };
  if (engagement.workingLevel !== "level-1-self") return { ok: false, error: "not-working-l1" };
  const score = l1ScoreFromAssessment(assessment);
  if (score.unanswered > 0) return { ok: false, error: "l1-incomplete" };
  return { ok: true, error: null };
}

export function promoteToL2(assessment, at = new Date().toISOString()) {
  const gate = canPromoteToL2(assessment);
  if (!gate.ok) return gate;
  const mapped = l1MappedReqIdSet();
  const dets =
    assessment?.determinations && typeof assessment.determinations === "object" ? assessment.determinations : {};
  const evidence = asList(assessment?.evidence);
  const operationalPoas = asList(assessment?.operationalPoas);
  const credited = [];
  for (const req of asList(catalogFile.requirements)) {
    const id = str(req.reqId);
    if (!mapped.has(id)) continue;
    const finding = storedFinding(req, dets[id], evidence, operationalPoas);
    if (finding === "met" || finding === "na") credited.push(id);
  }
  const ssp = asList(assessment?.ssp);
  const next = {
    ...assessment,
    engagement: normalizeEngagement({
      ...assessment?.engagement,
      workingLevel: "level-2-self",
      promotedFromL1At: at,
      l1CreditedReqIds: credited,
    }),
    ssp: ssp.length ? ssp : generateSspOutline(assessment),
  };
  return { ok: true, error: null, assessment: next };
}

export function l2DeltaPunchList(assessment, catalog = catalogFile.requirements, now = Date.now()) {
  const mapped = l1MappedReqIdSet();
  const punch = assemblerPunchList(assessment, catalog, now);
  const unansweredAos = punch.unansweredAos.filter((row) => !mapped.has(row.reqId));
  const missingPointers = punch.missingPointers.filter((row) => !mapped.has(row.reqId));
  const missingPoams = punch.missingPoams.filter((row) => !mapped.has(row.reqId));
  const creditedFromL1 = asList(normalizeEngagement(assessment?.engagement).l1CreditedReqIds).filter((id) =>
    mapped.has(id),
  );
  const work = unansweredAos.length + missingPointers.length + missingPoams.length;
  return {
    ...punch,
    unansweredAos,
    missingPointers,
    missingPoams,
    creditedFromL1,
    isDelta: true,
    counts: {
      ...punch.counts,
      unansweredAos: unansweredAos.length,
      missingPointers: missingPointers.length,
      missingPoams: missingPoams.length,
      work,
      creditedFromL1: creditedFromL1.length,
      l2DeltaReqs: asList(catalog).filter((row) => row?.reqId && !mapped.has(str(row.reqId))).length,
    },
  };
}

export function l2DeltaHomeItems(assessment, catalog = catalogFile.requirements, now = Date.now()) {
  return punchListHomeItems(l2DeltaPunchList(assessment, catalog, now));
}

export function promoteErrorMessage(error) {
  if (error === "not-l2-required") return "Promotion needs CUI (or both) on intake. FCI-only stays Level 1.";
  if (error === "intake") return "Confirm intake before promoting.";
  if (error === "not-working-l1") return "Promotion starts from a Level 1 floor check.";
  if (error === "l1-incomplete") return "Answer every Level 1 mapped objective before promoting.";
  return "Cannot promote.";
}
