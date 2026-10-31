import { roundBounds } from "./bounds";
import { contains } from "./ranges";
import type { Range, RoundSpec } from "./types";

export interface SlotCheckInput {
  rounds: RoundSpec[];
  /** The drive's scheduling window. */
  window: Range;
  /** The candidate's live interviews in this drive, by round id. */
  byRound: Map<string, Range>;
  /** All the candidate's other live interviews (any drive), for overlap checks. */
  otherInterviews: Range[];
  /** Candidate availability windows, or null if they gave none (= any time). */
  availability: Range[] | null;
  slot: { roundId: string; start: number; end: number };
  now: number;
}

export type SlotCheck = { ok: true } | { ok: false; reason: string };

/** The round a candidate may book next: the first one they don't have an interview for. */
export function nextRoundIndex(rounds: RoundSpec[], byRound: Map<string, Range>): number {
  return rounds.findIndex((r) => !byRound.has(r.id));
}

/** One place that decides whether a candidate may take an open slot. Used for listing AND for booking. */
export function checkSlotForCandidate(i: SlotCheckInput): SlotCheck {
  const idx = i.rounds.findIndex((r) => r.id === i.slot.roundId);
  if (idx < 0) return { ok: false, reason: "This slot doesn't belong to the drive." };

  if (i.byRound.has(i.slot.roundId)) {
    return { ok: false, reason: "You already have an interview for this round." };
  }
  const next = nextRoundIndex(i.rounds, i.byRound);
  if (next !== idx) {
    return { ok: false, reason: `Book "${i.rounds[next].name}" first. Rounds must be taken in order.` };
  }
  if (i.slot.start < i.now) return { ok: false, reason: "This slot has already started." };
  if (i.slot.start < i.window.start || i.slot.end > i.window.end) {
    return { ok: false, reason: "This slot is outside the drive window." };
  }

  const b = roundBounds(i.rounds, idx, i.byRound, i.window);
  if (b.blocked || i.slot.start < b.lower || i.slot.end > b.upper) {
    return { ok: false, reason: "This slot doesn't leave the required time after your previous round." };
  }
  if (i.availability !== null && !contains(i.availability, i.slot.start, i.slot.end)) {
    return { ok: false, reason: "This slot is outside the times you marked as available." };
  }
  if (i.otherInterviews.some((o) => o.start < i.slot.end && i.slot.start < o.end)) {
    return { ok: false, reason: "This slot overlaps another interview of yours." };
  }
  return { ok: true };
}
