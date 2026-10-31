import { pool, withTx, type Db } from "../db/pool";
import { badRequest, conflict, forbidden, notFound } from "../http/errors";
import type { AuthUser } from "../http/types";
import { subtractRange } from "../scheduling/ranges";
import { planReschedule, type RescheduleItem } from "../scheduling/solver";
import type { BusyInterview, Range } from "../scheduling/types";
import { loadContext, type DriveContext } from "./context";
import { getDriveRow } from "./drives";
import type { InterviewDto } from "./dto";
import { fetchInterview } from "./interviews";
import { formatWhen, notify } from "./notifications";

const MAX_SPAN_MS = 14 * 24 * 60 * 60_000;

export interface RescheduleRequest {
  interviewerId: string;
  from: string;
  to: string;
}

export interface PlanOutcomeDto {
  kind: "open_slot" | "new" | "none";
  startsAt?: string;
  endsAt?: string;
  interviewer?: { id: string; name: string };
  room?: { id: string; name: string };
  reason?: string;
}

export interface PlanItemDto {
  interview: InterviewDto;
  outcome: PlanOutcomeDto;
}

interface Plan {
  ctx: DriveContext;
  items: RescheduleItem[];
  openAffectedIds: string[];
  carved: Range[];
  interviewerName: string;
}

function parseRange(req: RescheduleRequest): Range {
  const range = { start: Date.parse(req.from), end: Date.parse(req.to) };
  if (!(range.end > range.start)) throw badRequest("The end must be after the start.");
  if (range.end - range.start > MAX_SPAN_MS) throw badRequest("Pick a period of at most 14 days.");
  return range;
}

/** Works out what would change, without writing anything. */
async function computePlan(db: Db, driveId: string, interviewerId: string, range: Range): Promise<Plan> {
  const ctx = await loadContext(db, driveId);
  const interviewer = ctx.input.interviewers.find((i) => i.id === interviewerId);
  if (!interviewer) throw notFound("That interviewer isn't part of this drive.");

  const { rows } = await db.query<{ id: string; status: string }>(
    `SELECT id, status FROM interviews
     WHERE drive_id = $1 AND interviewer_id = $2 AND status IN ('scheduled', 'open')
       AND tstzrange(starts_at, ends_at) && tstzrange($3::timestamptz, $4::timestamptz)`,
    [driveId, interviewerId, new Date(range.start), new Date(range.end)],
  );
  const affectedIds = new Set(rows.filter((r) => r.status === "scheduled").map((r) => r.id));
  const openAffected = new Set(rows.filter((r) => r.status === "open").map((r) => r.id));

  const openIds = new Set(
    (await db.query<{ id: string }>("SELECT id FROM interviews WHERE drive_id = $1 AND status = 'open'", [driveId])).rows.map((r) => r.id),
  );

  const affected = ctx.input.existing.filter((e) => affectedIds.has(e.id));
  const remaining: BusyInterview[] = ctx.input.existing.filter((e) => !affectedIds.has(e.id) && !openAffected.has(e.id));
  const openSlots = remaining.filter((e) => openIds.has(e.id));

  // The interviewer is unavailable in this period, so nothing may be (re)assigned to them in it.
  const carved = subtractRange(interviewer.availability ?? [], range);
  const interviewers = ctx.input.interviewers.map((i) => (i.id === interviewerId ? { ...i, availability: carved } : i));

  const items = planReschedule({ ...ctx.input, existing: remaining, interviewers }, affected, openSlots);
  return { ctx, items, openAffectedIds: [...openAffected], carved, interviewerName: interviewer.name };
}

function authorize(actor: AuthUser, interviewerId: string) {
  if (actor.role === "interviewer" && actor.id !== interviewerId) throw forbidden("You can only change your own schedule.");
  if (actor.role !== "interviewer" && actor.role !== "coordinator") throw forbidden();
}

function outcomeDto(item: RescheduleItem, ctx: DriveContext): PlanOutcomeDto {
  const o = item.outcome;
  if (o.kind === "none") return { kind: "none", reason: o.reason };
  const p = o.kind === "new" ? o.placement : { interviewerId: o.slot.interviewerId, roomId: o.slot.roomId, start: o.slot.start, end: o.slot.end };
  return {
    kind: o.kind,
    startsAt: new Date(p.start).toISOString(),
    endsAt: new Date(p.end).toISOString(),
    interviewer: { id: p.interviewerId, name: ctx.names.interviewers.get(p.interviewerId) ?? "Unknown" },
    room: { id: p.roomId, name: ctx.names.rooms.get(p.roomId) ?? "Unknown" },
  };
}

