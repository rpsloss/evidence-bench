/** Assembler family board: unfinished | partial | gapped | present. Not a SPRS finding. */

import catalogFile from "../data/catalog.json" with { type: "json" };
import { FAMILIES, isFamilyReviewed, reviewForFamily } from "./familyReview.mjs";
import { evidenceGapBoard, rollupRequirement } from "./rollup.mjs";

export const COMPLETIONS = Object.freeze(["unfinished", "partial", "gapped", "present"]);

const SAMPLE_WATERMARK = "UNCLASSIFIED // SAMPLE // NOT A SPRS SUBMISSION";
const CHECKLIST_PREFIX = "Not legal advice. Not a SPRS submission.";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  return value == null ? "" : String(value);
}

export function completionLabel(value) {
  if (value === "present") return "Present";
  if (value === "partial") return "Partial";
  if (value === "gapped") return "Gapped";
  return "Unfinished";
}

export function familyWorkCaption(row) {
  if (!row) return "not started";
  if (row.completion === "unfinished") return "not started";
  if (row.completion === "partial") return `${row.unansweredAos} unanswered`;
  if (row.completion === "gapped") {
    if (row.evidenceGaps) return `${row.evidenceGaps} missing pointers`;
    return `${row.poamGaps} missing POA&M`;
  }
  return row.reviewed ? "reviewed" : "awaiting review";
}

function poamCovered(assessment) {
  return new Set(asList(assessment?.poams).map((row) => str(row?.reqId)).filter(Boolean));
}

function emptyBucket(meta) {
  return {
    family: meta.id,
    name: meta.name,
    reqCount: 0,
    aoCount: 0,
    unansweredAos: 0,
    met: 0,
    notMet: 0,
    na: 0,
    notReviewedReqs: 0,
    evidenceGaps: 0,
    poamGaps: 0,
    reviewed: false,
  };
}

/**
 * One row per SPRS family. Completion is assembler work status, not a SPRS score.
 * unfinished = no answered AOs; partial = mix; gapped = answered but MET/POA&M holes; present = closed.
 */
export function familyProgressRows(assessment, catalog = catalogFile.requirements) {
  const evidence = asList(assessment?.evidence);
  const operationalPoas = asList(assessment?.operationalPoas);
  const dets =
    assessment?.determinations && typeof assessment.determinations === "object" ? assessment.determinations : {};
  const covered = poamCovered(assessment);
  const reqs = asList(catalog).filter((row) => row && str(row.family) && str(row.reqId));
  const byFamily = new Map(FAMILIES.map((meta) => [meta.id, emptyBucket(meta)]));

  for (const req of reqs) {
    const bucket = byFamily.get(str(req.family));
    if (!bucket) continue;
    const rolled = rollupRequirement(req, dets[req.reqId], evidence, operationalPoas);
    bucket.reqCount += 1;
    bucket.aoCount += rolled.objectives.length;
    for (const ao of rolled.objectives) {
      if (ao.finding === "not-reviewed") bucket.unansweredAos += 1;
    }
    if (rolled.finding === "met") bucket.met += 1;
    else if (rolled.finding === "not-met") {
      bucket.notMet += 1;
      if (!covered.has(str(req.reqId))) bucket.poamGaps += 1;
    } else if (rolled.finding === "na") bucket.na += 1;
    else bucket.notReviewedReqs += 1;
  }

  for (const gap of evidenceGapBoard(reqs, dets, evidence).missing) {
    const req = reqs.find((row) => str(row.reqId) === str(gap.reqId));
    const bucket = byFamily.get(str(req?.family));
    if (bucket) bucket.evidenceGaps += 1;
  }

  return FAMILIES.map((meta) => {
    const row = byFamily.get(meta.id);
    const reviewed = isFamilyReviewed(reviewForFamily(assessment?.familyReviews, meta.id));
    let completion = "present";
    if (row.aoCount === 0 || row.unansweredAos === row.aoCount) completion = "unfinished";
    else if (row.unansweredAos > 0) completion = "partial";
    else if (row.evidenceGaps > 0 || row.poamGaps > 0) completion = "gapped";
    return { ...row, reviewed, completion };
  });
}

