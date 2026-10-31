import type { Role } from "../auth/roles";

export type Id = string;

export interface User {
  id: Id;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  skills: string[];
}

export type RoundType = "online_assessment" | "technical" | "hr" | "other";

export interface Round {
  id: Id;
  position: number;
  name: string;
  type: RoundType;
  durationMinutes: number;
  requiredSkills: string[];
  minGapMinutes: number;
  requiredCapacity: number;
}

export interface Drive {
  id: Id;
  title: string;
  company: string;
  windowStart: string;
  windowEnd: string;
  status: "draft" | "published";
  createdAt: string;
  rounds: Round[];
  /** Coordinators only. */
  counts?: { candidates: number; interviewers: number; interviews: number; openSlots: number };
  /** Candidates and interviewers only. */
  joined?: boolean;
}

export interface RoundInput {
  name: string;
  type: RoundType;
  durationMinutes: number;
  requiredSkills: string[];
  minGapMinutes: number;
  requiredCapacity: number;
}

export interface DriveInput {
  title: string;
  company: string;
  windowStart: string;
  windowEnd: string;
  rounds: RoundInput[];
}

export type InterviewStatus = "open" | "scheduled" | "completed" | "cancelled";

export interface Interview {
  id: Id;
  status: InterviewStatus;
  startsAt: string;
  endsAt: string;
  bookedVia: "solver" | "self_booking" | "reschedule" | null;
  drive: { id: Id; title: string; company: string };
  round: { id: Id; name: string; position: number; type: RoundType };
  candidate: { id: Id; name: string } | null;
  interviewer: { id: Id; name: string };
  room: { id: Id; name: string };
}

export interface Room {
  id: Id;
  name: string;
  capacity: number;
}

export interface Person {
  id: Id;
  name: string;
  email: string;
  skills: string[];
  maxInterviews: number | null;
  availabilityWindows: number;
  interviews: number;
}

export interface Participants {
  candidates: Person[];
  interviewers: Person[];
}

export interface TimeWindow {
  startsAt: string;
  endsAt: string;
}

export interface Availability {
  maxInterviews: number | null;
  windows: TimeWindow[];
}

export interface ScheduleReport {
  runId: Id;
  createdAt: string;
  durationMs: number;
  assigned: number;
  alreadyScheduled: number;
  unresolved: { candidate: { id: Id; name: string }; round: { id: Id; name: string; position: number }; reason: string }[];
  stats: { interviews: number; avgGapMinutes: number | null; interviewerUtilizationPct: number; roomUtilizationPct: number };
}

export interface OpenSlotsReport {
  created: number;
  perRound: { round: { id: Id; name: string; position: number }; demand: number; created: number }[];
}

export interface PlanOutcome {
  kind: "open_slot" | "new" | "none";
  startsAt?: string;
  endsAt?: string;
  interviewer?: { id: Id; name: string };
  room?: { id: Id; name: string };
  reason?: string;
}

export interface PlanItem {
  interview: Interview;
  outcome: PlanOutcome;
}

export interface ReschedulePreview {
  interviewer: { id: Id; name: string };
  affected: number;
  canMove: number;
  items: PlanItem[];
}

export interface RescheduleResult {
  cancelled: number;
  moved: number;
  unresolved: number;
  items: PlanItem[];
}

export interface RescheduleRequest {
  interviewerId: Id;
  from: string;
  to: string;
}

export interface AppNotification {
  id: Id;
  kind: string;
  title: string;
  body: string;
  interviewId: Id | null;
  read: boolean;
  createdAt: string;
}
