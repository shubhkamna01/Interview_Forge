# Interview Forge

Constraint-aware interview scheduling for campus placement drives.
A coordinator defines a drive and its interview rounds. Interviewers and candidates add their availability.
The scheduler assigns candidates, interviewers, rooms and time slots without breaking a rule, tells you what it could not place and why,
lets candidates book the remaining slots themselves without double-booking, and repairs the schedule when someone cancels.

```
frontend/   React + TypeScript + Vite   (the website)
backend/    Node + Express + TypeScript (the API and the scheduling engine)
docs/       API_CONTRACT.md             (every endpoint, for anyone who calls the API)
```

## Run it (5 minutes, nothing to install except Node 20+)

```bash
# terminal 1: the backend. Starts its own PostgreSQL, creates the tables and demo data.
cd backend
npm install
npm run dev            # first run takes a few seconds longer

# terminal 2: the website
cd frontend
npm install
npm run dev            # open the address it prints (http://localhost:5173)
```

Demo accounts (created by `npm run dev`, password `forge123`):

| Role | Email |
|---|---|
| Coordinator | `coordinator@interviewforge.com` |
| Interviewer | `interviewer@interviewforge.com` |
| Candidate | `candidate@interviewforge.com` |

On the sign-in page, pick a role and press **Fill demo credentials**. Everyone can also **Create an account**
(coordinators need an access code, see below).

**A good first tour:** sign in as the coordinator, open **Drives**, open *Campus Drive 2026*, press **Generate schedule**,
and read the report (it lists anyone it could not place, with the reason). Then sign in as the candidate to see the booked rounds,
or as the interviewer to see yours and try **I can't make it**.

## What each role can do

| | Coordinator | Interviewer | Candidate |
|---|---|---|---|
| Create, edit, publish drives and rounds | yes | | |
| Add rooms and capacities | yes | | |
| Join a drive, set availability and skills | | yes | register, optional availability |
| Generate the schedule, open slots, see everything | yes | | |
| See their own interviews, export to calendar | | yes | yes |
| Pick a time slot (self-booking), cancel a booking | cancel only | | yes |
| Handle an interviewer cancelling | yes | for themselves | |
| In-app notifications | yes | yes | yes |

The server enforces this on every request. Hiding a page in the browser is only for convenience.

## Features (the order from the project plan)

1. **Role-based dashboards and navigation.** Overview, Drives, Schedule and Availability, different for each role.
2. **Placement drives.** Name, company, date and scheduling window, rounds with order, duration, minimum gap after the previous round,
   required interviewer skills and room size. Draft and published states. Saved in PostgreSQL.
3. **Accounts and roles.** Sign up, log in, profile (name, phone, skill tags), JWT sessions, role checks on every route.
4. **Availability, skills and rooms.** Time windows per person per drive, an interviewer's interview limit, skill tags, rooms with capacity.
5. **Constraint-based schedule generation.** See "How scheduling works" below.
6. **Candidate self-booking.** Only eligible slots are shown. Booking is safe when many people click at once.
7. **Rescheduling.** When an interviewer cancels: preview who is affected and where they could go, then apply. Only affected interviews move.
8. **Notifications and calendar export.** In-app notifications (bell in the top bar), downloadable `.ics` files for one interview or all of yours.
9. **Tests and deployment notes.** See "Testing" and "Deploying".

Not built yet (kept for later, as planned): minimal-disruption *optimisation*, conditional pass/fail routing between rounds, operations analytics,
email notifications, Google Calendar sync, Redis.

## How scheduling works

The engine (`backend/src/scheduling/`) is plain TypeScript with no database access, so every rule is easy to test.

**Hard rules, never broken:** nobody and no room is in two places at once; interviewers are available and have the required skills;
rooms are free and big enough; durations match the round; rounds happen in order with the minimum gap; interviewers stay under their limit;
everything stays inside the drive window and inside the availability people gave.

**Method (a heuristic, not a proof of optimality):**

1. Handle the **most constrained candidates first** (least usable time) so they get first pick of scarce slots.
2. For each candidate, go round by round and take the **earliest feasible slot** after the previous round. This keeps waiting time short.
3. Among interviewers who fit, use the **least busy** one, and the **smallest room** that fits. This spreads load and keeps big rooms free.
4. Anything that cannot be placed is **reported with a reason** (for example "No interviewer has the required skills (hr)").
   A rule is never relaxed to make a schedule look complete.
5. Before saving, an independent checker re-verifies every rule. A bug in step 1 to 3 cannot reach the database.

Existing interviews are never moved by a new run. Re-running is safe.

**Measured on the development machine** (one run each, 3 rounds per candidate, resources sized so that everything fits):

