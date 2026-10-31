import type pg from "pg";
import { pool, withTx, type Db } from "../db/pool";
import { conflict, forbidden, notFound } from "../http/errors";
import type { AuthUser } from "../http/types";
import { checkSlotForCandidate } from "../scheduling/eligibility";
import { mergeRanges } from "../scheduling/ranges";
import type { Range } from "../scheduling/types";
import { toRoundSpec } from "./context";
import { getDriveRow, getRounds } from "./drives";
import { INTERVIEW_SELECT, interviewDto, type InterviewDto, type InterviewRow } from "./dto";
import { fetchInterview } from "./interviews";
import { formatWhen, notify } from "./notifications";

interface CandidateFacts {
  rounds: ReturnType<typeof toRoundSpec>[];
  window: Range;
  byRound: Map<string, Range>;
  otherInterviews: Range[];
  availability: Range[] | null;
}

/** What we need to know about a candidate to decide whether they may take a slot. */
async function candidateFacts(db: Db, driveId: string, candidateId: string): Promise<CandidateFacts> {
  const drive = await getDriveRow(db, driveId);
  const roundRows = (await getRounds(db, [driveId])).get(driveId) ?? [];
  const roundIds = new Set(roundRows.map((r) => r.id));

  const mine = await db.query<{ round_id: string; starts_at: Date; ends_at: Date }>(
    "SELECT round_id, starts_at, ends_at FROM interviews WHERE candidate_id = $1 AND status <> 'cancelled'",
    [candidateId],
  );
  const byRound = new Map<string, Range>();
  const other: Range[] = [];
  for (const r of mine.rows) {
    const range = { start: r.starts_at.getTime(), end: r.ends_at.getTime() };
    other.push(range);
    if (roundIds.has(r.round_id)) byRound.set(r.round_id, range);
  }

  const av = await db.query<{ starts_at: Date; ends_at: Date }>(
    "SELECT starts_at, ends_at FROM availability WHERE drive_id = $1 AND user_id = $2",
    [driveId, candidateId],
  );

  return {
    rounds: roundRows.map(toRoundSpec),
    window: { start: drive.window_start.getTime(), end: drive.window_end.getTime() },
    byRound,
    otherInterviews: other,
    availability: av.rows.length
      ? mergeRanges(av.rows.map((r) => ({ start: r.starts_at.getTime(), end: r.ends_at.getTime() })))
      : null,
  };
}

/** Open slots this candidate is allowed to book right now. */
export async function listEligibleSlots(user: AuthUser, driveId: string): Promise<InterviewDto[]> {
  const drive = await getDriveRow(pool, driveId);
  if (drive.status !== "published") throw notFound("Drive not found.");
  const joined = await pool.query("SELECT 1 FROM drive_participants WHERE drive_id = $1 AND user_id = $2", [driveId, user.id]);
  if (!joined.rowCount) throw conflict("Register for this drive first.");

  const facts = await candidateFacts(pool, driveId, user.id);
  const { rows } = await pool.query<InterviewRow>(
    `${INTERVIEW_SELECT} WHERE i.drive_id = $1 AND i.status = 'open' AND i.starts_at > now() ORDER BY i.starts_at, i.id`,
    [driveId],
  );
  const now = Date.now();
  return rows
    .filter(
      (r) =>
        checkSlotForCandidate({
          ...facts,
          slot: { roundId: r.round_id, start: r.starts_at.getTime(), end: r.ends_at.getTime() },
          now,
        }).ok,
    )
    .map(interviewDto);
}

/**
 * Books an open slot for a candidate. Safe under simultaneous requests:
 *  1. The idempotency key is claimed first, so a retry returns the original result.
 *  2. The slot row is locked (FOR UPDATE). Other requests for the same slot wait here,
 *     then see it is no longer open and get a clear "just taken" conflict.
 *  3. All rules are re-checked against current data inside the transaction.
 *  4. The database's exclusion constraints are the last line of defence against any overlap.
 * Anything that fails rolls back the whole transaction, including the notifications.
 */
