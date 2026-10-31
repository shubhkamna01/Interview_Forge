import { MINUTE, type PersonSpec, type RoomSpec, type RoundSpec, type ScheduleInput } from "../../src/scheduling/types";

export const H = 60 * MINUTE;
export const DAY0 = Date.UTC(2026, 9, 30, 0, 0, 0); // 30 Oct 2026 00:00 UTC
export const at = (h: number, m = 0) => DAY0 + h * H + m * MINUTE;

export function round(id: string, position: number, over: Partial<RoundSpec> = {}): RoundSpec {
  return {
    id,
    position,
    name: `Round ${position}`,
    durationMs: 30 * MINUTE,
    requiredSkills: [],
    minGapMs: 0,
    requiredCapacity: 2,
    ...over,
  };
}

export function person(id: string, over: Partial<PersonSpec> = {}): PersonSpec {
  return { id, name: id, skills: [], availability: null, maxInterviews: null, ...over };
}

export function room(id: string, capacity = 4): RoomSpec {
  return { id, name: id, capacity };
}

export function input(over: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    window: { start: at(9), end: at(17) },
    rounds: [round("r1", 1)],
    candidates: [],
    interviewers: [],
    rooms: [room("room1")],
    existing: [],
    ...over,
  };
}

export const allDay = [{ start: at(9), end: at(17) }];

export function candidates(n: number, over: Partial<PersonSpec> = {}): PersonSpec[] {
  return Array.from({ length: n }, (_, i) => person(`c${String(i).padStart(2, "0")}`, over));
}

/** Small deterministic random number generator so failures can be reproduced. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