export function familyProgressSummary(rows) {
  const counts = { unfinished: 0, partial: 0, gapped: 0, present: 0 };
  for (const row of asList(rows)) {
    if (Object.hasOwn(counts, row.completion)) counts[row.completion] += 1;
  }
  return counts;
}

export function nextAssemblerAction(rows) {
  const list = asList(rows);
  for (const status of ["unfinished", "partial", "gapped"]) {
    const row = list.find((item) => item.completion === status);
    if (!row) continue;
    const href = `/requirements?family=${row.family}`;
    if (status === "unfinished") {
      return {
        family: row.family,
        href,
        title: `Start ${row.family}`,
        detail: `${row.name} has no answered objectives.`,
      };
    }
    if (status === "partial") {
      return {
        family: row.family,
        href,
        title: `Resume ${row.family}`,
        detail: `${row.unansweredAos} of ${row.aoCount} objectives still unanswered in ${row.name}.`,
      };
    }
    return {
      family: row.family,
      href,
      title: `Close gaps in ${row.family}`,
      detail: row.evidenceGaps
        ? `${row.evidenceGaps} MET objective(s) in ${row.name} still need a covering pointer.`
        : `${row.poamGaps} NOT MET requirement(s) in ${row.name} have no POA&M row.`,
    };
  }
  const unreviewed = list.find((row) => !row.reviewed);
  if (unreviewed) {
    return {
      family: unreviewed.family,
      href: `/requirements?family=${unreviewed.family}`,
      title: `Review ${unreviewed.family}`,
      detail: `Consultant review flag is still open on ${unreviewed.name}. Completion is present.`,
    };
  }
  return {
    family: null,
    href: "/export",
    title: "Handoff ready",
    detail: "All 14 families are present and reviewed. Mark Export-ready, then type CSV into SPRS by hand.",
  };
}

export function familyProgressBoard(assessment, catalog = catalogFile.requirements) {
  const families = familyProgressRows(assessment, catalog);
  return {
    families,
    counts: familyProgressSummary(families),
    next: nextAssemblerAction(families),
  };
}

export function handoffMarkdown(assessment, score, catalog = catalogFile.requirements) {
  const board = familyProgressBoard(assessment, catalog);
  const org = assessment?.organization && typeof assessment.organization === "object" ? assessment.organization : {};
  const scope = assessment?.scope && typeof assessment.scope === "object" ? assessment.scope : {};
  const status = score?.status || "assessment-incomplete";
  const lines = [
    SAMPLE_WATERMARK,
    "",
    "# Assembler handoff (SAMPLE)",
    "",
    CHECKLIST_PREFIX,
    "Cover sheet for the AO/SCA to QC this pack. Not a SPRS file. The app never submits, signs, or affirms.",
    "",
    `- Organization: ${str(org.name) || "(unnamed)"}`,
    `- CAGE: ${str(org.cage) || "XXXXX"} (fake seed)`,
    `- Assessment Scope: ${str(scope.kind) === "enterprise" ? "Enterprise" : "Enclave"}`,
    `- Score: ${score ? `${score.raw}/110` : "—"} (${status})`,
    `- Next: ${board.next.title} — ${board.next.detail}`,
    `- Counts: present ${board.counts.present} · partial ${board.counts.partial} · gapped ${board.counts.gapped} · unfinished ${board.counts.unfinished}`,
    "",
    "Completion is assembler work status (unfinished / partial / gapped / present). It is not a SPRS finding.",
    "",
    "| Family | Work status | Consultant reviewed | Requirements MET | Requirements NOT MET | Objectives unanswered | MET missing pointer | NOT MET missing POA&M |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const row of board.families) {
    lines.push(
      `| ${row.family} ${row.name} | ${row.completion} | ${row.reviewed ? "yes" : "no"} | ${row.met} | ${row.notMet} | ${row.unansweredAos} | ${row.evidenceGaps} | ${row.poamGaps} |`,
    );
  }
  lines.push("");
  lines.push(SAMPLE_WATERMARK);
  lines.push("");
  return lines.join("\n");
}