export async function bookSlot(user: AuthUser, interviewId: string, idempotencyKey: string | null): Promise<InterviewDto> {
  return withTx(async (c) => {
    if (idempotencyKey) {
      const claimed = await c.query(
        "INSERT INTO idempotency_keys (user_id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING key",
        [user.id, idempotencyKey],
      );
      if (claimed.rowCount === 0) {
        const prev = await c.query<{ response: { interviewId: string; interview: InterviewDto } | null }>(
          "SELECT response FROM idempotency_keys WHERE user_id = $1 AND key = $2",
          [user.id, idempotencyKey],
        );
        const stored = prev.rows[0]?.response;
        if (!stored) throw conflict("That request is still being processed.");
        if (stored.interviewId !== interviewId) throw conflict("That request key was already used for a different slot.");
        return stored.interview;
      }
    }

    const { rows } = await c.query<{ id: string; drive_id: string; status: string; round_id: string; starts_at: Date; ends_at: Date; interviewer_id: string; room_id: string }>(
      "SELECT id, drive_id, status, round_id, starts_at, ends_at, interviewer_id, room_id FROM interviews WHERE id = $1 FOR UPDATE",
      [interviewId],
    );
    const slot = rows[0];
    if (!slot) throw notFound("Slot not found.");
    if (slot.status !== "open") throw conflict("Sorry, that slot was just taken. Please pick another.");

    const drive = await getDriveRow(c, slot.drive_id);
    if (drive.status !== "published") throw notFound("Slot not found.");
    const joined = await c.query("SELECT 1 FROM drive_participants WHERE drive_id = $1 AND user_id = $2", [drive.id, user.id]);
    if (!joined.rowCount) throw conflict("Register for this drive first.");

    const facts = await candidateFacts(c, drive.id, user.id);
    const verdict = checkSlotForCandidate({
      ...facts,
      slot: { roundId: slot.round_id, start: slot.starts_at.getTime(), end: slot.ends_at.getTime() },
      now: Date.now(),
    });
    if (!verdict.ok) throw conflict(verdict.reason);

    await c.query(
      `UPDATE interviews SET candidate_id = $2, status = 'scheduled', booked_via = 'self_booking',
              booked_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'open'`,
      [interviewId, user.id],
    );

    const dto = (await fetchInterview(c, interviewId))!;
    const when = formatWhen(slot.starts_at);
    await notify(c, user.id, "booking_confirmed", "Interview booked", `${dto.round.name} for ${dto.drive.title}: ${when}, ${dto.room.name}, with ${dto.interviewer.name}.`, interviewId);
    await notify(c, slot.interviewer_id, "booking_received", "New booking", `${user.name} booked ${dto.round.name} on ${when} (${dto.room.name}).`, interviewId);

    if (idempotencyKey) {
      await c.query("UPDATE idempotency_keys SET response = $3 WHERE user_id = $1 AND key = $2", [
        user.id,
        idempotencyKey,
        JSON.stringify({ interviewId, interview: dto }),
      ]);
    }
    return dto;
  });
}

/** Gives a booked slot back so someone else can take it. The candidate (or a coordinator) can do this. */
export async function cancelBooking(user: AuthUser, interviewId: string): Promise<InterviewDto> {
  return withTx(async (c: pg.PoolClient) => {
    const { rows } = await c.query<{ id: string; drive_id: string; round_id: string; candidate_id: string | null; interviewer_id: string; status: string; starts_at: Date }>(
      "SELECT id, drive_id, round_id, candidate_id, interviewer_id, status, starts_at FROM interviews WHERE id = $1 FOR UPDATE",
      [interviewId],
    );
    const row = rows[0];
    if (!row || row.status === "cancelled") throw notFound("Interview not found.");
    if (user.role !== "coordinator" && row.candidate_id !== user.id) throw forbidden();
    if (row.status !== "scheduled" || !row.candidate_id) throw conflict("Only a scheduled interview can be cancelled.");
    if (row.starts_at.getTime() <= Date.now()) throw conflict("This interview has already started.");

    // Don't leave a candidate with a later round but no earlier one.
    const later = await c.query(
      `SELECT 1 FROM interviews i JOIN rounds r ON r.id = i.round_id
       WHERE i.drive_id = $1 AND i.candidate_id = $2 AND i.status <> 'cancelled'
         AND r.position > (SELECT position FROM rounds WHERE id = $3) LIMIT 1`,
      [row.drive_id, row.candidate_id, row.round_id],
    );
    if (later.rowCount) throw conflict("Cancel the later rounds first. Rounds must stay in order.");

    await c.query(
      `UPDATE interviews SET candidate_id = NULL, status = 'open', booked_via = NULL, booked_at = NULL, updated_at = now()
       WHERE id = $1`,
      [interviewId],
    );

    const dto = (await fetchInterview(c, interviewId))!;
    const when = formatWhen(row.starts_at);
    const by = user.id === row.candidate_id ? "The candidate cancelled" : "The coordinator cancelled";
    await notify(c, row.interviewer_id, "booking_cancelled", "Booking cancelled", `${by} the ${dto.round.name} interview on ${when}. The slot is open again.`, interviewId);
    if (user.id !== row.candidate_id) {
      await notify(c, row.candidate_id, "booking_cancelled", "Your interview was cancelled", `Your ${dto.round.name} interview on ${when} was cancelled by the coordinator.`, interviewId);
    }
    return dto;
  });
}
