import { Router } from "express";
import { z } from "zod";
import { forbidden, notFound } from "../http/errors";
import { authenticate, currentUser, idParam, parse, requireRole } from "../http/middleware";
import { bookSlot, cancelBooking } from "../services/booking";
import { buildCalendar } from "../services/ics";
import { fetchInterview, fetchInterviews } from "../services/interviews";
import { pool } from "../db/pool";

export const interviewsRouter = Router();
interviewsRouter.use(authenticate);

const listQuery = z.object({
  driveId: z.uuid().optional(),
  includeCancelled: z.enum(["true", "false"]).optional(),
});

const keySchema = z
  .string()
  .regex(/^[\x21-\x7e]{8,100}$/, "Idempotency-Key must be 8 to 100 visible characters.")
  .optional();

/** Coordinators see everything, interviewers their own, candidates theirs. The server decides; the UI doesn't filter. */
interviewsRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  const q = parse(listQuery, req.query);
  res.json(
    await fetchInterviews(pool, {
      driveId: q.driveId,
      includeCancelled: q.includeCancelled === "true",
      candidateId: user.role === "candidate" ? user.id : undefined,
      interviewerId: user.role === "interviewer" ? user.id : undefined,
    }),
  );
});

interviewsRouter.post("/:id/book", requireRole("candidate"), async (req, res) => {
  const key = parse(keySchema, req.header("idempotency-key"));
  res.json(await bookSlot(currentUser(req), idParam(req), key ?? null));
});

interviewsRouter.post("/:id/cancel-booking", requireRole("candidate", "coordinator"), async (req, res) => {
  res.json(await cancelBooking(currentUser(req), idParam(req)));
});

function sendCalendar(res: import("express").Response, filename: string, body: string) {
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(body);
}

interviewsRouter.get("/:id/calendar.ics", async (req, res) => {
  const user = currentUser(req);
  const interview = await fetchInterview(pool, idParam(req));
  if (!interview || interview.status === "open") throw notFound("Interview not found.");
  const mine = interview.candidate?.id === user.id || interview.interviewer.id === user.id;
  if (user.role !== "coordinator" && !mine) throw forbidden();
  sendCalendar(res, "interview.ics", buildCalendar([interview]));
});

export const meRouter = Router();
meRouter.use(authenticate);

/** Every upcoming interview of the signed-in person in one calendar file. */
meRouter.get("/calendar.ics", async (req, res) => {
  const user = currentUser(req);
  if (user.role === "coordinator") throw forbidden("Coordinators don't have personal interviews.");
  const list = await fetchInterviews(pool, {
    candidateId: user.role === "candidate" ? user.id : undefined,
    interviewerId: user.role === "interviewer" ? user.id : undefined,
  });
  const booked = list.filter((i) => i.status === "scheduled" || i.status === "completed");
  sendCalendar(res, "my-interviews.ics", buildCalendar(booked));
});
