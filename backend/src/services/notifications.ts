import { config } from "../config";
import type { Db } from "../db/pool";

const whenFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: config.appTimezone,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** "Fri, 30 Oct, 9:30 am" in the configured timezone. */
export const formatWhen = (d: Date) => whenFormat.format(d);

/** Writes an in-app notification. Call it with the same client as the change, so both commit (or roll back) together. */
export async function notify(
  db: Db,
  userId: string,
  kind: string,
  title: string,
  body: string,
  interviewId: string | null = null,
): Promise<void> {
  await db.query(
    "INSERT INTO notifications (user_id, kind, title, body, interview_id) VALUES ($1, $2, $3, $4, $5)",
    [userId, kind, title, body, interviewId],
  );
}
