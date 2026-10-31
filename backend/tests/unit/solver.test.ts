import { describe, expect, it } from "vitest";
import { generateOpenSlots, generateSchedule, planReschedule, scheduleStats } from "../../src/scheduling/solver";
import { validateSchedule } from "../../src/scheduling/validate";
import { MINUTE, type BusyInterview, type ScheduleInput } from "../../src/scheduling/types";
import { H, allDay, at, candidates, input, person, rng, room, round } from "./builders";

const threeRounds = [
  round("r1", 1, { name: "Online Assessment" }),
  round("r2", 2, { name: "Technical", durationMs: 45 * MINUTE, requiredSkills: ["dsa"], minGapMs: 15 * MINUTE }),
  round("r3", 3, { name: "HR", requiredSkills: ["hr"] }),
];

function fullInput(n = 12): ScheduleInput {
  return input({
    rounds: threeRounds,
    candidates: candidates(n),
    interviewers: [
      person("ivA", { skills: ["dsa", "hr"], availability: allDay }),
      person("ivB", { skills: ["dsa"], availability: allDay }),
      person("ivC", { skills: ["hr"], availability: allDay }),
      person("ivD", { skills: [], availability: allDay }),
    ],
    rooms: [room("small", 2), room("big", 6), room("mid1", 4), room("mid2", 4)],
  });
}

