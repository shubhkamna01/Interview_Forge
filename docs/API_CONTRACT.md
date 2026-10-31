# Interview Forge: API reference

Base path `/api`. JSON in, JSON out. Everything except sign-up, login and health needs `Authorization: Bearer <token>`.
Source of truth: `backend/src/routes/`. Types the website uses: `frontend/src/api/types.ts`.

**Errors** are always `{ "message": "Readable text" }` with a status code:
`400` invalid input · `401` not signed in or session expired (the website signs the user out) · `403` not allowed for this role ·
`404` not found · `409` conflict (slot taken, time clashes, wrong order, in use) · `429` too many sign-in attempts · `500` server problem.

**IDs** are UUID strings. **Times** are ISO 8601 with a timezone, for example `2026-11-02T09:00:00.000Z`.

Roles: **C** coordinator, **I** interviewer, **S** candidate (student).

## Auth

| Endpoint | Who | Notes |
|---|---|---|
| `POST /auth/signup` | anyone | `{ name, email, password (8-72), role, accessCode? }` → `201 { token, user }`. `accessCode` is required for `coordinator`. |
| `POST /auth/login` | anyone | `{ email, password, role? }` → `{ token, user }`. If `role` is given and differs from the account's, `403`. |
| `GET /auth/me` | all | → `user` |
| `PUT /auth/me` | all | `{ name?, phone?, skills? }` → `user`. Skills are lower-cased and de-duplicated. |

`user` = `{ id, name, email, role, phone, skills[] }`. Login and sign-up are rate limited per address.

## Drives

`drive` = `{ id, title, company, windowStart, windowEnd, status: "draft" | "published", createdAt, rounds[], counts?, joined? }`.
`counts` (`{ candidates, interviewers, interviews, openSlots }`) is for C. `joined` is for I and S.
`round` = `{ id, position, name, type, durationMinutes, requiredSkills[], minGapMinutes, requiredCapacity }`.
`type` is `online_assessment | technical | hr | other`. `minGapMinutes` is the least time after the previous round ends.

| Endpoint | Who | Notes |
|---|---|---|
| `GET /drives` | all | C: every drive. I and S: published drives only. |
| `POST /drives` | C | `{ title, company, windowStart, windowEnd, rounds[] }` → `201 drive` (draft). 1 to 8 rounds. The rounds, back to back with their gaps, must fit in the window (max 14 days). |
| `GET /drives/:id` | all | Drafts are only visible to C. |
| `PUT /drives/:id` | C | Same body as create. Draft drives only (`409` otherwise). |
| `DELETE /drives/:id` | C | Draft drives only. `204`. |
| `POST /drives/:id/publish` | C | → `drive` |
| `POST /drives/:id/unpublish` | C | `409` if interviews are scheduled. Releases open slots. |
| `GET /drives/:id/participants` | C | → `{ candidates[], interviewers[] }` with skills, availability counts, interview counts |
| `POST /drives/:id/join` | I, S | Register or join. `204`. |
| `DELETE /drives/:id/join` | I, S | `409` while they have interviews. `204`. |
| `GET /drives/:id/availability` | I, S | → `{ maxInterviews, windows: [{ startsAt, endsAt }] }` |
| `PUT /drives/:id/availability` | I, S | `{ maxInterviews?, windows[] }` replaces all windows. Windows must lie inside the drive window; overlaps are merged. `maxInterviews` applies to I only. |

Interviewers with no windows cannot be scheduled. Candidates with no windows are free any time in the drive.

## Scheduling

| Endpoint | Who | Notes |
|---|---|---|
| `POST /drives/:id/schedule` | C | Generates the schedule for a published drive in one transaction. Never moves existing interviews. Clears unbooked open slots first. |
| `GET /drives/:id/schedule/latest` | C | The last report, or `null`. |
| `POST /drives/:id/open-slots` | C | Creates open slots for candidates who still need a round, and notifies them. Replaces earlier unbooked open slots. |
| `GET /drives/:id/slots` | S | Open slots this candidate may book right now (next round only, respecting order, gap, availability and overlaps). |
| `POST /drives/:id/reschedule/preview` | C, I (self) | `{ interviewerId, from, to }` → who is affected and the plan for each. Writes nothing. |
| `POST /drives/:id/reschedule/apply` | C, I (self) | Same body. Recomputes inside a transaction, cancels affected interviews, moves them where possible, removes that time from the interviewer's availability, and notifies everyone affected. → `{ cancelled, moved, unresolved, items[] }` |

**Schedule report:** `{ runId, createdAt, durationMs, assigned, alreadyScheduled, unresolved: [{ candidate, round, reason }], stats: { interviews, avgGapMinutes, interviewerUtilizationPct, roomUtilizationPct } }`.

**Plan item:** `{ interview, outcome }` where `outcome.kind` is `open_slot`, `new` (with `startsAt`, `endsAt`, `interviewer`, `room`) or `none` (with `reason`).

## Interviews

`interview` = `{ id, status: "open" | "scheduled" | "completed" | "cancelled", startsAt, endsAt, bookedVia, drive, round, candidate | null, interviewer, room }`.
`candidate` is `null` for an open slot.

| Endpoint | Who | Notes |
|---|---|---|
| `GET /interviews?driveId=&includeCancelled=` | all | **The server decides what you see:** C everything, I their own, S their own. Cancelled are hidden unless asked. |
| `POST /interviews/:id/book` | S | Send an `Idempotency-Key` header (8 to 100 visible characters, new per click). Safe under simultaneous requests. `409` with a readable reason if the slot was just taken or breaks a rule. |
| `POST /interviews/:id/cancel-booking` | S (own), C | Reopens the slot. `409` if a later round is booked or it already started. |
| `GET /interviews/:id/calendar.ics` | the people involved, C | `text/calendar` attachment. |
| `GET /me/calendar.ics` | I, S | All your booked interviews in one file. |

## Rooms (C only)

`room` = `{ id, name, capacity }`. `GET /rooms`, `POST /rooms`, `PUT /rooms/:id` with `{ name, capacity }`, `DELETE /rooms/:id` (`409` while used by interviews). Names are unique, ignoring case.

## Notifications

| Endpoint | Notes |
|---|---|
| `GET /notifications` | → `{ items[], unreadCount }`, newest first, last 50. Item: `{ id, kind, title, body, interviewId, read, createdAt }`. |
| `POST /notifications/:id/read` | `204`. Only your own. |
| `POST /notifications/read-all` | `204` |

Kinds: `schedule_created`, `slots_open`, `booking_confirmed`, `booking_received`, `booking_cancelled`, `rescheduled`, `cancelled`, `reschedule_summary`.

## Health

`GET /health` → `{ "status": "ok" }` (checks the database).

## Rules the database enforces by itself

Overlapping interviews for the same interviewer, room or candidate are rejected (PostgreSQL exclusion constraints, back-to-back is allowed).
A candidate has at most one live interview per round. An open slot has no candidate; a scheduled interview always has one.
These hold even if the application code has a bug. See `backend/src/db/migrations/001_init.sql`.
