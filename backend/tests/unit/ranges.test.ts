import { describe, expect, it } from "vitest";
import { checkSlotForCandidate } from "../../src/scheduling/eligibility";
import { contains, mergeRanges, subtractRange } from "../../src/scheduling/ranges";
import { MINUTE } from "../../src/scheduling/types";
import { at, round } from "./builders";

describe("ranges", () => {
  it("contains requires the whole interval inside one window", () => {
    expect(contains([{ start: 0, end: 10 }], 2, 10)).toBe(true);
    expect(contains([{ start: 0, end: 10 }], 2, 11)).toBe(false);
    expect(contains([{ start: 0, end: 5 }, { start: 5, end: 10 }], 2, 8)).toBe(false); // spans two windows
  });

  it("mergeRanges joins overlapping and touching ranges", () => {
    expect(mergeRanges([{ start: 5, end: 8 }, { start: 0, end: 5 }, { start: 7, end: 9 }, { start: 20, end: 30 }])).toEqual([
      { start: 0, end: 9 },
      { start: 20, end: 30 },
    ]);
  });

  it("subtractRange splits, trims and removes", () => {
    expect(subtractRange([{ start: 0, end: 10 }], { start: 3, end: 6 })).toEqual([{ start: 0, end: 3 }, { start: 6, end: 10 }]);
    expect(subtractRange([{ start: 0, end: 10 }], { start: 0, end: 10 })).toEqual([]);
    expect(subtractRange([{ start: 0, end: 10 }], { start: 20, end: 30 })).toEqual([{ start: 0, end: 10 }]);
    expect(subtractRange([{ start: 0, end: 10 }], { start: 8, end: 20 })).toEqual([{ start: 0, end: 8 }]);
  });
});

describe("checkSlotForCandidate", () => {
  const rounds = [round("r1", 1), round("r2", 2, { minGapMs: 15 * MINUTE })];
  const window = { start: at(9), end: at(17) };
  const base = {
    rounds,
    window,
    byRound: new Map<string, { start: number; end: number }>(),
    otherInterviews: [] as { start: number; end: number }[],
    availability: null as { start: number; end: number }[] | null,
    now: at(8),
  };
  const slot = (roundId: string, h: number, m = 0) => ({ roundId, start: at(h, m), end: at(h, m + 30) });

  it("accepts the next round when everything fits", () => {
    expect(checkSlotForCandidate({ ...base, slot: slot("r1", 10) })).toEqual({ ok: true });
  });

  it("enforces round order", () => {
    const r = checkSlotForCandidate({ ...base, slot: slot("r2", 11) });
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toMatch(/Book "Round 1" first/);
  });

  it("blocks a second booking for the same round", () => {
    const byRound = new Map([["r1", { start: at(9), end: at(9, 30) }]]);
    const r = checkSlotForCandidate({ ...base, byRound, slot: slot("r1", 12) });
    expect((r as { reason: string }).reason).toMatch(/already have/);
  });

  it("enforces the gap after the previous round", () => {
    const byRound = new Map([["r1", { start: at(9), end: at(9, 30) }]]);
    expect(checkSlotForCandidate({ ...base, byRound, slot: slot("r2", 9, 40) })).toMatchObject({ ok: false });
    expect(checkSlotForCandidate({ ...base, byRound, slot: slot("r2", 9, 45) })).toEqual({ ok: true });
  });

  it("enforces availability, overlap, started slots and the window", () => {
    expect(checkSlotForCandidate({ ...base, availability: [{ start: at(14), end: at(15) }], slot: slot("r1", 10) })).toMatchObject({ ok: false });
    expect(checkSlotForCandidate({ ...base, otherInterviews: [{ start: at(10), end: at(10, 15) }], slot: slot("r1", 10) })).toMatchObject({ ok: false });
    expect(checkSlotForCandidate({ ...base, now: at(10, 5), slot: slot("r1", 10) })).toMatchObject({ ok: false });
    expect(checkSlotForCandidate({ ...base, slot: slot("r1", 18) })).toMatchObject({ ok: false });
  });
});
