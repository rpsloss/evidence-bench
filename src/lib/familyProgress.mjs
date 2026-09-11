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

function evidenceWarning(kind, item) {
  return {
    kind,
    id: str(item?.id),
    title: str(item?.title) || str(item?.id),
    evidenceKind: str(item?.kind),
    href: "/evidence",
  };
}

/**
 * AO/SCA punch list. Family board is the map; this is the remaining work.
 * Stale / draft / unmapped are warnings, not SPRS findings. Stale is not a MET breaker.
 */
export function assemblerPunchList(assessment, catalog = catalogFile.requirements, now = Date.now()) {
  const evidence = asList(assessment?.evidence);
  const operationalPoas = asList(assessment?.operationalPoas);
  const dets =
    assessment?.determinations && typeof assessment.determinations === "object" ? assessment.determinations : {};
  const covered = poamCovered(assessment);
  const reqs = asList(catalog).filter((row) => row && str(row.family) && str(row.reqId));
  const unansweredAos = [];
  const missingPoams = [];

  for (const req of reqs) {
    const rolled = rollupRequirement(req, dets[req.reqId], evidence, operationalPoas);
    const family = str(req.family);
    const href = `/requirements?family=${family}`;
    for (const ao of rolled.objectives) {
      if (ao.finding !== "not-reviewed") continue;
      unansweredAos.push({
        family,
        reqId: str(req.reqId),
        cmmcId: str(req.cmmcId),
        aoId: str(ao.aoId),
        href,
      });
    }
    if (rolled.finding === "not-met" && !covered.has(str(req.reqId))) {
      missingPoams.push({
        family,
        reqId: str(req.reqId),
        cmmcId: str(req.cmmcId),
        href: "/poam",
      });
    }
  }

  const gaps = evidenceGapBoard(reqs, dets, evidence, now);
  const missingPointers = gaps.missing.map((row) => {
    const req = reqs.find((item) => str(item.reqId) === str(row.reqId));
    const family = str(req?.family);
    return {
      family,
      reqId: str(row.reqId),
      cmmcId: str(row.cmmcId),
      aoId: str(row.aoId),
      href: "/evidence",
    };
  });

  const openReviews = FAMILIES.filter(
    (meta) => !isFamilyReviewed(reviewForFamily(assessment?.familyReviews, meta.id)),
  ).map((meta) => ({
    family: meta.id,
    name: meta.name,
    href: `/requirements?family=${meta.id}`,
  }));

  const stale = gaps.stale.map((item) => evidenceWarning("stale", item));
  const draft = gaps.draft.map((item) => evidenceWarning("draft", item));
  const unmapped = gaps.unmapped.map((item) => evidenceWarning("unmapped", item));
  const counts = {
    unansweredAos: unansweredAos.length,
    missingPointers: missingPointers.length,
    missingPoams: missingPoams.length,
    openReviews: openReviews.length,
    stale: stale.length,
    draft: draft.length,
    unmapped: unmapped.length,
  };
  counts.work = counts.unansweredAos + counts.missingPointers + counts.missingPoams;
  counts.warnings = counts.stale + counts.draft + counts.unmapped;

  return {
    unansweredAos,
    missingPointers,
    missingPoams,
    openReviews,
    stale,
    draft,
    unmapped,
    counts,
  };
}

function familyName(id) {
  return FAMILIES.find((row) => row.id === id)?.name || id;
}