describe("generateSchedule: hard constraints", () => {
  it("produces a fully valid schedule for a normal drive", () => {
    const inp = fullInput(12);
    const { assignments, unresolved } = generateSchedule(inp);
    expect(unresolved).toEqual([]);
    expect(assignments).toHaveLength(36);
    expect(validateSchedule(inp, assignments)).toEqual([]);
  });

  it("keeps round order and the minimum gap between rounds", () => {
    const inp = fullInput(1);
    const { assignments } = generateSchedule(inp);
    const byRound = Object.fromEntries(assignments.map((a) => [a.roundId, a]));
    expect(byRound.r2.start).toBeGreaterThanOrEqual(byRound.r1.end + 15 * MINUTE);
    expect(byRound.r3.start).toBeGreaterThanOrEqual(byRound.r2.end);
  });

  it("only uses interviewers with the required skills", () => {
    const inp = fullInput(6);
    const { assignments } = generateSchedule(inp);
    for (const a of assignments.filter((x) => x.roundId === "r2")) expect(["ivA", "ivB"]).toContain(a.interviewerId);
    for (const a of assignments.filter((x) => x.roundId === "r3")) expect(["ivA", "ivC"]).toContain(a.interviewerId);
  });

  it("reports unresolved (and blocks later rounds) when nobody has the skill", () => {
    const inp = fullInput(2);
    inp.interviewers = inp.interviewers.map((i) => ({ ...i, skills: i.skills.filter((s) => s !== "dsa") }));
    const { assignments, unresolved } = generateSchedule(inp);
    expect(assignments.filter((a) => a.roundId === "r1")).toHaveLength(2);
    expect(assignments.filter((a) => a.roundId !== "r1")).toHaveLength(0);
    const r2 = unresolved.filter((u) => u.roundId === "r2");
    expect(r2).toHaveLength(2);
    expect(r2[0].reason).toMatch(/skills \(dsa\)/);
    expect(unresolved.filter((u) => u.roundId === "r3")[0].reason).toMatch(/not scheduled yet/);
  });

  it("never uses a room that is too small", () => {
    const inp = input({
      rounds: [round("r1", 1, { requiredCapacity: 5 })],
      candidates: candidates(3),
      interviewers: [person("iv", { availability: allDay })],
      rooms: [room("tiny", 2), room("roomy", 8)],
    });
    const { assignments } = generateSchedule(inp);
    expect(assignments).toHaveLength(3);
    expect(assignments.every((a) => a.roomId === "roomy")).toBe(true);

    const none = generateSchedule({ ...inp, rooms: [room("tiny", 2)] });
    expect(none.assignments).toHaveLength(0);
    expect(none.unresolved[0].reason).toMatch(/No room can hold 5/);
  });

  it("respects interviewer availability and reports who didn't fit", () => {
    const inp = input({
      candidates: candidates(5),
      interviewers: [person("iv", { availability: [{ start: at(10), end: at(11) }] })],
    });
    const { assignments, unresolved } = generateSchedule(inp);
    expect(assignments).toHaveLength(2); // 10:00-10:30 and 10:30-11:00
    expect(assignments.every((a) => a.start >= at(10) && a.end <= at(11))).toBe(true);
    expect(unresolved).toHaveLength(3);
    expect(unresolved[0].reason).toMatch(/available/);
  });

  it("an interviewer with no availability is never used", () => {
    const inp = input({ candidates: candidates(2), interviewers: [person("iv", { availability: [] })] });
    expect(generateSchedule(inp).assignments).toHaveLength(0);
  });

  it("respects candidate availability", () => {
    const inp = input({
      candidates: [person("late", { availability: [{ start: at(14), end: at(15) }] })],
      interviewers: [person("iv", { availability: allDay })],
    });
    const [a] = generateSchedule(inp).assignments;
    expect(a.start).toBeGreaterThanOrEqual(at(14));
    expect(a.end).toBeLessThanOrEqual(at(15));
  });

  it("respects an interviewer's interview limit", () => {
    const inp = input({
      candidates: candidates(6),
      interviewers: [person("iv", { availability: allDay, maxInterviews: 2 })],
    });
    const { assignments, unresolved } = generateSchedule(inp);
    expect(assignments).toHaveLength(2);
    expect(unresolved).toHaveLength(4);
  });

  it("never double-books against existing interviews, including other drives", () => {
    const existing: BusyInterview[] = [
      { id: "x1", roundId: "other-drive-round", candidateId: "stranger", interviewerId: "iv", roomId: "room1", start: at(9), end: at(12) },
    ];
    const inp = input({
      candidates: candidates(3),
      interviewers: [person("iv", { availability: allDay }), person("iv2", { availability: allDay })],
      existing,
    });
    const { assignments } = generateSchedule(inp);
    expect(assignments).toHaveLength(3);
    expect(validateSchedule(inp, assignments, existing)).toEqual([]);
    // Room1 is busy until 12:00, so everything starts at/after noon.
    expect(assignments.every((a) => a.start >= at(12))).toBe(true);
  });

  it("does not move existing interviews and works around them", () => {
    const base = fullInput(1);
    const first = generateSchedule(base);
    const existing: BusyInterview[] = first.assignments.map((a, i) => ({ id: `e${i}`, ...a, candidateId: a.candidateId }));
    const again = generateSchedule({ ...base, existing });
    expect(again.assignments).toEqual([]);
    expect(again.unresolved).toEqual([]);
  });

  it("schedules the rest of a candidate whose first round is already booked", () => {
    const base = fullInput(1);
    const existing: BusyInterview[] = [
      { id: "e1", roundId: "r1", candidateId: "c00", interviewerId: "ivD", roomId: "small", start: at(9), end: at(9, 30) },
    ];
    const { assignments, unresolved } = generateSchedule({ ...base, existing });
    expect(unresolved).toEqual([]);
    expect(assignments.map((a) => a.roundId)).toEqual(["r2", "r3"]);
    expect(assignments[0].start).toBeGreaterThanOrEqual(at(9, 45));
  });

  it("reports (never silently violates) when the window is too short for all rounds", () => {
    const inp = fullInput(2);
    inp.window = { start: at(9), end: at(10) };
    inp.interviewers = inp.interviewers.map((i) => ({ ...i, availability: [{ start: at(9), end: at(10) }] }));
    const { assignments, unresolved } = generateSchedule(inp);
    expect(validateSchedule(inp, assignments)).toEqual([]);
    expect(unresolved.length).toBeGreaterThan(0);
  });
});

