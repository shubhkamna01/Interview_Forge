import { roundBounds } from "./bounds";
import { clip, contains, totalMs } from "./ranges";
import { SchedulerState } from "./state";
import type {
  Assignment,
  BusyInterview,
  PersonSpec,
  Placement,
  Range,
  ScheduleInput,
  ScheduleResult,
  Unresolved,
} from "./types";

/** How many milliseconds of the drive window this person can actually use. Fewer = more constrained. */
function usableMs(p: PersonSpec, window: Range): number {
  if (p.availability === null) return window.end - window.start;
  return totalMs(p.availability.map((r) => clip(r, window)).filter((r): r is Range => r !== null));
}

/**
 * Heuristic constraint search.
 *  1. Most constrained candidates first (least usable time), so they get first pick of scarce slots.
 *  2. For each candidate, rounds in order. Each round takes the EARLIEST feasible slot after the
 *     previous round, which keeps waiting time between rounds as small as possible.
 *  3. Among feasible interviewers the least busy one is used, which spreads the load.
 * Interviews that already exist are never moved. Whatever cannot be placed is reported with a reason;
 * no hard constraint is ever relaxed. This is a heuristic: it does not claim to be globally optimal.
 */
export function generateSchedule(input: ScheduleInput): ScheduleResult {
  const state = new SchedulerState(input);
  const assignments: Assignment[] = [];
  const unresolved: Unresolved[] = [];
  let counter = 0;

  const order = [...input.candidates].sort(
    (a, b) =>
      usableMs(a, input.window) - usableMs(b, input.window) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );

  for (const candidate of order) {
    const byRound = state.candidateRounds(candidate.id);

    for (let idx = 0; idx < input.rounds.length; idx++) {
      const round = input.rounds[idx];
      if (byRound.has(round.id)) continue;

      const bounds = roundBounds(input.rounds, idx, byRound, input.window);
      if (bounds.blocked) {
        unresolved.push({ candidateId: candidate.id, roundId: round.id, reason: bounds.blocked });
        continue;
      }

      const res = state.findPlacement({ candidate, round, lower: bounds.lower, upper: bounds.upper });
      if (!res.ok) {
        unresolved.push({ candidateId: candidate.id, roundId: round.id, reason: res.reason });
        continue;
      }

      const p = res.placement;
      state.add({
        id: `new:${counter++}`,
        roundId: round.id,
        candidateId: candidate.id,
        interviewerId: p.interviewerId,
        roomId: p.roomId,
        start: p.start,
        end: p.end,
      });
      byRound.set(round.id, { start: p.start, end: p.end });
      assignments.push({ ...p, candidateId: candidate.id, roundId: round.id });
    }
  }

  return { assignments, unresolved };
}

export interface OpenSlotPlacement extends Placement {
  roundId: string;
}

/**
 * Creates open slots candidates can book themselves. `demand` is how many candidates still need
 * an interview in each round. Slots for a round never start before the earliest time a candidate
 * could possibly arrive there (all earlier rounds + gaps), so no slot is created that nobody could book.
 */
export function generateOpenSlots(input: ScheduleInput, demand: Map<string, number>): OpenSlotPlacement[] {
  const state = new SchedulerState(input);
  const out: OpenSlotPlacement[] = [];
  let counter = 0;
  let earliest = input.window.start;

  input.rounds.forEach((round, idx) => {
    if (idx > 0) earliest += input.rounds[idx - 1].durationMs + round.minGapMs;
    const want = demand.get(round.id) ?? 0;

    for (let n = 0; n < want; n++) {
      const res = state.findPlacement({ candidate: null, round, lower: earliest, upper: input.window.end });
      if (!res.ok) break;
      const p = res.placement;
      state.add({
        id: `slot:${counter++}`,
        roundId: round.id,
        candidateId: null,
        interviewerId: p.interviewerId,
        roomId: p.roomId,
        start: p.start,
        end: p.end,
      });
      out.push({ ...p, roundId: round.id });
    }
  });

  return out;
}

export type RescheduleOutcome =
  | { kind: "open_slot"; slot: BusyInterview }
  | { kind: "new"; placement: Placement }
  | { kind: "none"; reason: string };

export interface RescheduleItem {
  affected: BusyInterview;
  outcome: RescheduleOutcome;
}

