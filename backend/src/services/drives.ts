import type pg from "pg";
import { z } from "zod";
import { pool, withTx, type Db } from "../db/pool";
import { badRequest, conflict, notFound } from "../http/errors";
import type { AuthUser } from "../http/types";
import { mergeRanges } from "../scheduling/ranges";
import { roundDto, type RoundRow } from "./dto";

export const MAX_WINDOW_DAYS = 14;

const skill = z.string().trim().toLowerCase().min(1).max(40);

export const roundSchema = z.object({
  name: z.string().trim().min(1, "Give every round a name.").max(80),
  type: z.enum(["online_assessment", "technical", "hr", "other"]).default("technical"),
  durationMinutes: z.number().int("Duration must be a whole number of minutes.").min(5, "A round must be at least 5 minutes.").max(480),
  requiredSkills: z.array(skill).max(10).default([]).transform((l) => [...new Set(l)]),
  minGapMinutes: z.number().int().min(0).max(480).default(0),
  requiredCapacity: z.number().int().min(1).max(50).default(2),
});

const when = z.iso.datetime({ offset: true, error: "Enter a valid date and time." });

export const driveSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a drive name.").max(120),
    company: z.string().trim().min(1, "Enter the company name.").max(120),
    windowStart: when,
    windowEnd: when,
    rounds: z.array(roundSchema).min(1, "Add at least one interview round.").max(8, "A drive can have at most 8 rounds."),
  })
  .superRefine((d, ctx) => {
    const start = Date.parse(d.windowStart);
    const end = Date.parse(d.windowEnd);
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["windowEnd"], message: "The window must end after it starts." });
      return;
    }
    const windowMin = (end - start) / 60_000;
    if (windowMin > MAX_WINDOW_DAYS * 24 * 60) {
      ctx.addIssue({ code: "custom", path: ["windowEnd"], message: `A drive window can be at most ${MAX_WINDOW_DAYS} days.` });
    }
    // The rounds, back to back with their minimum gaps, must at least fit in the window.
    const needed = d.rounds.reduce((sum, r, i) => sum + r.durationMinutes + (i > 0 ? r.minGapMinutes : 0), 0);
    if (needed > windowMin) {
      ctx.addIssue({
        code: "custom",
        path: ["rounds"],
        message: `The rounds need at least ${needed} minutes in a row, but the window is only ${Math.floor(windowMin)} minutes.`,
      });
    }
  });

export type DriveBody = z.infer<typeof driveSchema>;

export interface DriveRow {
  id: string;
  title: string;
  company: string;
  window_start: Date;
  window_end: Date;
  status: "draft" | "published";
  created_by: string;
  created_at: Date;
}

interface DriveListRow extends DriveRow {
  candidate_count?: number;
  interviewer_count?: number;
  interview_count?: number;
  open_slot_count?: number;
  joined?: boolean;
}

export async function getDriveRow(db: Db, id: string, lock = false): Promise<DriveRow> {
  const { rows } = await db.query<DriveRow>(`SELECT * FROM drives WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`, [id]);
  if (!rows[0]) throw notFound("Drive not found.");
  return rows[0];
}

export async function getRounds(db: Db, driveIds: string[]): Promise<Map<string, RoundRow[]>> {
  const { rows } = await db.query<RoundRow & { drive_id: string }>(
    "SELECT * FROM rounds WHERE drive_id = ANY($1::uuid[]) ORDER BY drive_id, position",
    [driveIds],
  );
  const map = new Map<string, RoundRow[]>();
  for (const r of rows) {
    const list = map.get(r.drive_id) ?? [];
    list.push(r);
    map.set(r.drive_id, list);
  }
  return map;
}

function driveDto(row: DriveListRow, rounds: RoundRow[], coordinator: boolean) {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    windowStart: row.window_start.toISOString(),
    windowEnd: row.window_end.toISOString(),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    rounds: rounds.map(roundDto),
    ...(coordinator
      ? {
          counts: {
            candidates: row.candidate_count ?? 0,
            interviewers: row.interviewer_count ?? 0,
            interviews: row.interview_count ?? 0,
            openSlots: row.open_slot_count ?? 0,
          },
        }
      : { joined: row.joined ?? false }),
  };
}

const COUNTS_SQL = `
  (SELECT count(*)::int FROM drive_participants p JOIN users u ON u.id = p.user_id WHERE p.drive_id = d.id AND u.role = 'candidate') AS candidate_count,
  (SELECT count(*)::int FROM drive_participants p JOIN users u ON u.id = p.user_id WHERE p.drive_id = d.id AND u.role = 'interviewer') AS interviewer_count,
  (SELECT count(*)::int FROM interviews i WHERE i.drive_id = d.id AND i.status IN ('scheduled', 'completed')) AS interview_count,
  (SELECT count(*)::int FROM interviews i WHERE i.drive_id = d.id AND i.status = 'open') AS open_slot_count`;

