import { Router } from "express";
import { z } from "zod";
import { authenticate, currentUser, idParam, parse, requireRole } from "../http/middleware";
import { listEligibleSlots } from "../services/booking";
import {
  availabilitySchema,
  createDrive,
  deleteDrive,
  driveSchema,
  getAvailability,
  getDrive,
  joinDrive,
  leaveDrive,
  listDrives,
  listParticipants,
  setAvailability,
  setPublished,
  updateDrive,
} from "../services/drives";
import { applyReschedule, previewReschedule } from "../services/reschedule";
import { createOpenSlots, latestRun, runSchedule } from "../services/schedule";

export const drivesRouter = Router();
drivesRouter.use(authenticate);

const coordinator = requireRole("coordinator");
const attendee = requireRole("candidate", "interviewer");

const rescheduleSchema = z.object({
  interviewerId: z.uuid("Choose an interviewer."),
  from: z.iso.datetime({ offset: true, error: "Enter a valid start time." }),
  to: z.iso.datetime({ offset: true, error: "Enter a valid end time." }),
});

drivesRouter.get("/", async (req, res) => {
  res.json(await listDrives(currentUser(req)));
});

drivesRouter.post("/", coordinator, async (req, res) => {
  res.status(201).json(await createDrive(currentUser(req), parse(driveSchema, req.body)));
});

drivesRouter.get("/:id", async (req, res) => {
  res.json(await getDrive(currentUser(req), idParam(req)));
});

drivesRouter.put("/:id", coordinator, async (req, res) => {
  res.json(await updateDrive(currentUser(req), idParam(req), parse(driveSchema, req.body)));
});

drivesRouter.delete("/:id", coordinator, async (req, res) => {
  await deleteDrive(idParam(req));
  res.status(204).end();
});

drivesRouter.post("/:id/publish", coordinator, async (req, res) => {
  res.json(await setPublished(currentUser(req), idParam(req), true));
});

drivesRouter.post("/:id/unpublish", coordinator, async (req, res) => {
  res.json(await setPublished(currentUser(req), idParam(req), false));
});

drivesRouter.get("/:id/participants", coordinator, async (req, res) => {
  res.json(await listParticipants(idParam(req)));
});

// Candidates register, interviewers join.
drivesRouter.post("/:id/join", attendee, async (req, res) => {
  await joinDrive(currentUser(req), idParam(req));
  res.status(204).end();
});

drivesRouter.delete("/:id/join", attendee, async (req, res) => {
  await leaveDrive(currentUser(req), idParam(req));
  res.status(204).end();
});

drivesRouter.get("/:id/availability", attendee, async (req, res) => {
  res.json(await getAvailability(currentUser(req), idParam(req)));
});

drivesRouter.put("/:id/availability", attendee, async (req, res) => {
  res.json(await setAvailability(currentUser(req), idParam(req), parse(availabilitySchema, req.body)));
});

drivesRouter.post("/:id/schedule", coordinator, async (req, res) => {
  res.json(await runSchedule(currentUser(req), idParam(req)));
});

drivesRouter.get("/:id/schedule/latest", coordinator, async (req, res) => {
  res.json(await latestRun(idParam(req)));
});

drivesRouter.post("/:id/open-slots", coordinator, async (req, res) => {
  res.json(await createOpenSlots(idParam(req)));
});

drivesRouter.get("/:id/slots", requireRole("candidate"), async (req, res) => {
  res.json(await listEligibleSlots(currentUser(req), idParam(req)));
});

drivesRouter.post("/:id/reschedule/preview", requireRole("coordinator", "interviewer"), async (req, res) => {
  res.json(await previewReschedule(currentUser(req), idParam(req), parse(rescheduleSchema, req.body)));
});

drivesRouter.post("/:id/reschedule/apply", requireRole("coordinator", "interviewer"), async (req, res) => {
  res.json(await applyReschedule(currentUser(req), idParam(req), parse(rescheduleSchema, req.body)));
});

