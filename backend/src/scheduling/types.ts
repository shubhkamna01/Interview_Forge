/** Half-open time range [start, end) in epoch milliseconds. */
export interface Range {
  start: number;
  end: number;
}

export interface RoundSpec {
  id: string;
  position: number;
  name: string;
  durationMs: number;
  /** Lower-case skill tags an interviewer must have. */
  requiredSkills: string[];
  /** This round must start at least this long after the previous round ends. */
  minGapMs: number;
  /** People in the room; a room must hold at least this many. */
  requiredCapacity: number;
}

export interface PersonSpec {
  id: string;
  name: string;
  /** Lower-case skill tags. */
  skills: string[];
  /** Windows they can interview in. For candidates, null means "any time in the drive". */
  availability: Range[] | null;
  /** Interviewers only: max interviews in this drive. null = no limit. */
  maxInterviews: number | null;
}

export interface RoomSpec {
  id: string;
  name: string;
  capacity: number;
}

/** A live (not cancelled) interview or open slot occupying people and a room. */
export interface BusyInterview {
  id: string;
  roundId: string;
  /** null for an open slot. */
  candidateId: string | null;
  interviewerId: string;
  roomId: string;
  start: number;
  end: number;
}

export interface ScheduleInput {
  /** The drive's scheduling window. */
  window: Range;
  /** Rounds of this drive in order. */
  rounds: RoundSpec[];
  candidates: PersonSpec[];
  interviewers: PersonSpec[];
  rooms: RoomSpec[];
  /**
   * Every live interview/open slot that overlaps the window, across ALL drives
   * (rooms and people are shared between drives).
   */
  existing: BusyInterview[];
  /** Start times are tried on this grid. Default 15 minutes. */
  stepMs?: number;
}

export interface Placement {
  interviewerId: string;
  roomId: string;
  start: number;
  end: number;
}

export type PlacementResult = { ok: true; placement: Placement } | { ok: false; reason: string };

export interface Assignment extends Placement {
  candidateId: string;
  roundId: string;
}

export interface Unresolved {
  candidateId: string;
  roundId: string;
  reason: string;
}

export interface ScheduleResult {
  assignments: Assignment[];
  unresolved: Unresolved[];
}

export const MINUTE = 60_000;
export const DEFAULT_STEP_MS = 15 * MINUTE;
