/** Castleridge engagement intake. Level is the information type, not company size. */

export const INFORMATION_TYPES = Object.freeze(["unknown", "fci-only", "cui", "both"]);
export const REQUIRED_LEVELS = Object.freeze(["undetermined", "level-1-self", "level-2-self"]);
export const WORKING_LEVELS = Object.freeze(["level-1-self", "level-2-self"]);
export const ENGAGEMENT_PHASES = Object.freeze(["intake", "l1-prep", "l2-prep"]);

const CLAUSE_KEYS = ["far5220421", "dfars7012", "dfars7021"];

function str(value) {
  return value == null ? "" : String(value);
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function asTri(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

export function emptyEngagement() {
  return {
    informationType: "unknown",
    requiredLevel: "undetermined",
    workingLevel: "level-2-self",
    clauses: { far5220421: null, dfars7012: null, dfars7021: null, notes: "" },
    additionalCages: [],
    currentPhase: "intake",
    intakeNotedAt: null,
    promotedFromL1At: null,
    l1CreditedReqIds: [],
  };
}

export function requiredLevelFromInformation(informationType) {
  if (informationType === "fci-only") return "level-1-self";
  if (informationType === "cui" || informationType === "both") return "level-2-self";
  return "undetermined";
}

export function coerceWorkingLevel(requiredLevel, requested) {
  if (requiredLevel === "level-1-self") return "level-1-self";
  if (requested === "level-1-self") return "level-1-self";
  return "level-2-self";
}

export function derivePhase({ requiredLevel, workingLevel, intakeNotedAt }) {
  if (requiredLevel === "undetermined" || !str(intakeNotedAt).trim()) return "intake";
  if (workingLevel === "level-1-self") return "l1-prep";
  return "l2-prep";
}

export function isWorkingLevel1(engagement) {
  return str(engagement?.workingLevel) === "level-1-self";
}

export function informationLabel(value) {
  if (value === "fci-only") return "FCI only";
  if (value === "cui") return "CUI";
  if (value === "both") return "FCI and CUI";
  return "Unknown";
}

export function levelLabel(value) {
  if (value === "level-1-self") return "Level 1 (Self)";
  if (value === "level-2-self") return "Level 2 (Self)";
  return "Undetermined";
}

export function phaseLabel(value) {
  if (value === "l1-prep") return "Level 1 prep";
  if (value === "l2-prep") return "Level 2 prep";
  return "Intake";
}

export function uniqueCages(org, engagement) {
  const seen = new Set();
  const out = [];
  for (const raw of [org?.cage, ...asList(engagement?.additionalCages)]) {
    const cage = str(raw).trim();
    if (!cage) continue;
    const key = cage.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cage);
  }
  return out;
}

function normalizeAdditionalCages(value) {
  const seen = new Set();
  const out = [];
  for (const raw of asList(value)) {
    const cage = str(raw).trim();
    if (!cage) continue;
    const key = cage.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cage);
  }
  return out;
}

export function normalizeEngagement(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const informationType = INFORMATION_TYPES.includes(src.informationType) ? src.informationType : "unknown";
  const requiredLevel = requiredLevelFromInformation(informationType);
  const workingLevel = coerceWorkingLevel(
    requiredLevel,
    WORKING_LEVELS.includes(src.workingLevel) ? src.workingLevel : "level-2-self",
  );
  const clausesIn = src.clauses && typeof src.clauses === "object" && !Array.isArray(src.clauses) ? src.clauses : {};
  const clauses = {
    far5220421: asTri(clausesIn.far5220421),
    dfars7012: asTri(clausesIn.dfars7012),
    dfars7021: asTri(clausesIn.dfars7021),
    notes: str(clausesIn.notes),
  };
  const intakeNotedAt = informationType === "unknown" ? null : str(src.intakeNotedAt).trim() || null;
  const currentPhase = derivePhase({ requiredLevel, workingLevel, intakeNotedAt });
  const credited = [];
  const seen = new Set();
  for (const raw of asList(src.l1CreditedReqIds)) {
    const id = str(raw).trim();
    if (!/^\d+\.\d+\.\d+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    credited.push(id);
  }
  return {
    informationType,
    requiredLevel,
    workingLevel,
    clauses,
    additionalCages: normalizeAdditionalCages(src.additionalCages),
    currentPhase,
    intakeNotedAt,
    promotedFromL1At: str(src.promotedFromL1At).trim() || null,
    l1CreditedReqIds: credited,
  };
}

export function confirmIntake(engagement, at = new Date().toISOString()) {
  const next = normalizeEngagement({ ...engagement, intakeNotedAt: at });
  if (next.requiredLevel === "undetermined") return normalizeEngagement({ ...next, intakeNotedAt: null });
  return next;
}

export function engagementNextAction(engagement, assemblerNext, l1Next) {
  const row = normalizeEngagement(engagement);
  if (row.currentPhase === "intake") {
    return {
      href: "/intake",
      title: "Finish intake",
      detail:
        row.informationType === "unknown"
          ? "Decide FCI vs CUI before opening the 110-practice board. Level follows the information, not headcount."
          : "Confirm intake so this engagement has a required CMMC Status.",
    };
  }
  if (row.workingLevel === "level-1-self") {
    if (l1Next && typeof l1Next === "object") {
      return {
        href: str(l1Next.href) || "/requirements",
        title: str(l1Next.title) || "Open Level 1",
        detail: str(l1Next.detail) || "Level 1 is 15 FAR 52.204-21 requirements, all MET, no POA&M.",
      };
    }
    return {
      href: "/requirements",
      title: "Open Level 1 requirements",
      detail: "Level 1 is 15 FAR 52.204-21 requirements, all MET, no POA&M. Do not treat the 110 board as Level 1.",
    };
  }
  if (assemblerNext && typeof assemblerNext === "object") {
    return {
      href: str(assemblerNext.href) || "/requirements",
      title: str(assemblerNext.title) || "Resume Level 2",
      detail: str(assemblerNext.detail) || "Continue the Level 2 (Self) pack.",
    };
  }
  return {
    href: "/requirements",
    title: "Open Requirements",
    detail: "Continue the Level 2 (Self) pack.",
  };
}

export { CLAUSE_KEYS };