/** Shows what cancelling an interviewer's time would affect and where each interview could move. Writes nothing. */
export async function previewReschedule(actor: AuthUser, driveId: string, req: RescheduleRequest) {
  authorize(actor, req.interviewerId);
  const range = parseRange(req);
  await getDriveRow(pool, driveId);
  const plan = await computePlan(pool, driveId, req.interviewerId, range);

  const items: PlanItemDto[] = [];
  for (const item of plan.items) {
    items.push({ interview: (await fetchInterview(pool, item.affected.id))!, outcome: outcomeDto(item, plan.ctx) });
  }
  return {
    interviewer: { id: req.interviewerId, name: plan.interviewerName },
    affected: items.length,
    canMove: items.filter((i) => i.outcome.kind !== "none").length,
    items,
  };
}

/**
 * Applies the plan in one transaction. Interviews outside the affected period are never touched.
 * The plan is recomputed inside the transaction, so it is validated against current data.
 */
export async function applyReschedule(actor: AuthUser, driveId: string, req: RescheduleRequest) {
  authorize(actor, req.interviewerId);
  const range = parseRange(req);

  return withTx(async (c) => {
    const drive = await getDriveRow(c, driveId, true);
    if (drive.status !== "published") throw conflict("This drive is not published.");
    const plan = await computePlan(c, driveId, req.interviewerId, range);
    const { ctx } = plan;

    const cancelIds = [...plan.items.map((i) => i.affected.id), ...plan.openAffectedIds];
    if (cancelIds.length) {
      await c.query("UPDATE interviews SET status = 'cancelled', updated_at = now() WHERE id = ANY($1::uuid[])", [cancelIds]);
    }

    // Remember the unavailability so later scheduling doesn't use this time again.
    await c.query("DELETE FROM availability WHERE drive_id = $1 AND user_id = $2", [driveId, req.interviewerId]);
    for (const r of plan.carved) {
      await c.query("INSERT INTO availability (drive_id, user_id, starts_at, ends_at) VALUES ($1, $2, $3, $4)", [
        driveId,
        req.interviewerId,
        new Date(r.start),
        new Date(r.end),
      ]);
    }

    const result: PlanItemDto[] = [];
    let moved = 0;

    for (const item of plan.items) {
      const a = item.affected;
      const round = ctx.names.rounds.get(a.roundId)!;
      const before = formatWhen(new Date(a.start));
      const o = item.outcome;
      let newId: string | null = null;

      if (o.kind === "open_slot") {
        const taken = await c.query(
          `UPDATE interviews SET candidate_id = $2, status = 'scheduled', booked_via = 'reschedule', booked_at = now(), updated_at = now()
           WHERE id = $1 AND status = 'open' RETURNING id`,
          [o.slot.id, a.candidateId],
        );
        if (!taken.rowCount) throw conflict("A slot was taken while rescheduling. Please try again.");
        newId = o.slot.id;
      } else if (o.kind === "new") {
        const p = o.placement;
        const ins = await c.query<{ id: string }>(
          `INSERT INTO interviews (drive_id, round_id, candidate_id, interviewer_id, room_id, starts_at, ends_at, status, booked_via, booked_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', 'reschedule', now()) RETURNING id`,
          [driveId, a.roundId, a.candidateId, p.interviewerId, p.roomId, new Date(p.start), new Date(p.end)],
        );
        newId = ins.rows[0].id;
      }

      if (newId) {
        moved++;
        const dto = (await fetchInterview(c, newId))!;
        const after = formatWhen(new Date(dto.startsAt));
        await notify(c, a.candidateId!, "rescheduled", "Your interview was rescheduled", `${round.name} for ${drive.title} moved from ${before} to ${after} (${dto.room.name}, with ${dto.interviewer.name}).`, newId);
        await notify(c, dto.interviewer.id, "booking_received", "New interview assigned", `${dto.candidate!.name}: ${round.name} on ${after} (${dto.room.name}).`, newId);
        result.push({ interview: (await fetchInterview(c, a.id))!, outcome: outcomeDto(item, ctx) });
      } else {
        await notify(c, a.candidateId!, "cancelled", "Your interview was cancelled", `${round.name} for ${drive.title} on ${before} was cancelled because the interviewer is unavailable. We haven't found a replacement yet. You will be told when slots open.`, a.id);
        result.push({ interview: (await fetchInterview(c, a.id))!, outcome: outcomeDto(item, ctx) });
      }
    }

    const unresolved = plan.items.length - moved;
    if (actor.id !== req.interviewerId && plan.items.length > 0) {
      await notify(c, req.interviewerId, "cancelled", "Your interviews were cancelled", `${plan.items.length} interview${plan.items.length === 1 ? "" : "s"} between ${formatWhen(new Date(range.start))} and ${formatWhen(new Date(range.end))} were cancelled.`);
    }
    if (actor.id !== drive.created_by && (plan.items.length > 0 || cancelIds.length > 0)) {
      await notify(c, drive.created_by, "reschedule_summary", `Reschedule: ${drive.title}`, `${plan.interviewerName} is unavailable. ${moved} moved, ${unresolved} need attention.`);
    }

    return { cancelled: plan.items.length, moved, unresolved, items: result };
  });
}
