import { Router } from "express";
import { pool } from "../db/pool";
import { notFound } from "../http/errors";
import { authenticate, currentUser, idParam } from "../http/middleware";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

interface Row {
  id: string;
  kind: string;
  title: string;
  body: string;
  interview_id: string | null;
  read_at: Date | null;
  created_at: Date;
}

const toDto = (r: Row) => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  interviewId: r.interview_id,
  read: r.read_at !== null,
  createdAt: r.created_at.toISOString(),
});

notificationsRouter.get("/", async (req, res) => {
  const me = currentUser(req);
  const [list, unread] = await Promise.all([
    pool.query<Row>("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT 50", [me.id]),
    pool.query<{ n: number }>("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [me.id]),
  ]);
  res.json({ items: list.rows.map(toDto), unreadCount: unread.rows[0].n });
});

notificationsRouter.post("/read-all", async (req, res) => {
  await pool.query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [currentUser(req).id]);
  res.status(204).end();
});

notificationsRouter.post("/:id/read", async (req, res) => {
  const { rowCount } = await pool.query(
    "UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2",
    [idParam(req), currentUser(req).id],
  );
  if (!rowCount) throw notFound();
  res.status(204).end();
});