/** Coordinators see every drive with counts. Everyone else sees published drives and whether they joined. */
export async function listDrives(user: AuthUser) {
  const coordinator = user.role === "coordinator";
  const { rows } = coordinator
    ? await pool.query<DriveListRow>(`SELECT d.*, ${COUNTS_SQL} FROM drives d ORDER BY d.window_start DESC, d.created_at DESC`)
    : await pool.query<DriveListRow>(
        `SELECT d.*, EXISTS (SELECT 1 FROM drive_participants p WHERE p.drive_id = d.id AND p.user_id = $1) AS joined
         FROM drives d WHERE d.status = 'published' ORDER BY d.window_start DESC, d.created_at DESC`,
        [user.id],
      );
  const rounds = await getRounds(pool, rows.map((r) => r.id));
  return rows.map((r) => driveDto(r, rounds.get(r.id) ?? [], coordinator));
}

export async function getDrive(user: AuthUser, id: string) {
  const coordinator = user.role === "coordinator";
  const { rows } = coordinator
    ? await pool.query<DriveListRow>(`SELECT d.*, ${COUNTS_SQL} FROM drives d WHERE d.id = $1`, [id])
    : await pool.query<DriveListRow>(
        `SELECT d.*, EXISTS (SELECT 1 FROM drive_participants p WHERE p.drive_id = d.id AND p.user_id = $2) AS joined
         FROM drives d WHERE d.id = $1 AND d.status = 'published'`,
        [id, user.id],
      );
  if (!rows[0]) throw notFound("Drive not found.");
  const rounds = await getRounds(pool, [id]);
  return driveDto(rows[0], rounds.get(id) ?? [], coordinator);
}

