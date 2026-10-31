import type pg from "pg";
import { pool, withTx } from "../db/pool";
import { conflict } from "../http/errors";
import type { AuthUser } from "../http/types";
import { generateOpenSlots, generateSchedule, scheduleStats, type ScheduleStats } from "../scheduling/solver";
import type { Assignment, ScheduleInput } from "../scheduling/types";
import { validateSchedule } from "../scheduling/validate";
import { loadContext, type DriveContext } from "./context";
import { getDriveRow } from "./drives";
import { formatWhen, notify } from "./notifications";

export interface ScheduleReport {
  runId: string;
  createdAt: string;
  durationMs: number;
  /** Interviews created by this run. */
  assigned: number;
  /** Interviews that already existed and were left untouched. */
  alreadyScheduled: number;
  unresolved: { candidate: { id: string; name: string }; round: { id: string; name: string; position: number }; reason: string }[];
  stats: ScheduleStats;
}

function liveForDrive(ctx: DriveContext, extra: { id: string }[] = []) {
  const ids = new Set(ctx.roundRows.map((r) => r.id));
  return ctx.input.existing.filter((e) => ids.has(e.roundId)).concat(extra as never[]);
}

async function insertInterviews(c: pg.PoolClient, driveId: string, list: (Assignment & { status: "scheduled" })[]) {
  const ids: string[] = [];
  for (const a of list) {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO interviews (drive_id, round_id, candidate_id, interviewer_id, room_id, starts_at, ends_at, status, booked_via, booked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', 'solver', now()) RETURNING id`,
      [driveId, a.roundId, a.candidateId, a.interviewerId, a.roomId, new Date(a.start), new Date(a.end)],
    );
    ids.push(rows[0].id);
  }
  return ids;
}

/**
 * Generates the schedule for a drive in ONE transaction: either every assignment is saved together
 * with its notifications, or nothing changes. Existing interviews are never touched; open slots are
 * cleared first so their interviewers and rooms can be reused.
 */
export async function runSchedule(user: AuthUser, driveId: string): Promise<ScheduleReport> {
  return withTx(async (c) => {
    const drive = await getDriveRow(c, driveId, true);
    if (drive.status !== "published") throw conflict("Publish the drive before generating a schedule.");

    await c.query("DELETE FROM interviews WHERE drive_id = $1 AND status = 'open'", [driveId]);
    const ctx = await loadContext(c, driveId);
    if (ctx.input.rounds.length === 0) throw conflict("This drive has no rounds.");

    const alreadyScheduled = liveForDrive(ctx).filter((e) => e.candidateId !== null).length;

    const t0 = performance.now();
    const result = generateSchedule(ctx.input);
    const durationMs = Math.round(performance.now() - t0);

    // Safety net: if the solver ever produced something invalid, stop before it reaches the database.
    const problems = validateSchedule(ctx.input, result.assignments, ctx.input.existing);
    if (problems.length) throw new Error(`Scheduler produced an invalid schedule: ${problems[0]}`);

    const ids = await insertInterviews(c, driveId, result.assignments.map((a) => ({ ...a, status: "scheduled" as const })));

    // One summary notification per person, not one per interview.
    const byCandidate = new Map<string, string[]>();
    const byInterviewer = new Map<string, number>();
    result.assignments.forEach((a, i) => {
      const round = ctx.names.rounds.get(a.roundId)!;
      const lines = byCandidate.get(a.candidateId) ?? [];
      lines.push(`${round.name}: ${formatWhen(new Date(a.start))}, ${ctx.names.rooms.get(a.roomId)}`);
      byCandidate.set(a.candidateId, lines);
      byInterviewer.set(a.interviewerId, (byInterviewer.get(a.interviewerId) ?? 0) + 1);
      void ids[i];
    });
    for (const [candidateId, lines] of byCandidate) {
      await notify(c, candidateId, "schedule_created", `Your interviews are scheduled: ${drive.title}`, lines.join("\n"));
    }
    for (const [interviewerId, n] of byInterviewer) {
      await notify(c, interviewerId, "schedule_created", `New interviews: ${drive.title}`, `${n} interview${n === 1 ? "" : "s"} were assigned to you.`);
    }

    const unresolved = result.unresolved.map((u) => ({
      candidate: { id: u.candidateId, name: ctx.names.candidates.get(u.candidateId) ?? "Unknown" },
      round: { id: u.roundId, ...ctx.names.rounds.get(u.roundId)! },
      reason: u.reason,
    }));

    const all = liveForDrive(ctx).concat(
      result.assignments.map((a, i) => ({ id: ids[i], roundId: a.roundId, candidateId: a.candidateId, interviewerId: a.interviewerId, roomId: a.roomId, start: a.start, end: a.end })),
    );
    const stats = scheduleStats(ctx.input, all);

    const report = { durationMs, assigned: result.assignments.length, alreadyScheduled, unresolved, stats };
    const saved = await c.query<{ id: string; created_at: Date }>(
      "INSERT INTO schedule_runs (drive_id, created_by, report) VALUES ($1, $2, $3) RETURNING id, created_at",
      [driveId, user.id, JSON.stringify(report)],
    );
    return { runId: saved.rows[0].id, createdAt: saved.rows[0].created_at.toISOString(), ...report };
  });
}

