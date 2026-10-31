import type { Db } from "../db/pool";
import { INTERVIEW_SELECT, interviewDto, type InterviewRow } from "./dto";

export interface InterviewFilter {
  driveId?: string;
  candidateId?: string;
  interviewerId?: string;
  includeCancelled?: boolean;
  limit?: number;
}

export async function fetchInterviews(db: Db, f: InterviewFilter) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };

  if (f.driveId) add("i.drive_id = ?", f.driveId);
  if (f.candidateId) add("i.candidate_id = ?", f.candidateId);
  if (f.interviewerId) add("i.interviewer_id = ?", f.interviewerId);
  if (!f.includeCancelled) where.push("i.status <> 'cancelled'");

  params.push(Math.min(f.limit ?? 1000, 2000));
  const { rows } = await db.query<InterviewRow>(
    `${INTERVIEW_SELECT}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY i.starts_at, r.position, i.id
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(interviewDto);
}

export async function fetchInterview(db: Db, id: string) {
  const { rows } = await db.query<InterviewRow>(`${INTERVIEW_SELECT} WHERE i.id = $1`, [id]);
  return rows[0] ? interviewDto(rows[0]) : null;
}
