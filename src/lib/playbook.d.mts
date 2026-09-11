import type { Assessment, AssessmentScore } from "../types";
import type { Engagement } from "./engagement.mjs";

export type PlaybookStatus = "todo" | "blocked" | "done";
export type ClockState = "missing" | "ok" | "soon" | "overdue";

export interface PlaybookItem {
  id: string;
  status: PlaybookStatus;
  severity: "blocker" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  citation?: string;
}

export interface PlaybookClock {
  id: string;
  label: string;
  hint: string;
  state: ClockState;
  stampedAt: string | null;
  dueAt: string | null;
  daysLeft: number | null;
}

export interface SprsBlocker {
  level: "l1" | "l2";
  id: string;
  reason: string;
  href: string;
}

export interface ConsultantPlaybook {
  items: PlaybookItem[];
  open: PlaybookItem[];
  next: PlaybookItem;
  clocks: PlaybookClock[];
  sprsBlockers: SprsBlocker[];
  doneCount: number;
}

export function clockState(
  stampedAt: string | null | undefined,
  now?: number,
): { state: ClockState; stampedAt: string | null; dueAt: string | null; daysLeft: number | null };

export function stampL1Typed(engagement: Engagement | unknown, at?: string): Engagement;
export function stampL2Affirmed(engagement: Engagement | unknown, at?: string): Engagement;
export function clearPlaybookStamp(engagement: Engagement | unknown, field: "l1TypedAt" | "l2AffirmedAt"): Engagement;

export function sprsBlockers(
  assessment: Assessment | null | undefined | unknown,
  l2Score?: AssessmentScore | null,
): SprsBlocker[];

export function consultantPlaybook(
  assessment: Assessment | null | undefined | unknown,
  l2Score?: AssessmentScore | null,
  now?: number,
): ConsultantPlaybook;
