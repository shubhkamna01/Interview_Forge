import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { pool } from "../db/pool";
import { conflict, forbidden, unauthorized } from "../http/errors";
import { authenticate, currentUser, parse, rateLimit } from "../http/middleware";
import type { AuthUser } from "../http/types";
import { userDto } from "../services/dto";
import { hashPassword, signToken, verifyPassword } from "../services/passwords";

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 15 * 60_000, max: config.authRateLimitMax });

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));
const role = z.enum(["candidate", "interviewer", "coordinator"]);

export const skillsSchema = z
  .array(z.string().trim().toLowerCase().min(1).max(40, "A skill tag can be at most 40 characters."))
  .max(30, "Add at most 30 skills.")
  .transform((list) => [...new Set(list)]);

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Name is too long."),
  email,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password can be at most 72 characters."),
  role,
  accessCode: z.string().optional(),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
  role: role.optional(),
});

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Name is too long.").optional(),
  phone: z
    .string()
    .trim()
    .max(30, "Phone number is too long.")
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
  skills: skillsSchema.optional(),
});

function sameSecret(given: string | undefined, expected: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

authRouter.post("/signup", limiter, async (req, res) => {
  const body = parse(signupSchema, req.body);

  // Anyone can register as a candidate or interviewer; coordinators need the team's access code.
  if (body.role === "coordinator") {
    if (!config.coordinatorSignupCode) throw forbidden("Coordinator sign-up is turned off.");
    if (!sameSecret(body.accessCode, config.coordinatorSignupCode)) throw forbidden("That access code isn't right.");
  }

  const taken = await pool.query("SELECT 1 FROM users WHERE lower(email) = $1", [body.email]);
  if (taken.rowCount) throw conflict("An account with this email already exists.");

  const hash = await hashPassword(body.password);
  const { rows } = await pool.query<AuthUser>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, phone, skills`,
    [body.name, body.email, hash, body.role],
  );
  const user = rows[0];
  res.status(201).json({ token: signToken(user.id, user.role), user: userDto(user) });
});

authRouter.post("/login", limiter, async (req, res) => {
  const body = parse(loginSchema, req.body);

  const { rows } = await pool.query<AuthUser & { password_hash: string }>(
    "SELECT id, name, email, role, phone, skills, password_hash FROM users WHERE lower(email) = $1",
    [body.email],
  );
  const user = rows[0];
  const ok = await verifyPassword(body.password, user?.password_hash);
  if (!user || !ok) throw unauthorized("Incorrect email or password.");
  if (body.role && body.role !== user.role) throw forbidden("That account has a different role.");

  res.json({ token: signToken(user.id, user.role), user: userDto(user) });
});

authRouter.get("/me", authenticate, (req, res) => {
  res.json(userDto(currentUser(req)));
});

authRouter.put("/me", authenticate, async (req, res) => {
  const me = currentUser(req);
  const body = parse(profileSchema, req.body);

  const { rows } = await pool.query<AuthUser>(
    `UPDATE users SET
       name   = COALESCE($2, name),
       phone  = CASE WHEN $3::boolean THEN $4 ELSE phone END,
       skills = COALESCE($5, skills)
     WHERE id = $1
     RETURNING id, name, email, role, phone, skills`,
    [me.id, body.name ?? null, body.phone !== undefined, body.phone ?? null, body.skills ?? null],
  );
  res.json(userDto(rows[0]));
});
