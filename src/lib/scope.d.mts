import type { Assessment, ScoreBlocker } from "../types";

export function scopeBlockers(assessment: Assessment | null | undefined | unknown): ScoreBlocker[];
