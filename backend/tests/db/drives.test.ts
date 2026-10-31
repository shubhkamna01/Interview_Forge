import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../../src/db/pool";
import { api, auth, makeScenario, resetDb, signup, windowFromNow } from "./helpers";

beforeEach(resetDb);
afterAll(() => pool.end());

const w = windowFromNow();
const body = (over: Record<string, unknown> = {}) => ({
  title: "Campus Drive",
  company: "TechCorp",
  windowStart: w.iso(w.start),
  windowEnd: w.iso(w.end),
  rounds: [
    { name: "OA", type: "online_assessment", durationMinutes: 30 },
    { name: "Tech", type: "technical", durationMinutes: 45, requiredSkills: [" DSA "], minGapMinutes: 15 },
  ],
  ...over,
});

describe("creating a drive", () => {
  it("saves the drive with ordered rounds and normalised skills", async () => {
    const c = await signup("coordinator");
    const res = await api().post("/api/drives").set(auth(c)).send(body());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.rounds.map((r: { name: string; position: number }) => [r.position, r.name])).toEqual([[1, "OA"], [2, "Tech"]]);
    expect(res.body.rounds[1]).toMatchObject({ requiredSkills: ["dsa"], minGapMinutes: 15, durationMinutes: 45 });
    expect(res.body.counts).toEqual({ candidates: 0, interviewers: 0, interviews: 0, openSlots: 0 });
  });

  it("rejects invalid drives with a readable message", async () => {
    const c = await signup("coordinator");
    const post = (b: object) => api().post("/api/drives").set(auth(c)).send(b);
    expect((await post(body({ rounds: [] }))).body.message).toMatch(/at least one/i);
    expect((await post(body({ windowEnd: w.iso(w.start - 1000) }))).status).toBe(400);
    expect((await post(body({ title: "  " }))).status).toBe(400);
    expect((await post(body({ rounds: [{ name: "x", durationMinutes: 2 }] }))).status).toBe(400);
    const tooLong = await post(body({ rounds: [{ name: "x", durationMinutes: 400 }, { name: "y", durationMinutes: 400 }] }));
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.message).toMatch(/window is only/);
  });
});

describe("draft and published drives", () => {
  it("hides drafts from candidates until published, and locks editing after", async () => {
    const c = await signup("coordinator");
    const cand = await signup("candidate");
    const drive = (await api().post("/api/drives").set(auth(c)).send(body())).body;

    expect((await api().get("/api/drives").set(auth(cand))).body).toEqual([]);
    expect((await api().get(`/api/drives/${drive.id}`).set(auth(cand))).status).toBe(404);
    expect((await api().post(`/api/drives/${drive.id}/join`).set(auth(cand))).status).toBe(404);

    expect((await api().put(`/api/drives/${drive.id}`).set(auth(c)).send(body({ title: "Renamed" }))).body.title).toBe("Renamed");
    await api().post(`/api/drives/${drive.id}/publish`).set(auth(c)).expect(200);

    const list = (await api().get("/api/drives").set(auth(cand))).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "Renamed", joined: false });
    expect(list[0].counts).toBeUndefined();

    expect((await api().put(`/api/drives/${drive.id}`).set(auth(c)).send(body())).status).toBe(409);
    expect((await api().delete(`/api/drives/${drive.id}`).set(auth(c))).status).toBe(409);
    await api().post(`/api/drives/${drive.id}/unpublish`).set(auth(c)).expect(200);
    await api().delete(`/api/drives/${drive.id}`).set(auth(c)).expect(204);
  });

  it("won't unpublish a drive that has scheduled interviews", async () => {
    const s = await makeScenario({ candidates: 2 });
    await api().post(`/api/drives/${s.driveId}/schedule`).set(auth(s.coordinator)).expect(200);
    const res = await api().post(`/api/drives/${s.driveId}/unpublish`).set(auth(s.coordinator));
    expect(res.status).toBe(409);
  });
});

