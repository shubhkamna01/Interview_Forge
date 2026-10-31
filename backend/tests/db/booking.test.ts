import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../../src/db/pool";
import { api, auth, makeScenario, overlapCount, resetDb, type Account, type Scenario } from "./helpers";

beforeEach(resetDb);
afterAll(() => pool.end());

interface Slot { id: string; startsAt: string; endsAt: string; round: { position: number; name: string } }

async function openSlots(s: Scenario) {
  await api().post(`/api/drives/${s.driveId}/open-slots`).set(auth(s.coordinator)).expect(200);
}
const eligible = async (s: Scenario, c: Account): Promise<Slot[]> =>
  (await api().get(`/api/drives/${s.driveId}/slots`).set(auth(c))).body;
const book = (c: Account, slotId: string, key?: string) => {
  const r = api().post(`/api/interviews/${slotId}/book`).set(auth(c));
  return key ? r.set("Idempotency-Key", key) : r;
};
const statusOf = async (id: string) => (await pool.query("SELECT status, candidate_id FROM interviews WHERE id = $1", [id])).rows[0];

describe("self-booking", () => {
  it("shows only the slots a candidate may take, and books one", async () => {
    const s = await makeScenario({ candidates: 3 });
    await openSlots(s);
    const c = s.candidates[0];
    const slots = await eligible(s, c);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((x) => x.round.position === 1)).toBe(true); // only the next round is bookable

    const res = await book(c, slots[0].id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: slots[0].id, status: "scheduled", bookedVia: "self_booking", candidate: { id: c.id } });

    // Booked: notifications for both sides, and the next round now opens up with the required gap.
    expect((await api().get("/api/notifications").set(auth(c))).body.items.map((n: { kind: string }) => n.kind)).toContain("booking_confirmed");
    const next = await eligible(s, c);
    expect(next.length).toBeGreaterThan(0);
    for (const x of next) {
      expect(x.round.position).toBe(2);
      expect(Date.parse(x.startsAt)).toBeGreaterThanOrEqual(Date.parse(res.body.endsAt) + 15 * 60_000);
    }
  });

  it("enforces round order, one booking per round, and role/ownership rules", async () => {
    const s = await makeScenario({ candidates: 2 });
    await openSlots(s);
    const c = s.candidates[0];
    const all = (await pool.query("SELECT i.id, r.position FROM interviews i JOIN rounds r ON r.id = i.round_id WHERE i.status = 'open' ORDER BY i.starts_at")).rows;
    const r2 = all.find((x) => x.position === 2);

    const early = await book(c, r2.id);
    expect(early.status).toBe(409);
    expect(early.body.message).toMatch(/Book "Online Assessment" first/);

    const r1 = all.filter((x) => x.position === 1);
    await book(c, r1[0].id).expect(200);
    const twice = await book(c, r1[1].id);
    expect(twice.status).toBe(409);
    expect(twice.body.message).toMatch(/already have an interview for this round/);

    expect((await api().post(`/api/interviews/${r1[1].id}/book`).set(auth(s.interviewers[0]))).status).toBe(403);
    expect((await api().post(`/api/interviews/${r1[1].id}/book`).set(auth(s.coordinator))).status).toBe(403);
    expect((await api().post(`/api/interviews/00000000-0000-4000-8000-000000000000/book`).set(auth(c))).status).toBe(404);
    expect((await book(c, r1[1].id, "short")).status).toBe(400); // key too short
  });

  it("won't let someone who hasn't joined the drive book", async () => {
    const s = await makeScenario({ candidates: 1 });
    await openSlots(s);
    const { signup } = await import("./helpers");
    const outsider = await signup("candidate");
    const slot = (await pool.query("SELECT id FROM interviews WHERE status = 'open' LIMIT 1")).rows[0];
    expect((await book(outsider, slot.id)).status).toBe(409);
  });

  it("lets a candidate cancel, frees the slot for others, and protects round order", async () => {
    const s = await makeScenario({ candidates: 2 });
    await openSlots(s);
    const [a, b] = s.candidates;
    const first = (await eligible(s, a))[0];
    await book(a, first.id).expect(200);

    expect((await api().post(`/api/interviews/${first.id}/cancel-booking`).set(auth(b))).status).toBe(403);

    // With round 2 booked, round 1 can no longer be cancelled.
    const second = (await eligible(s, a))[0];
    await book(a, second.id).expect(200);
    const blocked = await api().post(`/api/interviews/${first.id}/cancel-booking`).set(auth(a));
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/later rounds first/);

    await api().post(`/api/interviews/${second.id}/cancel-booking`).set(auth(a)).expect(200);
    expect(await statusOf(second.id)).toMatchObject({ status: "open", candidate_id: null });
    await api().post(`/api/interviews/${first.id}/cancel-booking`).set(auth(s.coordinator)).expect(200); // coordinator may too

    // Someone else can now take the freed slot.
    await book(b, first.id).expect(200);
  });
});

