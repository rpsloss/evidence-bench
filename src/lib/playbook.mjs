/** Consultant playbook: work items, SPRS blockers in plain language, annual clocks. Not a SPRS record. */

import { uniqueCages, normalizeEngagement } from "./engagement.mjs";
import { canExportZip, exportReady, familyReviewsComplete } from "./exportPack.mjs";
import { canExportL1Zip } from "./l1Export.mjs";
import { canPromoteToL2 } from "./l1Promote.mjs";
import { l1GroupFinding, l1Groups, l1ScoreFromAssessment } from "./l1Score.mjs";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SOON_MS = 30 * 24 * 60 * 60 * 1000;

function str(value) {
  return value == null ? "" : String(value);
}

function orgOf(assessment) {
  return assessment?.organization && typeof assessment.organization === "object" ? assessment.organization : {};
}

function item(id, status, severity, title, detail, href, citation) {
  const row = { id, status, severity, title, detail, href };
  if (citation) row.citation = citation;
  return row;
}

function addDaysIso(iso, ms) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + ms).toISOString();
}

export function clockState(stampedAt, now = Date.now()) {
  if (!str(stampedAt).trim()) {
    return { state: "missing", stampedAt: null, dueAt: null, daysLeft: null };
  }
  const dueAt = addDaysIso(stampedAt, YEAR_MS);
  const due = dueAt ? Date.parse(dueAt) : NaN;
  if (Number.isNaN(due)) return { state: "missing", stampedAt, dueAt: null, daysLeft: null };
  const left = due - now;
  const daysLeft = Math.ceil(left / (24 * 60 * 60 * 1000));
  if (left < 0) return { state: "overdue", stampedAt, dueAt, daysLeft };
  if (left <= SOON_MS) return { state: "soon", stampedAt, dueAt, daysLeft };
  return { state: "ok", stampedAt, dueAt, daysLeft };
}

export function stampL1Typed(engagement, at = new Date().toISOString()) {
  return normalizeEngagement({ ...engagement, l1TypedAt: at });
}

export function stampL2Affirmed(engagement, at = new Date().toISOString()) {
  return normalizeEngagement({ ...engagement, l2AffirmedAt: at });
}

export function clearPlaybookStamp(engagement, field) {
  if (field === "l1TypedAt") return normalizeEngagement({ ...engagement, l1TypedAt: null });
  if (field === "l2AffirmedAt") return normalizeEngagement({ ...engagement, l2AffirmedAt: null });
  return normalizeEngagement(engagement);
}

function peIxFinding(assessment) {
  const group = l1Groups().find((row) => row.cmmcId === "PE.L1-b.1.ix");
  return group ? l1GroupFinding(group, assessment) : "not-reviewed";
}

