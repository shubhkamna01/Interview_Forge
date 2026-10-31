import type { Range, RoundSpec } from "./types";

export interface Bounds {
  lower: number;
  upper: number;
  /** Set when this round can't be placed yet, e.g. the previous round isn't scheduled. */
  blocked?: string;
}

/**
 * The earliest start and latest end for a candidate's interview in rounds[idx],
 * given the interviews they already have in other rounds (byRound).
 *  - It must start `minGap` after the previous round ends.
 *  - It must end `minGap` before any later round that is already booked.
 */
export function roundBounds(
  rounds: RoundSpec[],
  idx: number,
  byRound: Map<string, Range>,
  window: Range,
): Bounds {
  let lower = window.start;
  let upper = window.end;

  if (idx > 0) {
    const prev = byRound.get(rounds[idx - 1].id);
    if (!prev) {
      return { lower, upper, blocked: `Round "${rounds[idx - 1].name}" is not scheduled yet.` };
    }
    lower = Math.max(lower, prev.end + rounds[idx].minGapMs);
  }

  for (let k = idx + 1; k < rounds.length; k++) {
    const later = byRound.get(rounds[k].id);
    if (later) upper = Math.min(upper, later.start - rounds[k].minGapMs);
  }

  return { lower, upper };
}
