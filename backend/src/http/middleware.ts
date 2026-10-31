import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import type { z } from "zod";
import { pool } from "../db/pool";
import { verifyToken } from "../services/passwords";
import { badRequest, forbidden, HttpError, notFound, unauthorized } from "./errors";
import type { AuthUser, Role } from "./types";

/** Requires a valid Bearer token and loads the current user from the database. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw unauthorized();

  let sub: string;
  try {
    sub = verifyToken(token).sub;
  } catch {
    throw unauthorized("Your session has expired. Please sign in again.");
  }

  const { rows } = await pool.query<AuthUser>(
    "SELECT id, name, email, role, phone, skills FROM users WHERE id = $1",
    [sub],
  );
  if (!rows[0]) throw unauthorized();
  req.user = rows[0];
  next();
};

/** The role is read from the database (not the token) so a role change takes effect immediately. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Validates untrusted input. The first problem becomes a readable 400 message. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue.path.length ? `${issue.path.join(".")}: ` : "";
  throw badRequest(`${field}${issue.message}`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route ids must be UUIDs; anything else is simply "not found" (and never reaches the database). */
export function idParam(req: Request, name = "id"): string {
  const value = req.params[name];
  if (typeof value !== "string" || !UUID.test(value)) throw notFound();
  return value;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/** Small in-memory limiter. Good for one server; use a shared store if you run several. */
export function rateLimit({ windowMs, max }: RateLimitOptions): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);

    const key = req.ip ?? "unknown";
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
    }
    next();
  };
}

interface PgLikeError {
  code?: string;
  constraint?: string;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message });
    return;
  }

  // Database rules (see 001_init.sql) turn races into clear conflicts instead of corrupt data.
  const pgErr = err as PgLikeError;
  switch (pgErr?.code) {
    case "23P01": // exclusion_violation: overlapping interviewer / room / candidate
      res.status(409).json({ message: "That time clashes with another interview. Please pick a different time." });
      return;
    case "23505": // unique_violation
      res.status(409).json({ message: "That already exists." });
      return;
    case "23503": // foreign_key_violation
      res.status(409).json({ message: "This is still in use, or something it depends on no longer exists." });
      return;
    case "22P02": // invalid_text_representation (e.g. a bad uuid)
      res.status(400).json({ message: "Invalid value." });
      return;
    case "40001": // serialization_failure
    case "40P01": // deadlock_detected
      res.status(409).json({ message: "Things changed at the same moment. Please try again." });
      return;
  }

  // Body-parser errors (malformed JSON, body too large) carry their own 4xx status.
  const status = (err as { status?: number })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ message: status === 413 ? "That request is too large." : "The request couldn't be read." });
    return;
  }

  console.error(err);
  res.status(500).json({ message: "Something went wrong on our side. Please try again." });
};
