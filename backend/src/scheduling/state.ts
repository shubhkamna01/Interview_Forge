import { Calendar } from "./calendar";
import { contains } from "./ranges";
import {
  DEFAULT_STEP_MS,
  type BusyInterview,
  type PersonSpec,
  type PlacementResult,
  type Range,
  type RoomSpec,
  type RoundSpec,
  type ScheduleInput,
} from "./types";

export interface PlacementQuery {
  /** null when creating an open slot (no candidate yet). */
  candidate: PersonSpec | null;
  round: RoundSpec;
  /** Earliest allowed start. */
  lower: number;
  /** Latest allowed end. */
  upper: number;
}

/**
 * Everything the solver knows about who and what is busy when.
 * Mutable: add() / remove() keep the calendars consistent.
 */
export class SchedulerState {
  readonly window: Range;
  readonly rounds: RoundSpec[];
  readonly step: number;

  private interviewers: PersonSpec[];
  private rooms: RoomSpec[];
  private roundIds: Set<string>;
  private interviewerCal = new Calendar();
  private roomCal = new Calendar();
  private candidateCal = new Calendar();
  private perInterviewerCount = new Map<string, number>();
  private live = new Map<string, BusyInterview>();

  constructor(input: ScheduleInput) {
    this.window = input.window;
    this.rounds = input.rounds;
    this.step = input.stepMs ?? DEFAULT_STEP_MS;
    this.interviewers = input.interviewers;
    // Smallest sufficient room first, so big rooms stay free for rounds that need them.
    this.rooms = [...input.rooms].sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name));
    this.roundIds = new Set(input.rounds.map((r) => r.id));
    for (const i of input.existing) this.add(i);
  }

  add(i: BusyInterview): void {
    this.live.set(i.id, i);
    this.interviewerCal.add(i.interviewerId, i.start, i.end);
    this.roomCal.add(i.roomId, i.start, i.end);
    if (i.candidateId) this.candidateCal.add(i.candidateId, i.start, i.end);
    if (this.roundIds.has(i.roundId)) {
      this.perInterviewerCount.set(i.interviewerId, (this.perInterviewerCount.get(i.interviewerId) ?? 0) + 1);
    }
  }

  remove(id: string): void {
    const i = this.live.get(id);
    if (!i) return;
    this.live.delete(id);
    this.interviewerCal.remove(i.interviewerId, i.start, i.end);
    this.roomCal.remove(i.roomId, i.start, i.end);
    if (i.candidateId) this.candidateCal.remove(i.candidateId, i.start, i.end);
    if (this.roundIds.has(i.roundId)) {
      this.perInterviewerCount.set(i.interviewerId, (this.perInterviewerCount.get(i.interviewerId) ?? 1) - 1);
    }
  }

  /** The candidate's live interviews in this drive's rounds, by round. */
  candidateRounds(candidateId: string): Map<string, Range> {
    const map = new Map<string, Range>();
    for (const i of this.live.values()) {
      if (i.candidateId === candidateId && this.roundIds.has(i.roundId)) {
        map.set(i.roundId, { start: i.start, end: i.end });
      }
    }
    return map;
  }

  candidateIsFree(candidateId: string, start: number, end: number): boolean {
    return this.candidateCal.isFree(candidateId, start, end);
  }

  /**
   * Finds the earliest start (on the time grid) where the candidate, one eligible interviewer and
   * one big-enough room are all free. Among interviewers who fit, the least busy one is chosen.
   */
  findPlacement(q: PlacementQuery): PlacementResult {
    const { round, candidate } = q;
    const d = round.durationMs;

    const eligible = this.interviewers.filter((iv) => round.requiredSkills.every((s) => iv.skills.includes(s)));
    if (eligible.length === 0) {
      return {
        ok: false,
        reason:
          round.requiredSkills.length > 0
            ? `No interviewer has the required skills (${round.requiredSkills.join(", ")}).`
            : "No interviewers have joined this drive.",
      };
    }

    const rooms = this.rooms.filter((r) => r.capacity >= round.requiredCapacity);
    if (rooms.length === 0) {
      return { ok: false, reason: `No room can hold ${round.requiredCapacity} people.` };
    }

    const from = Math.max(q.lower, this.window.start);
    const to = Math.min(q.upper, this.window.end) - d;
    if (to < from) {
      if (q.upper < this.window.end) {
        return { ok: false, reason: "There is no gap between this candidate's other interviews that is long enough." };
      }
      return {
        ok: false,
        reason:
          q.lower > this.window.start
            ? "Not enough time is left in the drive window after the previous round."
            : "The drive window is too short for this round.",
      };
    }

    let failedCandidate = 0;
    let failedInterviewer = 0;
    let failedRoom = 0;

    const first = this.window.start + Math.ceil((from - this.window.start) / this.step) * this.step;
    for (let t = first; t <= to; t += this.step) {
      const end = t + d;

      if (candidate) {
        const unavailable = candidate.availability !== null && !contains(candidate.availability, t, end);
        if (unavailable || !this.candidateCal.isFree(candidate.id, t, end)) {
          failedCandidate++;
          continue;
        }
      }

      const free = eligible
        .filter((iv) => {
          if (!contains(iv.availability ?? [], t, end)) return false;
          if (!this.interviewerCal.isFree(iv.id, t, end)) return false;
          if (iv.maxInterviews !== null && (this.perInterviewerCount.get(iv.id) ?? 0) >= iv.maxInterviews) return false;
          return true;
        })
        .sort((a, b) => this.interviewerCal.load(a.id) - this.interviewerCal.load(b.id) || a.id.localeCompare(b.id));

      if (free.length === 0) {
        failedInterviewer++;
        continue;
      }

      const room = rooms.find((r) => this.roomCal.isFree(r.id, t, end));
      if (!room) {
        failedRoom++;
        continue;
      }

      return { ok: true, placement: { interviewerId: free[0].id, roomId: room.id, start: t, end } };
    }

    if (failedRoom > 0) {
      return {
        ok: false,
        reason: `Interviewers were free, but no room that holds ${round.requiredCapacity} people was free at those times.`,
      };
    }
    if (failedInterviewer > 0) {
      return {
        ok: false,
        reason: "No interviewer with the required skills is both available and under their limit when the candidate is free.",
      };
    }
    return { ok: false, reason: "The candidate is unavailable or already booked for every possible time." };
  }
}