async function insertRounds(c: pg.PoolClient, driveId: string, rounds: DriveBody["rounds"]) {
  for (const [i, r] of rounds.entries()) {
    await c.query(
      `INSERT INTO rounds (drive_id, position, name, type, duration_minutes, required_skills, min_gap_minutes, required_capacity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [driveId, i + 1, r.name, r.type, r.durationMinutes, r.requiredSkills, i === 0 ? 0 : r.minGapMinutes, r.requiredCapacity],
    );
  }
}

export async function createDrive(user: AuthUser, body: DriveBody) {
  const id = await withTx(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO drives (title, company, window_start, window_end, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [body.title, body.company, body.windowStart, body.windowEnd, user.id],
    );
    await insertRounds(c, rows[0].id, body.rounds);
    return rows[0].id;
  });
  return getDrive(user, id);
}

export async function updateDrive(user: AuthUser, id: string, body: DriveBody) {
  await withTx(async (c) => {
    const drive = await getDriveRow(c, id, true);
    if (drive.status !== "draft") throw conflict("Unpublish the drive before editing it.");
    await c.query(
      "UPDATE drives SET title = $2, company = $3, window_start = $4, window_end = $5, updated_at = now() WHERE id = $1",
      [id, body.title, body.company, body.windowStart, body.windowEnd],
    );
    await c.query("DELETE FROM rounds WHERE drive_id = $1", [id]);
    await insertRounds(c, id, body.rounds);
  });
  return getDrive(user, id);
}

export async function setPublished(user: AuthUser, id: string, publish: boolean) {
  await withTx(async (c) => {
    const drive = await getDriveRow(c, id, true);
    if (drive.status === (publish ? "published" : "draft")) return;
    if (!publish) {
      const live = await c.query(
        "SELECT 1 FROM interviews WHERE drive_id = $1 AND status IN ('scheduled', 'completed') LIMIT 1",
        [id],
      );
      if (live.rowCount) throw conflict("This drive has scheduled interviews. Cancel them before unpublishing.");
      // Open slots reserve interviewers and rooms, so release them.
      await c.query("DELETE FROM interviews WHERE drive_id = $1 AND status = 'open'", [id]);
    }
    await c.query("UPDATE drives SET status = $2, updated_at = now() WHERE id = $1", [id, publish ? "published" : "draft"]);
  });
  return getDrive(user, id);
}

export async function deleteDrive(id: string) {
  await withTx(async (c) => {
    const drive = await getDriveRow(c, id, true);
    if (drive.status !== "draft") throw conflict("Only draft drives can be deleted. Unpublish it first.");
    await c.query("DELETE FROM drives WHERE id = $1", [id]);
  });
}

// ---------- Joining a drive and availability ----------

async function requirePublishedDrive(db: Db, id: string): Promise<DriveRow> {
  const drive = await getDriveRow(db, id);
  if (drive.status !== "published") throw notFound("Drive not found.");
  return drive;
}

export async function joinDrive(user: AuthUser, driveId: string) {
  await requirePublishedDrive(pool, driveId);
  await pool.query(
    "INSERT INTO drive_participants (drive_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [driveId, user.id],
  );
}

export async function leaveDrive(user: AuthUser, driveId: string) {
  await withTx(async (c) => {
    const live = await c.query(
      `SELECT 1 FROM interviews
       WHERE drive_id = $1 AND status IN ('open', 'scheduled', 'completed')
         AND (candidate_id = $2 OR interviewer_id = $2) LIMIT 1`,
      [driveId, user.id],
    );
    if (live.rowCount) throw conflict("You have interviews in this drive. Ask the coordinator to cancel them first.");
    await c.query("DELETE FROM drive_participants WHERE drive_id = $1 AND user_id = $2", [driveId, user.id]);
  });
}

async function requireParticipant(db: Db, driveId: string, userId: string) {
  const { rows } = await db.query<{ max_interviews: number | null }>(
    "SELECT max_interviews FROM drive_participants WHERE drive_id = $1 AND user_id = $2",
    [driveId, userId],
  );
  if (!rows[0]) throw conflict("Join this drive first.");
  return rows[0];
}

export async function getAvailability(user: AuthUser, driveId: string) {
  await requirePublishedDrive(pool, driveId);
  const part = await requireParticipant(pool, driveId, user.id);
  const { rows } = await pool.query<{ starts_at: Date; ends_at: Date }>(
    "SELECT starts_at, ends_at FROM availability WHERE drive_id = $1 AND user_id = $2 ORDER BY starts_at",
    [driveId, user.id],
  );
  return {
    maxInterviews: part.max_interviews,
    windows: rows.map((r) => ({ startsAt: r.starts_at.toISOString(), endsAt: r.ends_at.toISOString() })),
  };
}

export const availabilitySchema = z.object({
  maxInterviews: z.number().int().min(1, "Limit must be at least 1.").max(100).nullable().optional(),
  windows: z
    .array(z.object({ startsAt: when, endsAt: when }))
    .max(60, "Add at most 60 time windows."),
});

export async function setAvailability(user: AuthUser, driveId: string, body: z.infer<typeof availabilitySchema>) {
  await withTx(async (c) => {
    const drive = await requirePublishedDrive(c, driveId);
    await requireParticipant(c, driveId, user.id);

    const ws = drive.window_start.getTime();
    const we = drive.window_end.getTime();
    const ranges = body.windows.map((w) => ({ start: Date.parse(w.startsAt), end: Date.parse(w.endsAt) }));
    for (const r of ranges) {
      if (r.end <= r.start) throw badRequest("Each time window must end after it starts.");
      if (r.start < ws || r.end > we) throw badRequest("Times must be inside the drive window.");
    }

    await c.query("DELETE FROM availability WHERE drive_id = $1 AND user_id = $2", [driveId, user.id]);
    for (const r of mergeRanges(ranges)) {
      await c.query(
        "INSERT INTO availability (drive_id, user_id, starts_at, ends_at) VALUES ($1, $2, $3, $4)",
        [driveId, user.id, new Date(r.start), new Date(r.end)],
      );
    }
    if (user.role === "interviewer" && body.maxInterviews !== undefined) {
      await c.query("UPDATE drive_participants SET max_interviews = $3 WHERE drive_id = $1 AND user_id = $2", [
        driveId,
        user.id,
        body.maxInterviews,
      ]);
    }
  });
  return getAvailability(user, driveId);
}

export async function listParticipants(driveId: string) {
  await getDriveRow(pool, driveId);
  const { rows } = await pool.query<{
    id: string;
    name: string;
    email: string;
    role: string;
    skills: string[];
    max_interviews: number | null;
    window_count: number;
    interview_count: number;
  }>(
    `SELECT u.id, u.name, u.email, u.role, u.skills, p.max_interviews,
            (SELECT count(*)::int FROM availability a WHERE a.drive_id = p.drive_id AND a.user_id = p.user_id) AS window_count,
            (SELECT count(*)::int FROM interviews i
              WHERE i.drive_id = p.drive_id AND (i.candidate_id = u.id OR i.interviewer_id = u.id)
                AND i.status IN ('scheduled', 'completed')) AS interview_count
     FROM drive_participants p JOIN users u ON u.id = p.user_id
     WHERE p.drive_id = $1 ORDER BY u.role, u.name`,
    [driveId],
  );
  const dto = (r: (typeof rows)[number]) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    skills: r.skills,
    maxInterviews: r.max_interviews,
    availabilityWindows: r.window_count,
    interviews: r.interview_count,
  });
  return {
    candidates: rows.filter((r) => r.role === "candidate").map(dto),
    interviewers: rows.filter((r) => r.role === "interviewer").map(dto),
  };
}
