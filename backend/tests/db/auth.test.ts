import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../../src/db/pool";
import { errorHandler, rateLimit } from "../../src/http/middleware";
import { api, auth, resetDb, signup } from "./helpers";

beforeEach(resetDb);
afterAll(() => pool.end());

const valid = { name: "Aarav Sharma", email: "aarav@example.com", password: "password123", role: "candidate" };

describe("sign up", () => {
  it("creates an account and never returns the password hash", async () => {
    const res = await api().post("/api/auth/signup").send(valid);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ name: "Aarav Sharma", email: "aarav@example.com", role: "candidate", skills: [] });
    expect(JSON.stringify(res.body)).not.toMatch(/hash|password/i);
    const stored = await pool.query("SELECT password_hash FROM users");
    expect(stored.rows[0].password_hash).not.toBe("password123");
  });

  it("rejects duplicate emails (case-insensitive), weak passwords and bad input", async () => {
    await api().post("/api/auth/signup").send(valid).expect(201);
    const dup = await api().post("/api/auth/signup").send({ ...valid, email: "AARAV@example.com" });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toMatch(/already exists/);
    expect((await api().post("/api/auth/signup").send({ ...valid, email: "b@example.com", password: "short" })).status).toBe(400);
    expect((await api().post("/api/auth/signup").send({ ...valid, email: "not-an-email" })).status).toBe(400);
    expect((await api().post("/api/auth/signup").send({ ...valid, role: "admin" })).status).toBe(400);
  });

  it("only allows coordinator sign-up with the access code", async () => {
    const coord = { ...valid, email: "c@example.com", role: "coordinator" };
    expect((await api().post("/api/auth/signup").send(coord)).status).toBe(403);
    expect((await api().post("/api/auth/signup").send({ ...coord, accessCode: "wrong" })).status).toBe(403);
    expect((await api().post("/api/auth/signup").send({ ...coord, accessCode: "team-code-123" })).status).toBe(201);
  });
});

describe("log in", () => {
  it("accepts the right password and gives the same error for unknown email and wrong password", async () => {
    await api().post("/api/auth/signup").send(valid).expect(201);
    expect((await api().post("/api/auth/login").send({ email: valid.email, password: valid.password })).status).toBe(200);
    const wrong = await api().post("/api/auth/login").send({ email: valid.email, password: "nope-nope" });
    const unknown = await api().post("/api/auth/login").send({ email: "ghost@example.com", password: "nope-nope" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it("refuses a login that picks the wrong role", async () => {
    await api().post("/api/auth/signup").send(valid).expect(201);
    const res = await api().post("/api/auth/login").send({ email: valid.email, password: valid.password, role: "coordinator" });
    expect(res.status).toBe(403);
  });
});

describe("sessions and profile", () => {
  it("rejects missing, malformed and forged tokens", async () => {
    expect((await api().get("/api/auth/me")).status).toBe(401);
    expect((await api().get("/api/auth/me").set("Authorization", "Bearer garbage")).status).toBe(401);
    expect((await api().get("/api/auth/me").set("Authorization", "Basic abc")).status).toBe(401);
  });

  it("stops working once the user is deleted", async () => {
    const me = await signup("candidate");
    expect((await api().get("/api/auth/me").set(auth(me))).status).toBe(200);
    await pool.query("DELETE FROM users WHERE id = $1", [me.id]);
    expect((await api().get("/api/auth/me").set(auth(me))).status).toBe(401);
  });

  it("updates the profile and normalises skills", async () => {
    const me = await signup("interviewer");
    const res = await api().put("/api/auth/me").set(auth(me)).send({ phone: " 98765 ", skills: [" DSA ", "dsa", "System Design"] });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("98765");
    expect(res.body.skills).toEqual(["dsa", "system design"]);
    const cleared = await api().put("/api/auth/me").set(auth(me)).send({ phone: "" });
    expect(cleared.body.phone).toBeNull();
    expect(cleared.body.skills).toEqual(["dsa", "system design"]); // untouched
  });
});

describe("role permissions", () => {
  it("blocks every role from actions that aren't theirs", async () => {
    const coordinator = await signup("coordinator");
    const interviewer = await signup("interviewer");
    const candidate = await signup("candidate");
    const body = { title: "x", company: "y", windowStart: "2030-01-01T09:00:00Z", windowEnd: "2030-01-01T17:00:00Z", rounds: [{ name: "r", durationMinutes: 30 }] };

    expect((await api().post("/api/drives").set(auth(candidate)).send(body)).status).toBe(403);
    expect((await api().post("/api/drives").set(auth(interviewer)).send(body)).status).toBe(403);
    expect((await api().get("/api/rooms").set(auth(candidate))).status).toBe(403);
    expect((await api().post("/api/rooms").set(auth(interviewer)).send({ name: "A", capacity: 2 })).status).toBe(403);
    expect((await api().get("/api/rooms").set(auth(coordinator))).status).toBe(200);

    const drive = await api().post("/api/drives").set(auth(coordinator)).send(body).expect(201);
    const id = drive.body.id;
    expect((await api().post(`/api/drives/${id}/schedule`).set(auth(interviewer))).status).toBe(403);
    expect((await api().post(`/api/drives/${id}/open-slots`).set(auth(candidate))).status).toBe(403);
    expect((await api().get(`/api/drives/${id}/participants`).set(auth(candidate))).status).toBe(403);
    expect((await api().post(`/api/drives/${id}/join`).set(auth(coordinator))).status).toBe(403);
    expect((await api().get(`/api/drives/${id}/slots`).set(auth(interviewer))).status).toBe(403);
    expect((await api().get("/api/drives")).status).toBe(401);
  });

  it("treats malformed ids as not found and bad JSON as a 400, never a 500", async () => {
    const coordinator = await signup("coordinator");
    expect((await api().get("/api/drives/not-a-uuid").set(auth(coordinator))).status).toBe(404);
    expect((await api().get("/api/drives/00000000-0000-4000-8000-000000000000").set(auth(coordinator))).status).toBe(404);
    const bad = await api().post("/api/rooms").set(auth(coordinator)).set("Content-Type", "application/json").send("{oops");
    expect(bad.status).toBe(400);
    expect((await api().get("/api/nothing-here")).status).toBe(404);
  });
});

describe("rate limiter", () => {
  it("answers 429 after too many attempts", async () => {
    const app = express();
    app.use(rateLimit({ windowMs: 60_000, max: 3 }), (_req, res) => void res.json({ ok: true }));
    app.use(errorHandler);
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await request(app).get("/")).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });
});