function groupByFamily(rows) {
  const map = new Map();
  for (const row of asList(rows)) {
    const key = str(row.family) || "(none)";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/** Home rows: one per family per work kind, plus individual evidence warnings. */
export function punchListHomeItems(list) {
  const items = [];
  const source = list && typeof list === "object" && list.counts ? list : assemblerPunchList(null);
  for (const [family, rows] of groupByFamily(source.unansweredAos)) {
    items.push({
      id: `unanswered-${family}`,
      kind: "unanswered",
      severity: "blocker",
      family,
      href: `/requirements?family=${family}`,
      title: `${family}: ${rows.length} unanswered objective${rows.length === 1 ? "" : "s"}`,
      detail: familyName(family),
    });
  }
  for (const [family, rows] of groupByFamily(source.missingPointers)) {
    items.push({
      id: `pointer-${family}`,
      kind: "missing-pointer",
      severity: "blocker",
      family,
      href: "/evidence",
      title: `${family}: ${rows.length} MET objective${rows.length === 1 ? "" : "s"} missing a pointer`,
      detail: familyName(family),
    });
  }
  for (const [family, rows] of groupByFamily(source.missingPoams)) {
    items.push({
      id: `poam-${family}`,
      kind: "missing-poam",
      severity: "blocker",
      family,
      href: "/poam",
      title: `${family}: ${rows.length} NOT MET requirement${rows.length === 1 ? "" : "s"} missing POA&M`,
      detail: familyName(family),
    });
  }
  for (const row of [...asList(source.draft), ...asList(source.stale), ...asList(source.unmapped)]) {
    const kind = str(row.kind);
    items.push({
      id: `${kind}-${row.id}`,
      kind,
      severity: kind === "draft" ? "blocker" : "warning",
      family: null,
      href: "/evidence",
      title: `${kind}: ${row.title}`,
      detail:
        kind === "stale"
          ? "Freshness warning — not a MET breaker."
          : kind === "draft"
            ? "Draft pointers cannot support MET."
            : "Empty aoIds never credit MET.",
    });
  }
  return items;
}

function punchListLines(list, limit = 8) {
  const lines = [
    "## Punch list (AO/SCA QC)",
    "",
    "Remaining assembler work in this pack. Not a SPRS finding. Stale, draft, and unmapped pointers are warnings — stale is not a MET breaker.",
    "",
    `- Unanswered objectives: ${list.counts.unansweredAos}`,
    `- MET missing pointers: ${list.counts.missingPointers}`,
    `- NOT MET missing POA&M: ${list.counts.missingPoams}`,
    `- Consultant reviews still open: ${list.counts.openReviews}`,
    `- Evidence warnings: ${list.counts.stale} stale · ${list.counts.draft} draft · ${list.counts.unmapped} unmapped`,
    "",
  ];

  function section(title, rows, labelFn) {
    lines.push(`### ${title}`);
    lines.push("");
    if (!rows.length) {
      lines.push("None.");
      lines.push("");
      return;
    }
    for (const [family, group] of groupByFamily(rows)) {
      const labels = group.map(labelFn);
      const shown = labels.slice(0, limit);
      const extra = labels.length - shown.length;
      const more = extra > 0 ? ` (+${extra} more)` : "";
      lines.push(`- ${family}: ${shown.join(", ")}${more}`);
    }
    lines.push("");
  }

  section("Unanswered objectives", list.unansweredAos, (row) => row.aoId);
  section("MET missing pointers", list.missingPointers, (row) => row.aoId);
  section("NOT MET missing POA&M", list.missingPoams, (row) => row.cmmcId || row.reqId);

  lines.push("### Consultant reviews still open");
  lines.push("");
  if (!list.openReviews.length) {
    lines.push("None.");
  } else {
    for (const row of list.openReviews) {
      lines.push(`- ${row.family} ${row.name}`);
    }
  }
  lines.push("");

  lines.push("### Evidence warnings");
  lines.push("");
  const warnings = [...list.draft, ...list.stale, ...list.unmapped];
  if (!warnings.length) {
    lines.push("None.");
  } else {
    const shown = warnings.slice(0, 12);
    for (const row of shown) {
      lines.push(`- ${row.kind}: ${row.title} (${row.id})`);
    }
    if (warnings.length > shown.length) {
      lines.push(`- +${warnings.length - shown.length} more`);
    }
  }
  lines.push("");
  return lines;
}

export function handoffMarkdown(assessment, score, catalog = catalogFile.requirements) {
  const board = familyProgressBoard(assessment, catalog);
  const punch = assemblerPunchList(assessment, catalog);
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
    `- Punch list: ${punch.counts.work} work item${punch.counts.work === 1 ? "" : "s"} · ${punch.counts.openReviews} reviews open · ${punch.counts.warnings} evidence warning${punch.counts.warnings === 1 ? "" : "s"}`,
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
  lines.push(...punchListLines(punch));
  lines.push(SAMPLE_WATERMARK);
  lines.push("");
  return lines.join("\n");
}
