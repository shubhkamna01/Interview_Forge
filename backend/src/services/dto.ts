import type { AuthUser } from "../http/types";

interface Timestamped {
  toISOString(): string;
}
const iso = (d: Timestamped) => d.toISOString();

export const userDto = (u: AuthUser) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  phone: u.phone ?? null,
  skills: u.skills ?? [],
});

export interface RoundRow {
  id: string;
  position: number;
  name: string;
  type: string;
  duration_minutes: number;
  required_skills: string[];
  min_gap_minutes: number;
  required_capacity: number;
}

export const roundDto = (r: RoundRow) => ({
  id: r.id,
  position: r.position,
  name: r.name,
  type: r.type,
  durationMinutes: r.duration_minutes,
  requiredSkills: r.required_skills,
  minGapMinutes: r.min_gap_minutes,
  requiredCapacity: r.required_capacity,
});

/** One query shape for every place that shows an interview. */
export const INTERVIEW_SELECT = `
  SELECT i.id, i.status, i.starts_at, i.ends_at, i.booked_via,
         d.id AS drive_id, d.title AS drive_title, d.company AS drive_company,
         r.id AS round_id, r.name AS round_name, r.position AS round_position, r.type AS round_type,
         c.id AS candidate_id, c.name AS candidate_name,
         iv.id AS interviewer_id, iv.name AS interviewer_name,
         rm.id AS room_id, rm.name AS room_name
  FROM interviews i
  JOIN drives d  ON d.id = i.drive_id
  JOIN rounds r  ON r.id = i.round_id
  JOIN users iv  ON iv.id = i.interviewer_id
  JOIN rooms rm  ON rm.id = i.room_id
  LEFT JOIN users c ON c.id = i.candidate_id`;

export interface InterviewRow {
  id: string;
  status: string;
  starts_at: Date;
  ends_at: Date;
  booked_via: string | null;
  drive_id: string;
  drive_title: string;
  drive_company: string;
  round_id: string;
  round_name: string;
  round_position: number;
  round_type: string;
  candidate_id: string | null;
  candidate_name: string | null;
  interviewer_id: string;
  interviewer_name: string;
  room_id: string;
  room_name: string;
}

export const interviewDto = (r: InterviewRow) => ({
  id: r.id,
  status: r.status,
  startsAt: iso(r.starts_at),
  endsAt: iso(r.ends_at),
  bookedVia: r.booked_via,
  drive: { id: r.drive_id, title: r.drive_title, company: r.drive_company },
  round: { id: r.round_id, name: r.round_name, position: r.round_position, type: r.round_type },
  candidate: r.candidate_id ? { id: r.candidate_id, name: r.candidate_name! } : null,
  interviewer: { id: r.interviewer_id, name: r.interviewer_name },
  room: { id: r.room_id, name: r.room_name },
});

export type InterviewDto = ReturnType<typeof interviewDto>;