describe("concurrency: the booking is safe when many people click at once", () => {
  it("lets exactly one of 12 simultaneous candidates have the same slot", async () => {
    const s = await makeScenario({ candidates: 12 });
    await openSlots(s);
    const target = (await eligible(s, s.candidates[0]))[0];

    const results = await Promise.all(s.candidates.map((c) => book(c, target.id)));
    const codes = results.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(11);
    for (const r of results.filter((r) => r.status === 409)) expect(r.body.message).toMatch(/just taken/);

    const winner = results.find((r) => r.status === 200)!.body.candidate.id;
    expect(await statusOf(target.id)).toMatchObject({ status: "scheduled", candidate_id: winner });
    expect((await pool.query("SELECT count(*)::int AS n FROM interviews WHERE id = $1 AND candidate_id IS NOT NULL", [target.id])).rows[0].n).toBe(1);
    // The 11 losers got no notification and no half-written data.
    expect((await pool.query("SELECT count(*)::int AS n FROM notifications WHERE kind = 'booking_confirmed'")).rows[0].n).toBe(1);
    expect(await overlapCount()).toBe(0);
  });

  it("treats retries with the same Idempotency-Key as one booking", async () => {
    const s = await makeScenario({ candidates: 2 });
    await openSlots(s);
    const c = s.candidates[0];
    const slot = (await eligible(s, c))[0];
    const key = randomUUID();

    const results = await Promise.all(Array.from({ length: 6 }, () => book(c, slot.id, key)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM interviews WHERE candidate_id = $1", [c.id])).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND kind = 'booking_confirmed'", [c.id])).rows[0].n).toBe(1);

    // A later retry (after everything finished) still returns the original answer.
    expect((await book(c, slot.id, key)).body.id).toBe(slot.id);
    // The same key for a different slot is refused.
    const other = (await pool.query("SELECT id FROM interviews WHERE status = 'open' AND id <> $1 LIMIT 1", [slot.id])).rows[0];
    expect((await book(c, other.id, key)).status).toBe(409);
  });

  it("stops one candidate taking two overlapping slots at once, and leaves the loser untouched", async () => {
    const s = await makeScenario({ candidates: 3, interviewers: 3 }); // 3 candidates => 3 round-1 slots at once
    await openSlots(s);
    const c = s.candidates[0];
    const slots = await eligible(s, c);
    const sameTime = slots.filter((x) => x.startsAt === slots[0].startsAt);
    expect(sameTime.length).toBeGreaterThanOrEqual(2);

    const results = await Promise.all(sameTime.map((x) => book(c, x.id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(sameTime.length - 1);

    const mine = (await pool.query("SELECT id FROM interviews WHERE candidate_id = $1 AND status <> 'cancelled'", [c.id])).rows;
    expect(mine).toHaveLength(1);
    // Rollback check: every losing slot is still open and unowned.
    for (const x of sameTime.filter((x) => x.id !== mine[0].id)) {
      expect(await statusOf(x.id)).toMatchObject({ status: "open", candidate_id: null });
    }
    expect(await overlapCount()).toBe(0);
  });

  it("keeps every rule intact under a 36-request free-for-all", async () => {
    const s = await makeScenario({ candidates: 12 });
    await openSlots(s);
    const slots = await eligible(s, s.candidates[0]);
    expect(slots.length).toBe(12);

    // Each candidate tries three different slots at the same moment.
    const requests = s.candidates.flatMap((c, i) => [0, 4, 8].map((k) => book(c, slots[(i + k) % slots.length].id)));
    const results = await Promise.all(requests);
    for (const r of results) expect([200, 409]).toContain(r.status);
    expect(results.filter((r) => r.status === 200).length).toBeGreaterThan(0);

    const perSlot = (await pool.query("SELECT id, count(candidate_id)::int AS n FROM interviews WHERE status <> 'cancelled' GROUP BY id HAVING count(candidate_id) > 1")).rows;
    expect(perSlot).toEqual([]);
    const perCandidate = (await pool.query("SELECT candidate_id, round_id, count(*)::int AS n FROM interviews WHERE candidate_id IS NOT NULL AND status <> 'cancelled' GROUP BY 1, 2 HAVING count(*) > 1")).rows;
    expect(perCandidate).toEqual([]);
    expect(await overlapCount()).toBe(0);
    const booked = (await pool.query("SELECT count(*)::int AS n FROM interviews WHERE status = 'scheduled'")).rows[0].n;
    expect(booked).toBe(results.filter((r) => r.status === 200).length);
  });
});
