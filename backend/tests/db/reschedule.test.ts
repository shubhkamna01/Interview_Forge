import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../../src/db/pool";
import { api, auth, makeScenario, overlapCount, resetDb, type Scenario } from "./helpers";

beforeEach(resetDb);
afterAll(() => pool.end());

interface Row { id: string; starts_at: Date; ends_at: Date; interviewer_id: string; room_id: string; candidate_id: string; status: string }
const live = async (): Promise<Row[]> =>
  (await pool.query("SELECT * FROM interviews WHERE status <> 'cancelled' ORDER BY id")).rows;

const period = (s: Scenario, fromH = 0, toH = 8) => ({
  from: s.window.iso(s.window.start + fromH * 3_600_000),
  to: s.window.iso(s.window.start + toH * 3_600_000),
});

async function busiestInterviewer(s: Scenario) {
  const { rows } = await pool.query("SELECT interviewer_id, count(*)::int AS n FROM interviews WHERE status = 'scheduled' GROUP BY 1 ORDER BY n DESC, 1 LIMIT 1");
  return s.interviewers.find((i) => i.id === rows[0].interviewer_id)!;
}

describe("rescheduling after an interviewer cancels", () => {
  it("previews without changing anything", async () => {
    const s = await makeScenario({ candidates: 4, interviewers: 3 });
    await api().post(`/api/drives/${s.driveId}/schedule`).set(auth(s.coordinator)).expect(200);
    const before = await live();
    const iv = await busiestInterviewer(s);

    const res = await api().post(`/api/drives/${s.driveId}/reschedule/preview`).set(auth(s.coordinator)).send({ interviewerId: iv.id, ...period(s) });
    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(before.filter((r) => r.interviewer_id === iv.id).length);
    expect(res.body.items[0].interview.interviewer.id).toBe(iv.id);
    expect(res.body.items[0].outcome.kind).toMatch(/new|open_slot|none/);
    expect(await live()).toEqual(before);
  });

  it("moves only the affected interviews and leaves everything else exactly as it was", async () => {
    const s = await makeScenario({ candidates: 4, interviewers: 3 });
    await api().post(`/api/drives/${s.driveId}/schedule`).set(auth(s.coordinator)).expect(200);
    const iv = await busiestInterviewer(s);
    const before = await live();
    const untouched = before.filter((r) => r.interviewer_id !== iv.id);

    // Add a fourth interviewer so replacements exist.
    const { signup } = await import("./helpers");
    const spare = await signup("interviewer", "Spare");
    await api().put("/api/auth/me").set(auth(spare)).send({ skills: ["dsa", "hr"] }).expect(200);
    await api().post(`/api/drives/${s.driveId}/join`).set(auth(spare)).expect(204);
    await api().put(`/api/drives/${s.driveId}/availability`).set(auth(spare)).send({ windows: [{ startsAt: s.window.iso(s.window.start), endsAt: s.window.iso(s.window.end) }] }).expect(200);

    const res = await api().post(`/api/drives/${s.driveId}/reschedule/apply`).set(auth(s.coordinator)).send({ interviewerId: iv.id, ...period(s) });
    expect(res.status).toBe(200);
    expect(res.body.unresolved).toBe(0);
    expect(res.body.moved).toBe(res.body.cancelled);

    const after = await live();
    // Unaffected bookings are byte-for-byte the same.
    for (const u of untouched) expect(after.find((r) => r.id === u.id)).toEqual(u);
    // The cancelled interviewer has nothing left; candidates still have all 3 rounds.
    expect(after.some((r) => r.interviewer_id === iv.id)).toBe(false);
    for (const c of s.candidates) expect(after.filter((r) => r.candidate_id === c.id)).toHaveLength(3);
    expect(await overlapCount()).toBe(0);

    // Round order and gaps still hold for everyone.
    const all = (await api().get(`/api/interviews?driveId=${s.driveId}`).set(auth(s.coordinator))).body;
    for (const c of s.candidates) {
      const mine = all.filter((i: { candidate: { id: string } }) => i.candidate.id === c.id).sort((a: { round: { position: number } }, b: { round: { position: number } }) => a.round.position - b.round.position);
      for (let k = 1; k < mine.length; k++) expect(Date.parse(mine[k].startsAt)).toBeGreaterThanOrEqual(Date.parse(mine[k - 1].endsAt) + 15 * 60_000);
    }

    // Affected people are told; the unavailable time is remembered.
    const moved = res.body.items[0].interview.candidate.id;
    const notes = (await api().get("/api/notifications").set(auth(s.candidates.find((c) => c.id === moved)!))).body.items;
    expect(notes.map((n: { kind: string }) => n.kind)).toContain("rescheduled");
    expect((await api().get(`/api/drives/${s.driveId}/availability`).set(auth(iv))).body.windows).toEqual([]);
    expect((await api().get("/api/notifications").set(auth(iv))).body.items.map((n: { kind: string }) => n.kind)).toContain("cancelled");
  });

  it("uses an open slot when one fits", async () => {
    const s = await makeScenario({ candidates: 2, interviewers: 3 });
    await api().post(`/api/drives/${s.driveId}/schedule`).set(auth(s.coordinator)).expect(200);
    // Create spare capacity as open slots: a third candidate-less demand via a new candidate.
    const { signup } = await import("./helpers");
    const extra = await signup("candidate", "Extra");
    await api().post(`/api/drives/${s.driveId}/join`).set(auth(extra)).expect(204);
    await api().post(`/api/drives/${s.driveId}/open-slots`).set(auth(s.coordinator)).expect(200);
    const iv = await busiestInterviewer(s);

    const res = await api().post(`/api/drives/${s.driveId}/reschedule/preview`).set(auth(s.coordinator)).send({ interviewerId: iv.id, ...period(s) });
    expect(res.status).toBe(200);
    const kinds = res.body.items.map((i: { outcome: { kind: string } }) => i.outcome.kind);
    expect(kinds.some((k: string) => k === "open_slot" || k === "new")).toBe(true);
    const applied = await api().post(`/api/drives/${s.driveId}/reschedule/apply`).set(auth(s.coordinator)).send({ interviewerId: iv.id, ...period(s) });
    expect(applied.status).toBe(200);
    expect(await overlapCount()).toBe(0);
  });

  it("reports interviews it cannot move, and tells those candidates", async () => {
    const s = await makeScenario({ candidates: 2, interviewers: 1 }); // only one interviewer: no replacement exists
    await api().post(`/api/drives/${s.driveId}/schedule`).set(auth(s.coordinator)).expect(200);
    const iv = s.interviewers[0];
    const n = (await live()).length;
    expect(n).toBeGreaterThan(0);

    const res = await api().post(`/api/drives/${s.driveId}/reschedule/apply`).set(auth(s.coordinator)).send({ interviewerId: iv.id, ...period(s) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cancelled: n, moved: 0, unresolved: n });
    expect(res.body.items[0].outcome).toMatchObject({ kind: "none" });
    expect(res.body.items[0].outcome.reason).toBeTruthy();
    expect(await live()).toHaveLength(0);
    const notes = (await api().get("/api/notifications").set(auth(s.candidates[0]))).body.items.map((x: { kind: string }) => x.kind);
    expect(notes).toContain("cancelled");
  });

  it("only touches the period given", async () => {
    const s = await makeScenario({ candidates: 4, interviewers: 3 });
    await api().post(`/api/drives/${s.driveId}/schedule`).set(auth(s.coordinator)).expect(200);
    const iv = await busiestInterviewer(s);
    const before = (await live()).filter((r) => r.interviewer_id === iv.id).sort((a, b) => +a.starts_at - +b.starts_at);
    const firstEnd = (+before[0].ends_at - s.window.start) / 3_600_000;

    const res = await api().post(`/api/drives/${s.driveId}/reschedule/preview`).set(auth(s.coordinator)).send({ interviewerId: iv.id, ...period(s, 0, firstEnd) });
    const affected = before.filter((r) => +r.starts_at < s.window.start + firstEnd * 3_600_000).length;
    expect(res.body.affected).toBe(affected);
    expect(affected).toBeLessThan(before.length + 1);
  });

  it("lets interviewers change only their own schedule, and validates input", async () => {
    const s = await makeScenario({ candidates: 2, interviewers: 3 });
    await api().post(`/api/drives/${s.driveId}/schedule`).set(auth(s.coordinator)).expect(200);
    const [a, b] = s.interviewers;
    const url = `/api/drives/${s.driveId}/reschedule/preview`;
    expect((await api().post(url).set(auth(a)).send({ interviewerId: b.id, ...period(s) })).status).toBe(403);
    expect((await api().post(url).set(auth(a)).send({ interviewerId: a.id, ...period(s) })).status).toBe(200);
    expect((await api().post(url).set(auth(s.candidates[0])).send({ interviewerId: a.id, ...period(s) })).status).toBe(403);
    expect((await api().post(url).set(auth(s.coordinator)).send({ interviewerId: a.id, from: period(s).to, to: period(s).from })).status).toBe(400);
    expect((await api().post(url).set(auth(s.coordinator)).send({ interviewerId: "nope", ...period(s) })).status).toBe(400);
    expect((await api().post(url).set(auth(s.coordinator)).send({ interviewerId: s.candidates[0].id, ...period(s) })).status).toBe(404);
  });
});
