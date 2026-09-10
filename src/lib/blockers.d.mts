import type { Assessment, ScoreBlocker } from "../types";
import type { AssessmentScore } from "./score.mjs";

export function combinedBlockers(
  assessment: Assessment | null | undefined | unknown,
  scoreResult: Pick<AssessmentScore, "blockers"> | null | undefined,
): ScoreBlocker[];

export function topBlockers(
  assessment: Assessment | null | undefined | unknown,
  scoreResult: Pick<AssessmentScore, "blockers"> | null | undefined,
  n?: number,
): ScoreBlocker[];