export function sprsBlockers(assessment, l2Score) {
  const engagement = normalizeEngagement(assessment?.engagement);
  const org = orgOf(assessment);
  const l1 = l1ScoreFromAssessment(assessment);
  const cages = uniqueCages(org, engagement);
  const blockers = [];
  const l1Active = engagement.workingLevel === "level-1-self" || engagement.requiredLevel === "level-1-self";
  const l2Active = engagement.workingLevel === "level-2-self" || engagement.requiredLevel === "level-2-self";

  if (l1Active) {
    if (!str(engagement.intakeNotedAt).trim()) {
      blockers.push({
        level: "l1",
        id: "l1-intake",
        reason: "Level 1 SPRS is blocked until intake is confirmed (FCI vs CUI).",
        href: "/intake",
      });
    }
    if (cages.length === 0) {
      blockers.push({
        level: "l1",
        id: "l1-cage",
        reason: "SPRS Level 1 needs every CAGE on the in-scope systems. None is listed.",
        href: "/intake",
      });
    }
    if (!str(org.affirmingOfficial?.name).trim()) {
      blockers.push({
        level: "l1",
        id: "l1-ao",
        reason: "An affirming official (local prep name) is required before anyone types into SPRS. This app does not affirm.",
        href: "/intake",
      });
    }
    if (l1.unanswered > 0) {
      blockers.push({
        level: "l1",
        id: "l1-unanswered",
        reason: `Level 1 SPRS is blocked: ${l1.unanswered} FAR row(s) still unanswered. There is no POA&M at Level 1.`,
        href: "/requirements",
      });
    } else if (l1.notMet > 0) {
      blockers.push({
        level: "l1",
        id: "l1-not-met",
        reason: `You can type NOT MET, but you will not have Final Level 1 (Self) or contract eligibility while ${l1.notMet} FAR row(s) are NOT MET. POA&M is not permitted.`,
        href: "/requirements",
      });
    }
  }

  if (l2Active && engagement.workingLevel === "level-2-self") {
    if (!canExportZip(assessment)) {
      blockers.push({
        level: "l2",
        id: "l2-unanswered",
        reason: "The Level 2 SPRS CSV is blocked while any 171A objective (or FIPS overlay) is unanswered, or a MET row failed the evidence gate.",
        href: "/requirements",
      });
    }
    if (l2Score && l2Score.status === "assessment-incomplete") {
      blockers.push({
        level: "l2",
        id: "l2-incomplete",
        reason: "This is not a SPRS score yet. Finish unanswered objectives and the 3.12.4 SSP gate first.",
        href: "/ssp",
      });
    }
    if (!familyReviewsComplete(assessment)) {
      blockers.push({
        level: "l2",
        id: "l2-reviews",
        reason: "Export-ready is blocked until a consultant reviews all 14 families. That stamp is not a CMMC Status Date.",
        href: "/requirements",
      });
    }
    if (l2Score && l2Score.status === "no-cmmc-status") {
      blockers.push({
        level: "l2",
        id: "l2-illegal",
        reason: "Conditional is illegal on this pack (banned requirement, weight > 1, or FIPS exception). Do not tell the client they can POA&M it.",
        href: "/poam",
      });
    }
  }
  return blockers;
}