/**
 * Finds a replacement for each interview that has to move, touching nothing else.
 * The caller passes `input` WITHOUT the affected interviews in `existing` (and with the
 * unavailable interviewer's availability already carved out), and passes the still-open slots separately.
 * For each affected interview we first try an existing open slot, then a brand-new placement.
 */
export function planReschedule(
  input: ScheduleInput,
  affected: BusyInterview[],
  openSlots: BusyInterview[],
): RescheduleItem[] {
  const state = new SchedulerState(input);
  const slotsLeft = [...openSlots].sort((a, b) => a.start - b.start);
  const candidates = new Map(input.candidates.map((c) => [c.id, c]));
  const items: RescheduleItem[] = [];

  for (const a of [...affected].sort((x, y) => x.start - y.start)) {
    const candidate = a.candidateId ? candidates.get(a.candidateId) : undefined;
    const idx = input.rounds.findIndex((r) => r.id === a.roundId);
    if (!candidate || idx < 0) {
      items.push({ affected: a, outcome: { kind: "none", reason: "The candidate is no longer registered for this drive." } });
      continue;
    }

    const round = input.rounds[idx];
    const byRound = state.candidateRounds(candidate.id);
    const bounds = roundBounds(input.rounds, idx, byRound, input.window);
    if (bounds.blocked) {
      items.push({ affected: a, outcome: { kind: "none", reason: bounds.blocked } });
      continue;
    }

    // 1) An existing open slot that suits this candidate.
    const slotIndex = slotsLeft.findIndex(
      (s) =>
        s.roundId === round.id &&
        s.start >= bounds.lower &&
        s.end <= bounds.upper &&
        state.candidateIsFree(candidate.id, s.start, s.end) &&
        (candidate.availability === null || contains(candidate.availability, s.start, s.end)),
    );
    if (slotIndex >= 0) {
      const [slot] = slotsLeft.splice(slotIndex, 1);
      state.remove(slot.id);
      state.add({ ...slot, candidateId: candidate.id });
      items.push({ affected: a, outcome: { kind: "open_slot", slot } });
      continue;
    }

    // 2) A brand-new placement in free time.
    const res = state.findPlacement({ candidate, round, lower: bounds.lower, upper: bounds.upper });
    if (res.ok) {
      const p = res.placement;
      state.add({
        id: `moved:${a.id}`,
        roundId: round.id,
        candidateId: candidate.id,
        interviewerId: p.interviewerId,
        roomId: p.roomId,
        start: p.start,
        end: p.end,
      });
      items.push({ affected: a, outcome: { kind: "new", placement: p } });
    } else {
      items.push({ affected: a, outcome: { kind: "none", reason: res.reason } });
    }
  }

  return items;
}

export interface ScheduleStats {
  /** Interviews that have a candidate. */
  interviews: number;
  /** Average minutes a candidate waits between the end of one round and the start of the next. */
  avgGapMinutes: number | null;
  interviewerUtilizationPct: number;
  roomUtilizationPct: number;
}

/** Quality numbers for a finished schedule. `interviews` = all live interviews of this drive. */
export function scheduleStats(input: ScheduleInput, interviews: BusyInterview[]): ScheduleStats {
  const roundIds = new Set(input.rounds.map((r) => r.id));
  const mine = interviews.filter((i) => roundIds.has(i.roundId));
  const booked = mine.filter((i) => i.candidateId !== null);

  const byCandidate = new Map<string, BusyInterview[]>();
  for (const i of booked) {
    const list = byCandidate.get(i.candidateId!) ?? [];
    list.push(i);
    byCandidate.set(i.candidateId!, list);
  }
  const gaps: number[] = [];
  for (const list of byCandidate.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let k = 1; k < list.length; k++) gaps.push((list[k].start - list[k - 1].end) / 60_000);
  }
  const avgGap = gaps.length ? Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 10) / 10 : null;

  const availableMs = input.interviewers.reduce(
    (sum, iv) => sum + usableMs({ ...iv, availability: iv.availability ?? [] }, input.window),
    0,
  );
  const bookedMs = mine.reduce((sum, i) => sum + (i.end - i.start), 0);
  const roomMs = input.rooms.length * (input.window.end - input.window.start);
  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

  return {
    interviews: booked.length,
    avgGapMinutes: avgGap,
    interviewerUtilizationPct: pct(bookedMs, availableMs),
    roomUtilizationPct: pct(bookedMs, roomMs),
  };
}