| Candidates | Interviews | Time to generate | Rule violations |
|---|---|---|---|
| 24 | 72 | 12 ms | 0 |
| 100 | 300 | 23 ms | 0 |
| 300 | 900 | 141 ms | 0 |
| 1000 | 3000 | 1.5 s | 0 |

These times are for the scheduling calculation only, not for saving to the database. Your numbers will differ on other hardware.

## Why double-booking cannot happen

Many candidates may click the same slot at the same moment. Three layers protect it (`backend/src/services/booking.ts`):

1. **A transaction that re-checks.** Booking runs in one PostgreSQL transaction. It locks the slot row (`SELECT ... FOR UPDATE`),
   so simultaneous requests for the same slot queue up. The first one wins; the others see the slot is taken and get a clear
   "just taken" message. All rules are re-checked against current data inside the transaction.
2. **Database constraints.** Even if the application had a bug, PostgreSQL itself rejects overlapping interviews for the same
   interviewer, room or candidate (exclusion constraints), and a second interview for the same round (unique index).
3. **Idempotency keys.** Each click sends an `Idempotency-Key`. A retried or double-submitted request returns the original result and books once.

Any failure rolls back the whole transaction, including its notifications. Nothing is half-saved.

## Testing

```bash
cd backend && npm test          # 77 tests, run against a real PostgreSQL that the tests start themselves
cd frontend && npm run test:ui  # 7 browser-style tests of the real screens (needs the backend running, see below)
```

What the backend tests cover: every scheduling rule (including 300 random scenarios checked by an independent validator),
sign-up/login/permissions, drives and rounds, availability, rooms, schedule generation (and full rollback when something fails midway),
the database refusing double-booking even when the application is bypassed, 12 candidates racing for one slot (exactly one wins),
retries with the same idempotency key, one candidate racing for two overlapping slots, a 36-request free-for-all,
rescheduling (only affected interviews change), notifications, and `.ics` export permissions.

The UI tests render the real app and click through sign-in, creating and publishing a drive, generating a schedule, managing rooms,
role fences, sign-up, registering, booking every round by picking slots, editing availability and handling an interviewer cancellation.
To run them: `cd backend && rm -rf .data && PORT=8124 npm run dev`, then in another terminal `cd frontend && npm run test:ui`.

## Deploying

The database is plain PostgreSQL, so a hosted one such as **Supabase** works as is.

**Database (Supabase):** create a project, then copy the connection string from *Project Settings > Database*.

**Backend** (any Node host, for example Render or Railway). Build: `npm ci --omit=dev`. Start: `npm start`. Environment:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Supabase connection string |
| `DATABASE_SSL` | `true` |
| `JWT_SECRET` | a random string of 32+ characters (`openssl rand -hex 32`). The server refuses to start without it. |
| `CORS_ORIGIN` | your website's address, for example `https://interviewforge.netlify.app` |
| `COORDINATOR_SIGNUP_CODE` | a secret code for your placement team. Without it nobody can sign up as a coordinator. |
| `TRUST_PROXY` | `1` when behind the host's proxy, so rate limiting sees real client addresses |
| `APP_TIMEZONE` | for times written in notifications, e.g. `Asia/Kolkata` |

Tables are created automatically on startup (`backend/src/db/migrations`). Do **not** run the demo seed in production.

**Frontend** (Netlify, Vercel, any static host). Build: `npm run build`, publish `dist/`.
Set `VITE_API_URL` to the backend's address plus `/api`, for example `https://interviewforge-api.onrender.com/api`.

## Choices that differ from the original abstract

| Abstract | What was built | Why |
|---|---|---|
| Next.js route handlers | Vite + React frontend, separate Express API | The frontend already existed as a Vite app. The API is a clean REST service any client can use. |
| Supabase Auth | Own sign-up/login with hashed passwords and JWT | Keeps the API self-contained. The database is still Supabase-compatible PostgreSQL. |
| Supabase Realtime | The bell refreshes every 30 seconds and when the tab regains focus | Simple and reliable. Realtime can replace it later. |
| date-fns | Built-in `Intl` date formatting | No extra library needed so far. |

## Known limits

- A drive's form takes one day (date plus start and end time). The API supports windows up to 14 days.
- Rooms are available during the whole drive window. There are no per-room blocked times yet.
- One interviewer per interview (no multi-person panels yet). A round's "room must hold N people" still applies.
- Candidates' "preferences" are their availability windows.
- The sign-in rate limiter lives in memory, which is right for one server. Several servers would need a shared store.
- The login token is kept in the browser's local storage (simple, but readable by injected scripts). `httpOnly` cookies are the stricter option if needed.
- Rescheduling first tries open slots, then free time. It preserves unaffected interviews but does not search for the best possible rearrangement.
