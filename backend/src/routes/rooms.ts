import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { conflict, notFound } from "../http/errors";
import { authenticate, idParam, parse, requireRole } from "../http/middleware";

export const roomsRouter = Router();
roomsRouter.use(authenticate, requireRole("coordinator"));

const roomSchema = z.object({
  name: z.string().trim().min(1, "Enter a room name.").max(60, "Room name is too long."),
  capacity: z.number({ error: "Enter the capacity." }).int("Capacity must be a whole number.").min(1, "Capacity must be at least 1.").max(500),
});

const toDto = (r: { id: string; name: string; capacity: number }) => ({ id: r.id, name: r.name, capacity: r.capacity });

roomsRouter.get("/", async (_req, res) => {
  const { rows } = await pool.query("SELECT id, name, capacity FROM rooms ORDER BY name");
  res.json(rows.map(toDto));
});

roomsRouter.post("/", async (req, res) => {
  const body = parse(roomSchema, req.body);
  const dup = await pool.query("SELECT 1 FROM rooms WHERE lower(name) = lower($1)", [body.name]);
  if (dup.rowCount) throw conflict("A room with that name already exists.");
  const { rows } = await pool.query("INSERT INTO rooms (name, capacity) VALUES ($1, $2) RETURNING id, name, capacity", [body.name, body.capacity]);
  res.status(201).json(toDto(rows[0]));
});

roomsRouter.put("/:id", async (req, res) => {
  const id = idParam(req);
  const body = parse(roomSchema, req.body);
  const dup = await pool.query("SELECT 1 FROM rooms WHERE lower(name) = lower($1) AND id <> $2", [body.name, id]);
  if (dup.rowCount) throw conflict("A room with that name already exists.");
  const { rows } = await pool.query("UPDATE rooms SET name = $2, capacity = $3 WHERE id = $1 RETURNING id, name, capacity", [id, body.name, body.capacity]);
  if (!rows[0]) throw notFound("Room not found.");
  res.json(toDto(rows[0]));
});

roomsRouter.delete("/:id", async (req, res) => {
  const id = idParam(req);
  const used = await pool.query("SELECT 1 FROM interviews WHERE room_id = $1 AND status <> 'cancelled' LIMIT 1", [id]);
  if (used.rowCount) throw conflict("This room is used by interviews. Cancel or move them first.");
  // Only cancelled history may remain; it's removed with the room.
  await pool.query("DELETE FROM interviews WHERE room_id = $1 AND status = 'cancelled'", [id]);
  const { rowCount } = await pool.query("DELETE FROM rooms WHERE id = $1", [id]);
  if (!rowCount) throw notFound("Room not found.");
  res.status(204).end();
});
