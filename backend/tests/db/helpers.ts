import request from "supertest";
import { createApp } from "../../src/app";
import { pool } from "../../src/db/pool";

export const app = createApp();
export const api = () => request(app);

export async function resetDb() {
  await pool.query(
    "TRUNCATE notifications, idempotency_keys, schedule_runs, interviews, availability, drive_participants, rounds, drives, rooms, users RESTART IDENTITY CASCADE",
  );
}

export interface Account {
  id: string;
  token: string;
  name: string;
}

let n = 0;
export async function signup(role: "candidate" | "interviewer" | "coordinator", name?: string): Promise<Account> {
  const label = name ?? `${role}${++n}`;
  const res = await api()
    .post("/api/auth/signup")
    .send({
      name: label,
      email: `${label.toLowerCase().replace(/\s+/g, ".")}-${++n}@example.com`,
      password: "password123",
      role,
      accessCode: role === "coordinator" ? "team-code-123" : undefined,
    });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.user.id, token: res.body.token, name: label };
}

export const auth = (a: Account) => ({ Authorization: `Bearer ${a.token}` });

const H = 3_600_000;
/** A drive starting `startInHours` from now, `lengthHours` long, aligned to the hour. */
export function windowFromNow(startInHours = 24, lengthHours = 8) {
  const start = Math.ceil((Date.now() + startInHours * H) / H) * H;
  return { start, end: start + lengthHours * H, iso: (t: number) => new Date(t).toISOString() };
}

export interface Scenario {
  coordinator: Account;
  interviewers: Account[];
  candidates: Account[];
  driveId: string;
  roundIds: string[];
  window: ReturnType<typeof windowFromNow>;
}

/**
 * A published drive with rooms, 3 rounds, interviewers (all day) and candidates, everyone joined.
 * Round 1: 30 min, no skill. Round 2: 45 min, "dsa", 15 min gap. Round 3: 30 min, "hr", 15 min gap.
 */
export async function makeScenario(opts: { candidates?: number; interviewers?: number; rooms?: number } = {}): Promise<Scenario> {
  const coordinator = await signup("coordinator", "Coord");
  const window = windowFromNow();

  for (let i = 1; i <= (opts.rooms ?? 3); i++) {
    await api().post("/api/rooms").set(auth(coordinator)).send({ name: `Room ${i}`, capacity: 4 }).expect(201);
  }

  const created = await api()
    .post("/api/drives")
    .set(auth(coordinator))
    .send({
      title: "Campus Drive",
      company: "TechCorp",
      windowStart: window.iso(window.start),
      windowEnd: window.iso(window.end),
      rounds: [
        { name: "Online Assessment", type: "online_assessment", durationMinutes: 30 },
        { name: "Technical", type: "technical", durationMinutes: 45, requiredSkills: ["dsa"], minGapMinutes: 15 },
        { name: "HR", type: "hr", durationMinutes: 30, requiredSkills: ["hr"], minGapMinutes: 15 },
      ],
    })
    .expect(201);
  const driveId: string = created.body.id;
  await api().post(`/api/drives/${driveId}/publish`).set(auth(coordinator)).expect(200);

  const interviewers: Account[] = [];
  const skillSets = [["dsa"], ["dsa", "hr"], ["hr"], ["dsa"]];
  for (let i = 0; i < (opts.interviewers ?? 3); i++) {
    const iv = await signup("interviewer", `Interviewer ${i + 1}`);
    await api().put("/api/auth/me").set(auth(iv)).send({ skills: skillSets[i % skillSets.length] }).expect(200);
    await api().post(`/api/drives/${driveId}/join`).set(auth(iv)).expect(204);
    await api()
      .put(`/api/drives/${driveId}/availability`)
      .set(auth(iv))
      .send({ windows: [{ startsAt: window.iso(window.start), endsAt: window.iso(window.end) }] })
      .expect(200);
    interviewers.push(iv);
  }

  const candidates: Account[] = [];
  for (let i = 0; i < (opts.candidates ?? 4); i++) {
    const c = await signup("candidate", `Candidate ${i + 1}`);
    await api().post(`/api/drives/${driveId}/join`).set(auth(c)).expect(204);
    candidates.push(c);
  }

  const roundIds = (await api().get(`/api/drives/${driveId}`).set(auth(coordinator))).body.rounds.map((r: { id: string }) => r.id);
  return { coordinator, interviewers, candidates, driveId, roundIds, window };
}

/** Counts pairs of live interviews that overlap for the same interviewer, room or candidate. Must always be 0. */
export async function overlapCount(): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(`
    SELECT count(*)::int AS n FROM interviews a JOIN interviews b
      ON a.id < b.id AND a.status <> 'cancelled' AND b.status <> 'cancelled'
     AND tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
     AND (a.interviewer_id = b.interviewer_id OR a.room_id = b.room_id
          OR (a.candidate_id IS NOT NULL AND a.candidate_id = b.candidate_id))`);
  return rows[0].n;
}
