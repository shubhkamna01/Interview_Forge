import type { Db } from "../db/pool";
import { clip, mergeRanges } from "../scheduling/ranges";
import type { BusyInterview, PersonSpec, Range, RoomSpec, RoundSpec, ScheduleInput } from "../scheduling/types";
import { MINUTE } from "../scheduling/types";
import type { RoundRow } from "./dto";
import { getDriveRow, getRounds, type DriveRow } from "./drives";

export interface DriveContext {
  drive: DriveRow;
  roundRows: RoundRow[];
  input: ScheduleInput;
  names: {
    candidates: Map<string, string>;
    interviewers: Map<string, string>;
    rooms: Map<string, string>;
    rounds: Map<string, { name: string; position: number }>;
  };
}

export const toRoundSpec = (r: RoundRow): RoundSpec => ({
  id: r.id,
  position: r.position,
  name: r.name,
  durationMs: r.duration_minutes * MINUTE,
  requiredSkills: r.required_skills,
  minGapMs: r.min_gap_minutes * MINUTE,
  requiredCapacity: r.required_capacity,
});

/**
 * Reads everything the scheduling engine needs for one drive in a consistent snapshot.
 * "existing" covers ALL drives, because people and rooms are shared between them.
 */
export async function loadContext(db: Db, driveId: string): Promise<DriveContext> {
  const drive = await getDriveRow(db, driveId);
  const roundRows = (await getRounds(db, [driveId])).get(driveId) ?? [];
  const window: Range = { start: drive.window_start.getTime(), end: drive.window_end.getTime() };

  // Sequential on purpose: inside a transaction all queries share one connection.
  const parts = await db.query<{ id: string; name: string; role: string; skills: string[]; max_interviews: number | null }>(
      `SELECT u.id, u.name, u.role, u.skills, p.max_interviews
       FROM drive_participants p JOIN users u ON u.id = p.user_id WHERE p.drive_id = $1 ORDER BY u.name, u.id`,
      [driveId],
  );
  const avail = await db.query<{ user_id: string; starts_at: Date; ends_at: Date }>(
    "SELECT user_id, starts_at, ends_at FROM availability WHERE drive_id = $1",
    [driveId],
  );
  const rooms = await db.query<{ id: string; name: string; capacity: number }>("SELECT id, name, capacity FROM rooms ORDER BY name");
  const existing = await db.query<{
      id: string;
      round_id: string;
      candidate_id: string | null;
      interviewer_id: string;
      room_id: string;
      starts_at: Date;
      ends_at: Date;
  }>(
    `SELECT id, round_id, candidate_id, interviewer_id, room_id, starts_at, ends_at
     FROM interviews
     WHERE status <> 'cancelled' AND tstzrange(starts_at, ends_at) && tstzrange($1::timestamptz, $2::timestamptz)`,
    [drive.window_start, drive.window_end],
  );

  const windowsByUser = new Map<string, Range[]>();
  for (const a of avail.rows) {
    const r = clip({ start: a.starts_at.getTime(), end: a.ends_at.getTime() }, window);
    if (!r) continue;
    const list = windowsByUser.get(a.user_id) ?? [];
    list.push(r);
    windowsByUser.set(a.user_id, list);
  }

  const spec = (p: (typeof parts.rows)[number], isCandidate: boolean): PersonSpec => {
    const windows = windowsByUser.get(p.id);
    return {
      id: p.id,
      name: p.name,
      skills: p.skills,
      // Candidates who gave no windows are free any time; interviewers who gave none can't be used.
      availability: windows ? mergeRanges(windows) : isCandidate ? null : [],
      maxInterviews: p.max_interviews,
    };
  };

  const candidates = parts.rows.filter((p) => p.role === "candidate");
  const interviewers = parts.rows.filter((p) => p.role === "interviewer");

  const roomSpecs: RoomSpec[] = rooms.rows;
  const busy: BusyInterview[] = existing.rows.map((r) => ({
    id: r.id,
    roundId: r.round_id,
    candidateId: r.candidate_id,
    interviewerId: r.interviewer_id,
    roomId: r.room_id,
    start: r.starts_at.getTime(),
    end: r.ends_at.getTime(),
  }));

  return {
    drive,
    roundRows,
    input: {
      window,
      rounds: roundRows.map(toRoundSpec),
      candidates: candidates.map((p) => spec(p, true)),
      interviewers: interviewers.map((p) => spec(p, false)),
      rooms: roomSpecs,
      existing: busy,
    },
    names: {
      candidates: new Map(candidates.map((p) => [p.id, p.name])),
      interviewers: new Map(interviewers.map((p) => [p.id, p.name])),
      rooms: new Map(rooms.rows.map((r) => [r.id, r.name])),
      rounds: new Map(roundRows.map((r) => [r.id, { name: r.name, position: r.position }])),
    },
  };
}