export async function latestRun(driveId: string): Promise<ScheduleReport | null> {
  await getDriveRow(pool, driveId);
  const { rows } = await pool.query<{ id: string; created_at: Date; report: Omit<ScheduleReport, "runId" | "createdAt"> }>(
    "SELECT id, created_at, report FROM schedule_runs WHERE drive_id = $1 ORDER BY created_at DESC LIMIT 1",
    [driveId],
  );
  return rows[0] ? { runId: rows[0].id, createdAt: rows[0].created_at.toISOString(), ...rows[0].report } : null;
}

export interface OpenSlotsReport {
  created: number;
  perRound: { round: { id: string; name: string; position: number }; demand: number; created: number }[];
}

/**
 * Turns remaining interviewer time into open slots candidates can book themselves.
 * Re-running replaces the previous open slots (booked ones are never touched).
 */
export async function createOpenSlots(driveId: string): Promise<OpenSlotsReport> {
  return withTx(async (c) => {
    const drive = await getDriveRow(c, driveId, true);
    if (drive.status !== "published") throw conflict("Publish the drive before opening slots.");

    await c.query("DELETE FROM interviews WHERE drive_id = $1 AND status = 'open'", [driveId]);
    const ctx = await loadContext(c, driveId);

    // Demand: how many candidates still lack an interview in each round.
    const have = new Map<string, Set<string>>();
    for (const e of liveForDrive(ctx)) {
      if (!e.candidateId) continue;
      const set = have.get(e.roundId) ?? new Set<string>();
      set.add(e.candidateId);
      have.set(e.roundId, set);
    }
    const demand = new Map<string, number>();
    const needing = new Set<string>();
    for (const r of ctx.input.rounds) {
      const missing = ctx.input.candidates.filter((cand) => !have.get(r.id)?.has(cand.id));
      demand.set(r.id, missing.length);
      missing.forEach((m) => needing.add(m.id));
    }

    const slots = generateOpenSlots(ctx.input, demand);
    const problems = validateSchedule(
      ctx.input,
      slots.map((s) => ({ ...s, candidateId: null })),
      ctx.input.existing,
    );
    if (problems.length) throw new Error(`Slot generator produced an invalid result: ${problems[0]}`);

    for (const s of slots) {
      await c.query(
        `INSERT INTO interviews (drive_id, round_id, candidate_id, interviewer_id, room_id, starts_at, ends_at, status)
         VALUES ($1, $2, NULL, $3, $4, $5, $6, 'open')`,
        [driveId, s.roundId, s.interviewerId, s.roomId, new Date(s.start), new Date(s.end)],
      );
    }

    if (slots.length > 0) {
      for (const candidateId of needing) {
        await notify(c, candidateId, "slots_open", `Interview slots are open: ${drive.title}`, "Pick your interview time from the available slots.");
      }
    }

    return {
      created: slots.length,
      perRound: ctx.input.rounds.map((r) => ({
        round: { id: r.id, ...ctx.names.rounds.get(r.id)! },
        demand: demand.get(r.id) ?? 0,
        created: slots.filter((s) => s.roundId === r.id).length,
      })),
    };
  });
}

export type { ScheduleInput };