describe("joining and availability", () => {
  it("lets people join, shows counts, and requires joining before setting availability", async () => {
    const s = await makeScenario({ candidates: 2, interviewers: 2 });
    const stranger = await signup("candidate");
    expect((await api().get(`/api/drives/${s.driveId}/availability`).set(auth(stranger))).status).toBe(409);
    expect((await api().put(`/api/drives/${s.driveId}/availability`).set(auth(stranger)).send({ windows: [] })).status).toBe(409);

    const drive = (await api().get(`/api/drives/${s.driveId}`).set(auth(s.coordinator))).body;
    expect(drive.counts).toMatchObject({ candidates: 2, interviewers: 2 });

    const people = (await api().get(`/api/drives/${s.driveId}/participants`).set(auth(s.coordinator))).body;
    expect(people.candidates).toHaveLength(2);
    expect(people.interviewers.map((i: { skills: string[] }) => i.skills)).toContainEqual(["dsa"]);
  });

  it("validates windows, merges overlaps, and stores an interviewer's limit", async () => {
    const s = await makeScenario({ candidates: 1, interviewers: 1 });
    const iv = s.interviewers[0];
    const put = (b: object) => api().put(`/api/drives/${s.driveId}/availability`).set(auth(iv)).send(b);
    const H = 3_600_000;

    expect((await put({ windows: [{ startsAt: w.iso(w.start - H), endsAt: w.iso(w.start + H) }] })).status).toBe(400);
    expect((await put({ windows: [{ startsAt: w.iso(w.start + H), endsAt: w.iso(w.start + H) }] })).status).toBe(400);

    const ok = await put({
      maxInterviews: 5,
      windows: [
        { startsAt: w.iso(w.start + 3 * H), endsAt: w.iso(w.start + 5 * H) },
        { startsAt: w.iso(w.start + H), endsAt: w.iso(w.start + 4 * H) },
      ],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.maxInterviews).toBe(5);
    expect(ok.body.windows).toEqual([{ startsAt: w.iso(w.start + H), endsAt: w.iso(w.start + 5 * H) }]); // merged into one

    expect((await put({ maxInterviews: 0, windows: [] })).status).toBe(400);
  });

  it("won't let someone leave a drive while they have interviews", async () => {
    const s = await makeScenario({ candidates: 1 });
    await api().post(`/api/drives/${s.driveId}/schedule`).set(auth(s.coordinator)).expect(200);
    const res = await api().delete(`/api/drives/${s.driveId}/join`).set(auth(s.candidates[0]));
    expect(res.status).toBe(409);
  });
});

describe("rooms", () => {
  it("creates, updates, rejects duplicates and protects rooms in use", async () => {
    const c = await signup("coordinator");
    const room = (await api().post("/api/rooms").set(auth(c)).send({ name: "Lab A", capacity: 6 }).expect(201)).body;
    expect((await api().post("/api/rooms").set(auth(c)).send({ name: "lab a", capacity: 2 })).status).toBe(409);
    expect((await api().post("/api/rooms").set(auth(c)).send({ name: "X", capacity: 0 })).status).toBe(400);
    expect((await api().post("/api/rooms").set(auth(c)).send({ name: "X", capacity: 2.5 })).status).toBe(400);
    expect((await api().put(`/api/rooms/${room.id}`).set(auth(c)).send({ name: "Lab B", capacity: 8 })).body).toMatchObject({ name: "Lab B", capacity: 8 });
    await api().delete(`/api/rooms/${room.id}`).set(auth(c)).expect(204);
    expect((await api().get("/api/rooms").set(auth(c))).body).toEqual([]);

    const s = await makeScenario({ candidates: 1, rooms: 1 });
    await api().post(`/api/drives/${s.driveId}/schedule`).set(auth(s.coordinator)).expect(200);
    const rooms = (await api().get("/api/rooms").set(auth(s.coordinator))).body;
    expect((await api().delete(`/api/rooms/${rooms[0].id}`).set(auth(s.coordinator))).status).toBe(409);
  });
});
