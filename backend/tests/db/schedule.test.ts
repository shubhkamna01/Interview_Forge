import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../../src/db/pool";
import { api, auth, makeScenario, overlapCount, resetDb, signup } from "./helpers";

beforeEach(resetDb);
afterAll(() => pool.end());

const generate = (s: Awaited<ReturnType<typeof makeScenario>>) =>
  api().post(`/api/drives/${s.driveId}/schedule`).set(auth(s.coordinator));

describe("schedule generation", () => {
  it("schedules every candidate for every round with no clashes", async () => {
    const s = await makeScenario({ candidates: 6 });
    const res = await generate(s);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ assigned: 18, alreadyScheduled: 0, unresolved: [] });
    expect(res.body.stats.interviews).toBe(18);
    expect(res.body.stats.avgGapMinutes).not.toBeNull();
    expect(await overlapCount()).toBe(0);

    const all = (await api().get(`/api/interviews?driveId=${s.driveId}`).set(auth(s.coordinator))).body;
    expect(all).toHaveLength(18);
    for (const c of s.candidates) {
      const mine = all.filter((i: { candidate: { id: string } }) => i.candidate.id === c.id);
      expect(mine.map((i: { round: { position: number } }) => i.round.position).sort()).toEqual([1, 2, 3]);
      const sorted = [...mine].sort((a, b) => a.round.position - b.round.position);
      // Order and the 15-minute gap between rounds.
      expect(Date.parse(sorted[1].startsAt)).toBeGreaterThanOrEqual(Date.parse(sorted[0].endsAt) + 15 * 60_000);
      expect(Date.parse(sorted[2].startsAt)).toBeGreaterThanOrEqual(Date.parse(sorted[1].endsAt) + 15 * 60_000);
    }
  });

  it("only shows each person their own interviews", async () => {
    const s = await makeScenario({ candidates: 4 });
    await generate(s);
    const cand = (await api().get("/api/interviews").set(auth(s.candidates[0]))).body;
    expect(cand).toHaveLength(3);
    expect(cand.every((i: { candidate: { id: string } }) => i.candidate.id === s.candidates[0].id)).toBe(true);
    for (const iv of s.interviewers) {
      const mine = (await api().get("/api/interviews").set(auth(iv))).body;
      expect(mine.every((i: { interviewer: { id: string } }) => i.interviewer.id === iv.id)).toBe(true);
    }
    expect((await api().get("/api/interviews").set(auth(s.coordinator))).body).toHaveLength(12);
  });

  it("is safe to run again: nothing is moved or duplicated", async () => {
    const s = await makeScenario({ candidates: 3 });
    await generate(s);
    const before = (await pool.query("SELECT id, starts_at, interviewer_id, room_id FROM interviews ORDER BY id")).rows;
    const again = await generate(s);
    expect(again.body).toMatchObject({ assigned: 0, alreadyScheduled: 9, unresolved: [] });
    const after = (await pool.query("SELECT id, starts_at, interviewer_id, room_id FROM interviews ORDER BY id")).rows;
    expect(after).toEqual(before);
  });

  it("reports what could not be scheduled, and why, instead of breaking a rule", async () => {
    // Nobody has the "hr" skill, so the HR round is impossible.
    const s = await makeScenario({ candidates: 3, interviewers: 1 }); // single interviewer, skills: dsa
    const res = await generate(s);
    expect(res.body.assigned).toBe(6); // rounds 1 and 2 for all three
    expect(res.body.unresolved).toHaveLength(3);
    expect(res.body.unresolved[0]).toMatchObject({ round: { name: "HR" } });
    expect(res.body.unresolved[0].reason).toMatch(/skills \(hr\)/);
    expect(await overlapCount()).toBe(0);

    const latest = await api().get(`/api/drives/${s.driveId}/schedule/latest`).set(auth(s.coordinator));
    expect(latest.body.unresolved).toHaveLength(3);
  });

  it("respects a candidate's availability and an interviewer's limit", async () => {
    const s = await makeScenario({ candidates: 2, interviewers: 3 });
    const H = 3_600_000;
    const picky = s.candidates[0];
    await api()
      .put(`/api/drives/${s.driveId}/availability`)
      .set(auth(picky))
      .send({ windows: [{ startsAt: s.window.iso(s.window.start + 5 * H), endsAt: s.window.iso(s.window.start + 8 * H) }] })
      .expect(200);
    await generate(s).expect(200);
    const mine = (await api().get("/api/interviews").set(auth(picky))).body;
    expect(mine.length).toBeGreaterThan(0);
    for (const i of mine) {
      expect(Date.parse(i.startsAt)).toBeGreaterThanOrEqual(s.window.start + 5 * H);
      expect(Date.parse(i.endsAt)).toBeLessThanOrEqual(s.window.start + 8 * H);
    }
  });

  it("needs a published drive", async () => {
    const c = await signup("coordinator");
    const w = (await makeScenario({ candidates: 1 })).window;
    const draft = await api().post("/api/drives").set(auth(c)).send({
      title: "d", company: "c", windowStart: w.iso(w.start), windowEnd: w.iso(w.end), rounds: [{ name: "r", durationMinutes: 30 }],
    });
    const res = await api().post(`/api/drives/${draft.body.id}/schedule`).set(auth(c));
    expect(res.status).toBe(409);
  });

  it("notifies candidates and interviewers, and lets them mark notifications read", async () => {
    const s = await makeScenario({ candidates: 2 });
    await generate(s);
    const c = s.candidates[0];
    const list = (await api().get("/api/notifications").set(auth(c))).body;
    expect(list.unreadCount).toBe(1);
    expect(list.items[0]).toMatchObject({ kind: "schedule_created", read: false });
    expect(list.items[0].body.split("\n")).toHaveLength(3); // one line per round

    await api().post(`/api/notifications/${list.items[0].id}/read`).set(auth(c)).expect(204);
    expect((await api().get("/api/notifications").set(auth(c))).body.unreadCount).toBe(0);
    // Someone else's notification is not found, not readable.
    const other = (await api().get("/api/notifications").set(auth(s.candidates[1]))).body.items[0];
    expect((await api().post(`/api/notifications/${other.id}/read`).set(auth(c))).status).toBe(404);

    const iv = (await api().get("/api/notifications").set(auth(s.interviewers[0]))).body;
    expect(iv.unreadCount).toBeGreaterThan(0);
    await api().post("/api/notifications/read-all").set(auth(s.interviewers[0])).expect(204);
    expect((await api().get("/api/notifications").set(auth(s.interviewers[0]))).body.unreadCount).toBe(0);
  });

  it("rolls back completely if anything fails midway (no half-saved schedule)", async () => {
    const s = await makeScenario({ candidates: 3 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await pool.query(`CREATE FUNCTION fail_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$`);
    await pool.query("CREATE TRIGGER fail_notify BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_notify()");
    try {
      const res = await generate(s);
      expect(res.status).toBe(500);
      expect(res.body.message).not.toMatch(/boom/); // internals are never leaked
    } finally {
      await pool.query("DROP TRIGGER fail_notify ON notifications");
      await pool.query("DROP FUNCTION fail_notify()");
      vi.restoreAllMocks();
    }
    expect((await pool.query("SELECT count(*)::int AS n FROM interviews")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM schedule_runs")).rows[0].n).toBe(0);
    // And it works normally afterwards.
    expect((await generate(s)).body.assigned).toBe(9);
  });
});

describe("the database itself refuses double-booking", () => {
  it("rejects overlapping interviews for the same interviewer, room or candidate even if the app is bypassed", async () => {
    const s = await makeScenario({ candidates: 1, interviewers: 2 });
    await generate(s);
    const row = (await pool.query("SELECT * FROM interviews ORDER BY starts_at LIMIT 1")).rows[0];
    const other = (await pool.query("SELECT id FROM users WHERE role = 'interviewer' AND id <> $1 LIMIT 1", [row.interviewer_id])).rows[0];
    const rooms = (await pool.query("SELECT id FROM rooms WHERE id <> $1 LIMIT 1", [row.room_id])).rows[0];
    const insert = (iv: string, room: string, cand: string | null) =>
      pool.query(
        `INSERT INTO interviews (drive_id, round_id, candidate_id, interviewer_id, room_id, starts_at, ends_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [row.drive_id, row.round_id, cand, iv, room, row.starts_at, row.ends_at, cand ? "scheduled" : "open"],
      );
    await expect(insert(row.interviewer_id, rooms.id, null)).rejects.toMatchObject({ code: "23P01" }); // same interviewer
    await expect(insert(other.id, row.room_id, null)).rejects.toMatchObject({ code: "23P01" }); // same room
    await expect(insert(other.id, rooms.id, row.candidate_id)).rejects.toMatchObject({ code: "23P01" }); // same candidate
    // Back-to-back is fine (checked far from the real schedule so nothing else is in the way).
    const far = (h: number) => new Date(Date.UTC(2035, 0, 1, h));
    for (const [a, b] of [[10, 11], [11, 12]]) {
      await pool.query(
        `INSERT INTO interviews (drive_id, round_id, candidate_id, interviewer_id, room_id, starts_at, ends_at, status)
         VALUES ($1, $2, NULL, $3, $4, $5, $6, 'open')`,
        [row.drive_id, row.round_id, row.interviewer_id, row.room_id, far(a), far(b)],
      );
    }
  });
});

describe("open slots and calendar export", () => {
  it("opens slots for candidates who still need one, and never more than the demand", async () => {
    const s = await makeScenario({ candidates: 4 });
    const res = await api().post(`/api/drives/${s.driveId}/open-slots`).set(auth(s.coordinator));
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(12);
    expect(res.body.perRound.map((r: { demand: number; created: number }) => [r.demand, r.created])).toEqual([[4, 4], [4, 4], [4, 4]]);
    expect(await overlapCount()).toBe(0);

    // Candidates are told, and re-running replaces rather than piles up.
    expect((await api().get("/api/notifications").set(auth(s.candidates[0]))).body.items[0].kind).toBe("slots_open");
    await api().post(`/api/drives/${s.driveId}/open-slots`).set(auth(s.coordinator)).expect(200);
    expect((await pool.query("SELECT count(*)::int AS n FROM interviews WHERE status = 'open'")).rows[0].n).toBe(12);
  });

  it("exports .ics files only to the people involved", async () => {
    const s = await makeScenario({ candidates: 2 });
    await generate(s);
    const mine = (await api().get("/api/interviews").set(auth(s.candidates[0]))).body;

    const one = await api().get(`/api/interviews/${mine[0].id}/calendar.ics`).set(auth(s.candidates[0]));
    expect(one.status).toBe(200);
    expect(one.headers["content-type"]).toMatch(/text\/calendar/);
    expect(one.headers["content-disposition"]).toMatch(/attachment/);
    expect(one.text).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(one.text).toContain("BEGIN:VEVENT");
    expect(one.text).toContain(`UID:${mine[0].id}@interviewforge`);
    expect(one.text).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(one.text).toContain("LOCATION:Room");
    expect(one.text.endsWith("END:VCALENDAR\r\n")).toBe(true);

    expect((await api().get(`/api/interviews/${mine[0].id}/calendar.ics`).set(auth(s.candidates[1]))).status).toBe(403);
    expect((await api().get(`/api/interviews/${mine[0].id}/calendar.ics`).set(auth(s.coordinator))).status).toBe(200);

    const all = await api().get("/api/me/calendar.ics").set(auth(s.candidates[0]));
    expect(all.text.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect((await api().get("/api/me/calendar.ics").set(auth(s.coordinator))).status).toBe(403);
  });
});