describe("generateSchedule: quality", () => {
  it("is deterministic", () => {
    const a = generateSchedule(fullInput(10));
    const b = generateSchedule(fullInput(10));
    expect(a).toEqual(b);
  });

  it("schedules as many as capacity allows when resources are scarce", () => {
    const inp = input({
      window: { start: at(9), end: at(11) },
      candidates: candidates(10),
      interviewers: [person("iv", { availability: [{ start: at(9), end: at(11) }] })],
    });
    expect(generateSchedule(inp).assignments).toHaveLength(4); // 2h / 30min
  });

  it("gives scarce slots to the most constrained candidate first", () => {
    const inp = input({
      window: { start: at(9), end: at(10) },
      candidates: [
        person("flexible", { availability: null }),
        person("picky", { availability: [{ start: at(9), end: at(9, 30) }] }),
      ],
      interviewers: [person("iv", { availability: [{ start: at(9), end: at(10) }] })],
    });
    const { assignments, unresolved } = generateSchedule(inp);
    expect(unresolved).toEqual([]);
    expect(assignments.find((a) => a.candidateId === "picky")!.start).toBe(at(9));
    expect(assignments.find((a) => a.candidateId === "flexible")!.start).toBe(at(9, 30));
  });

  it("keeps waiting between rounds at the minimum when resources are free", () => {
    const { assignments } = generateSchedule(fullInput(1));
    const [r1, r2, r3] = ["r1", "r2", "r3"].map((id) => assignments.find((a) => a.roundId === id)!);
    expect(r2.start - r1.end).toBe(15 * MINUTE);
    expect(r3.start - r2.end).toBe(0);
  });

  it("spreads work across interviewers", () => {
    const inp = input({
      candidates: candidates(8),
      interviewers: [person("a", { availability: allDay }), person("b", { availability: allDay })],
      rooms: [room("r1"), room("r2")],
    });
    const { assignments } = generateSchedule(inp);
    const count = (id: string) => assignments.filter((a) => a.interviewerId === id).length;
    expect(Math.abs(count("a") - count("b"))).toBeLessThanOrEqual(1);
  });

  it("computes schedule stats", () => {
    const inp = fullInput(4);
    const { assignments } = generateSchedule(inp);
    const live: BusyInterview[] = assignments.map((a, i) => ({ id: `i${i}`, ...a }));
    const s = scheduleStats(inp, live);
    expect(s.interviews).toBe(12);
    expect(s.avgGapMinutes).not.toBeNull();
    expect(s.interviewerUtilizationPct).toBeGreaterThan(0);
    expect(s.roomUtilizationPct).toBeGreaterThan(0);
  });
});

describe("generateSchedule: randomized invariants", () => {
  it("never violates a hard constraint, across 300 random scenarios", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = rng(seed);
      const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
      const skillsPool = ["dsa", "hr", "sql"];
      const winH = 3 + Math.floor(rand() * 8);
      const window = { start: at(9), end: at(9) + winH * H };

      const rounds = Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, i) =>
        round(`r${i + 1}`, i + 1, {
          durationMs: pick([15, 30, 45, 60]) * MINUTE,
          minGapMs: pick([0, 0, 15, 30]) * MINUTE,
          requiredSkills: rand() < 0.5 ? [pick(skillsPool)] : [],
          requiredCapacity: pick([2, 2, 4, 6]),
        }),
      );
      const rand_range = () => {
        const s = window.start + Math.floor(rand() * winH * 4) * 15 * MINUTE;
        return { start: s, end: Math.min(window.end, s + (1 + Math.floor(rand() * 16)) * 15 * MINUTE) };
      };
      const interviewers = Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, i) =>
        person(`iv${i}`, {
          skills: skillsPool.filter(() => rand() < 0.6),
          availability: rand() < 0.2 ? [] : [rand_range(), rand_range()].filter((r) => r.end > r.start),
          maxInterviews: rand() < 0.3 ? 1 + Math.floor(rand() * 4) : null,
        }),
      );
      const cands = Array.from({ length: 1 + Math.floor(rand() * 12) }, (_, i) =>
        person(`c${i}`, { availability: rand() < 0.4 ? [rand_range()] : null }),
      );
      const rooms = Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, i) => room(`rm${i}`, pick([2, 4, 8])));

      const inp: ScheduleInput = { window, rounds, candidates: cands, interviewers, rooms, existing: [] };
      const { assignments, unresolved } = generateSchedule(inp);
      const problems = validateSchedule(inp, assignments);
      expect(problems, `seed ${seed}`).toEqual([]);
      // Every (candidate, round) is either assigned or reported: nothing is lost.
      expect(assignments.length + unresolved.length, `seed ${seed}`).toBe(cands.length * rounds.length);
    }
  });
});