export function consultantPlaybook(assessment, l2Score, now = Date.now()) {
  const engagement = normalizeEngagement(assessment?.engagement);
  const org = orgOf(assessment);
  const l1 = l1ScoreFromAssessment(assessment);
  const items = [];
  const workingL1 = engagement.workingLevel === "level-1-self";
  const requiredL2 = engagement.requiredLevel === "level-2-self";
  const requiredL1Only = engagement.requiredLevel === "level-1-self";
  const cages = uniqueCages(org, engagement);
  const aoNamed = Boolean(str(org.affirmingOfficial?.name).trim());
  const ix = peIxFinding(assessment);
  const promo = canPromoteToL2(assessment);

  if (engagement.informationType === "unknown" || engagement.currentPhase === "intake") {
    items.push(
      item(
        "intake-fci-cui",
        engagement.informationType === "unknown" ? "todo" : "done",
        engagement.informationType === "unknown" ? "blocker" : "info",
        "Decide FCI vs CUI",
        "Level follows the information on the contract, not headcount. Do not open the 110 board first.",
        "/intake",
      ),
    );
  } else {
    items.push(
      item("intake-fci-cui", "done", "info", "Decide FCI vs CUI", "Information type is set.", "/intake"),
    );
  }

  items.push(
    item(
      "intake-confirm",
      str(engagement.intakeNotedAt).trim() ? "done" : "todo",
      str(engagement.intakeNotedAt).trim() ? "info" : "blocker",
      "Confirm intake",
      str(engagement.intakeNotedAt).trim()
        ? "Local stamp only. Not a CMMC Status Date."
        : "Confirm intake so this engagement has a required CMMC Status.",
      "/intake",
    ),
  );

  if (workingL1 || requiredL1Only || requiredL2) {
    items.push(
      item(
        "l1-pe-ix",
        ix === "met" || ix === "na" ? "done" : ix === "not-met" ? "blocked" : "todo",
        ix === "met" || ix === "na" ? "info" : "blocker",
        "Finish PE.L1-b.1.ix (visitors / logs / access devices)",
        ix === "not-reviewed"
          ? "Common small-shop miss. One FAR row, three 171 IDs (3.10.3, 3.10.4, 3.10.5). All must be MET. No POA&M."
          : ix === "not-met"
            ? "This FAR row is NOT MET. Level 1 cannot use a POA&M (32 CFR 170.21(a)(1))."
            : "Visitor / physical-access trio is present.",
        "/requirements?family=PE",
        "32 CFR 170.15 table 2",
      ),
    );
    items.push(
      item(
        "l1-close",
        l1.unanswered === 0 && l1.notMet === 0 ? "done" : l1.notMet > 0 ? "blocked" : "todo",
        l1.unanswered === 0 && l1.notMet === 0 ? "info" : "blocker",
        "Close remaining Level 1 FAR rows",
        l1.unanswered === 0 && l1.notMet === 0
          ? "15/15 FAR rows MET. Final Level 1 (Self) math is local only."
          : l1.unanswered > 0
            ? `${l1.unanswered} unanswered · ${l1.notMet} NOT MET. All 15 must be MET. No POA&M.`
            : `${l1.notMet} NOT MET. You cannot POA&M a Level 1 gap.`,
        "/requirements",
      ),
    );
  }

  const l1ExportOk = canExportL1Zip(assessment) && str(engagement.intakeNotedAt).trim() && cages.length > 0 && aoNamed;
  if (workingL1 || requiredL1Only) {
    const l1Typed = Boolean(str(engagement.l1TypedAt).trim());
    items.push(
      item(
        "l1-type-sprs",
        l1Typed ? "done" : l1.status === "final-l1-self" && l1ExportOk ? "todo" : "blocked",
        l1Typed ? "info" : l1.status === "final-l1-self" && l1ExportOk ? "warning" : "blocker",
        "Type Level 1 into SPRS by hand",
        l1Typed
          ? "Local stamp on file. Not a CMMC Status Date. Reassess annually."
          : l1.status === "final-l1-self" && l1ExportOk
            ? "Five fields: Level 1 (Self), Status Date (type in SPRS), Assessment Scope, CAGE(s), MET. This app does not submit or affirm."
            : "Level 1 SPRS is blocked until the floor is MET, intake is confirmed, a CAGE is listed, and an affirming-official prep name is on file.",
        "/export",
        "32 CFR 170.15(a)(1)(i)",
      ),
    );
  }

  if (requiredL2 && workingL1) {
    items.push(
      item(
        "promote-l2",
        promo.ok ? "todo" : "blocked",
        promo.ok ? "warning" : "info",
        "Promote to Level 2",
        promo.ok
          ? "Keep org, assets, and the 17 mapped practices. The punch list becomes the other 93."
          : "Finish the Level 1 floor (all MET) and confirm CUI/both on intake before promoting.",
        "/intake",
      ),
    );
  }

  if (engagement.workingLevel === "level-2-self") {
    const sspOk = l2Score?.sspPresent === true;
    items.push(
      item(
        "l2-ssp",
        sspOk ? "done" : "todo",
        sspOk ? "info" : "blocker",
        "Close 3.12.4 SSP before any Conditional story",
        sspOk
          ? "SSP gate is present. SAMPLE stubs only."
          : "Do not talk Conditional until CA.L2-3.12.4 has a body. An empty SSP makes the assessment incomplete.",
        "/ssp",
        "32 CFR 170.24(c)(2)(i)(5)",
      ),
    );
    const incomplete = !l2Score || l2Score.status === "assessment-incomplete";
    items.push(
      item(
        "l2-delta",
        incomplete ? "todo" : "done",
        incomplete ? "blocker" : "info",
        engagement.promotedFromL1At ? "Work the L2 delta" : "Work remaining Level 2 practices",
        incomplete
          ? engagement.promotedFromL1At
            ? "The 17 Level 1 practices are credited. The other 93 are the job. Live score is local math, not SPRS."
            : "Unanswered objectives keep this pack incomplete. It is not a SPRS score."
          : "Level 2 findings are complete enough for a local score.",
        "/requirements",
      ),
    );
    items.push(
      item(
        "l2-reviews",
        familyReviewsComplete(assessment) ? "done" : "todo",
        familyReviewsComplete(assessment) ? "info" : "warning",
        "Consultant-review all 14 families",
        familyReviewsComplete(assessment)
          ? "All 14 families reviewed. Export-ready still is not a CMMC Status Date."
          : "All 14 family reviews are required before Export-ready. Reviews do not submit or affirm.",
        "/requirements",
      ),
    );
    const zipOk = canExportZip(assessment);
    const ready = exportReady(assessment);
    const l2Affirmed = Boolean(str(engagement.l2AffirmedAt).trim());
    items.push(
      item(
        "l2-type-sprs",
        l2Affirmed ? "done" : zipOk && ready ? "todo" : "blocked",
        l2Affirmed ? "info" : zipOk && ready ? "warning" : "blocker",
        "Type Level 2 CSV into SPRS by hand",
        l2Affirmed
          ? "Local affirmation stamp on file. The official affirmed in SPRS, not here."
          : zipOk && ready
            ? "sprs-manual-entry.csv is the typing sheet. SAMPLE watermark stays on. This app does not submit."
            : zipOk
              ? "CSV can emit, but Export-ready still needs the 14 family reviews. Do not treat prepMarkedAt as the Status Date."
              : "The 110-row CSV is blocked while objectives are unanswered or MET failed the evidence gate.",
        "/export",
      ),
    );
  }

  const blockers = sprsBlockers(assessment, l2Score);
  const l1Clock = clockState(engagement.l1TypedAt, now);
  const l2Clock = clockState(engagement.l2AffirmedAt, now);
  const clocks = [];
  if (workingL1 || requiredL1Only || str(engagement.l1TypedAt).trim()) {
    clocks.push({
      id: "l1-annual",
      label: "Level 1 reassessment",
      hint: "Final Level 1 (Self) is good for one year in SPRS. Stamp when you type it. Not a CMMC Status Date.",
      ...l1Clock,
    });
  }
  if (engagement.workingLevel === "level-2-self" || str(engagement.l2AffirmedAt).trim()) {
    clocks.push({
      id: "l2-annual",
      label: "Level 2 annual affirmation",
      hint: "Affirmation is the named official’s act in SPRS / PIEE. Stamp after they affirm. This app does not affirm.",
      ...l2Clock,
    });
  }

  if (l1Clock.state === "overdue") {
    items.push(
      item(
        "l1-annual-overdue",
        "blocked",
        "blocker",
        "Level 1 annual reassessment is overdue",
        "The local stamp is more than a year old. SPRS Final Level 1 (Self) expires after one year. Re-run the floor and type it again. This stamp is not the CMMC Status Date.",
        "/export",
        "32 CFR 170.15(a)(1)",
      ),
    );
  } else if (l1Clock.state === "soon") {
    items.push(
      item(
        "l1-annual-soon",
        "todo",
        "warning",
        "Level 1 annual reassessment is due soon",
        `${l1Clock.daysLeft} day(s) left on the local stamp. Plan the floor check. This is not the CMMC Status Date.`,
        "/export",
      ),
    );
  }

  if (l2Clock.state === "overdue") {
    items.push(
      item(
        "l2-annual-overdue",
        "blocked",
        "blocker",
        "Level 2 annual affirmation is overdue",
        "The local stamp is more than a year old. The affirming official affirms in SPRS, not here.",
        "/export",
        "32 CFR 170.22",
      ),
    );
  } else if (l2Clock.state === "soon") {
    items.push(
      item(
        "l2-annual-soon",
        "todo",
        "warning",
        "Level 2 annual affirmation is due soon",
        `${l2Clock.daysLeft} day(s) left on the local stamp. Remind the affirming official. This app does not affirm.`,
        "/export",
      ),
    );
  }

  const open = items.filter((row) => row.status !== "done");
  const next = open[0] || items[0];

  return {
    items,
    open,
    next,
    clocks,
    sprsBlockers: blockers,
    doneCount: items.filter((row) => row.status === "done").length,
  };
}