describe("generateOpenSlots", () => {
  it("creates at most the demanded slots, conflict-free, and not before anyone could arrive", () => {
    const inp = fullInput(0);
    const demand = new Map([["r1", 6], ["r2", 6], ["r3", 6]]);
    const slots = generateOpenSlots(inp, demand);
    expect(slots.filter((s) => s.roundId === "r1")).toHaveLength(6);
    expect(validateSchedule(inp, slots.map((s) => ({ ...s, candidateId: null })))).toEqual([]);
    // Round 2 cannot start before round 1 (30m) + gap (15m) after the window opens.
    expect(Math.min(...slots.filter((s) => s.roundId === "r2").map((s) => s.start))).toBeGreaterThanOrEqual(at(9, 45));
    // Round 3 cannot start before 9:00 + 30m + 15m + 45m.
    expect(Math.min(...slots.filter((s) => s.roundId === "r3").map((s) => s.start))).toBeGreaterThanOrEqual(at(10, 30));
  });

  it("stops when resources run out and creates nothing for zero demand", () => {
    const inp = input({
      window: { start: at(9), end: at(10) },
      interviewers: [person("iv", { availability: [{ start: at(9), end: at(10) }] })],
    });
    expect(generateOpenSlots(inp, new Map([["r1", 10]]))).toHaveLength(2);
    expect(generateOpenSlots(inp, new Map())).toHaveLength(0);
  });
});

describe("planReschedule", () => {
  const rounds = [round("r1", 1)];
  const base = (over: Partial<ScheduleInput> = {}) =>
    input({
      rounds,
      candidates: [person("c1"), person("c2")],
      interviewers: [
        // The service carves the unavailable window out of this interviewer before planning.
        person("gone", { availability: [] }),
        person("backup", { availability: allDay }),
      ],
      rooms: [room("room1"), room("room2")],
      ...over,
    });

  const affected = (id: string, cand: string, start: number): BusyInterview => ({
    id, roundId: "r1", candidateId: cand, interviewerId: "gone", roomId: "room1", start, end: start + 30 * MINUTE,
  });

  it("moves into an open slot when one fits, otherwise to a new placement", () => {
    const openSlot: BusyInterview = { id: "slot1", roundId: "r1", candidateId: null, interviewerId: "backup", roomId: "room2", start: at(13), end: at(13, 30) };
    const a1 = affected("a1", "c1", at(9));
    const a2 = affected("a2", "c2", at(9, 30));
    const inp = base({ existing: [openSlot] }); // affected not in existing
    const items = planReschedule(inp, [a1, a2], [openSlot]);
    expect(items[0].outcome.kind).toBe("open_slot");
    expect(items[1].outcome.kind).toBe("new");
    const placed = items[1].outcome as { kind: "new"; placement: { interviewerId: string } };
    expect(placed.placement.interviewerId).toBe("backup");
  });

  it("reports when nothing can take the interview", () => {
    const a1 = affected("a1", "c1", at(9));
    const inp = base({
      interviewers: [person("gone", { availability: [] })],
    });
    const [item] = planReschedule(inp, [a1], []);
    expect(item.outcome.kind).toBe("none");
  });

  it("does not give two affected candidates the same replacement", () => {
    const a1 = affected("a1", "c1", at(9));
    const a2 = affected("a2", "c2", at(9, 30));
    const inp = base();
    const items = planReschedule(inp, [a1, a2], []);
    const starts = items.map((i) => (i.outcome as { placement: { start: number; interviewerId: string } }).placement);
    expect(starts[0].start === starts[1].start && starts[0].interviewerId === starts[1].interviewerId).toBe(false);
  });
});
