-- InterviewForge schema. Plain PostgreSQL: runs unchanged on Supabase, Neon, RDS or a local server.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  email         text        NOT NULL,
  password_hash text        NOT NULL,
  role          text        NOT NULL CHECK (role IN ('candidate', 'interviewer', 'coordinator')),
  phone         text,
  skills        text[]      NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE rooms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  capacity   int         NOT NULL CHECK (capacity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rooms_name_key ON rooms (lower(name));

CREATE TABLE drives (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  company      text        NOT NULL,
  window_start timestamptz NOT NULL,
  window_end   timestamptz NOT NULL,
  status       text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by   uuid        NOT NULL REFERENCES users (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end > window_start)
);

CREATE TABLE rounds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id          uuid NOT NULL REFERENCES drives (id) ON DELETE CASCADE,
  position          int  NOT NULL CHECK (position >= 1),
  name              text NOT NULL,
  type              text NOT NULL DEFAULT 'technical'
                    CHECK (type IN ('online_assessment', 'technical', 'hr', 'other')),
  duration_minutes  int  NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  required_skills   text[] NOT NULL DEFAULT '{}',
  -- Progression rule: this round may start at least this long after the previous round ends.
  min_gap_minutes   int  NOT NULL DEFAULT 0 CHECK (min_gap_minutes >= 0),
  -- People in the room (candidate + panel). A room must hold at least this many.
  required_capacity int  NOT NULL DEFAULT 2 CHECK (required_capacity >= 1),
  UNIQUE (drive_id, position)
);

-- Candidates register for a drive, interviewers join it. Interviewers may cap how many interviews they take.
CREATE TABLE drive_participants (
  drive_id       uuid NOT NULL REFERENCES drives (id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  max_interviews int CHECK (max_interviews IS NULL OR max_interviews > 0),
  joined_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (drive_id, user_id)
);

-- Time windows a participant can do interviews in. Interviewers: required. Candidates: optional.
CREATE TABLE availability (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id  uuid NOT NULL,
  user_id   uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  CHECK (ends_at > starts_at),
  FOREIGN KEY (drive_id, user_id) REFERENCES drive_participants (drive_id, user_id) ON DELETE CASCADE
);
CREATE INDEX availability_lookup ON availability (drive_id, user_id);

-- One row is one interview time slot. candidate_id IS NULL means "open slot" that a candidate can book.
CREATE TABLE interviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id       uuid NOT NULL REFERENCES drives (id) ON DELETE CASCADE,
  round_id       uuid NOT NULL REFERENCES rounds (id) ON DELETE CASCADE,
  candidate_id   uuid REFERENCES users (id),
  interviewer_id uuid NOT NULL REFERENCES users (id),
  room_id        uuid NOT NULL REFERENCES rooms (id),
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  status         text NOT NULL CHECK (status IN ('open', 'scheduled', 'completed', 'cancelled')),
  booked_via     text CHECK (booked_via IN ('solver', 'self_booking', 'reschedule')),
  booked_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (
    (status = 'open' AND candidate_id IS NULL)
    OR (status IN ('scheduled', 'completed') AND candidate_id IS NOT NULL)
    OR status = 'cancelled'
  )
);
CREATE INDEX interviews_drive ON interviews (drive_id);
CREATE INDEX interviews_candidate ON interviews (candidate_id);
CREATE INDEX interviews_interviewer ON interviews (interviewer_id);

-- The integrity boundary: the database itself refuses overlapping bookings,
-- even if two requests race or the application has a bug. Ranges are half-open,
-- so back-to-back interviews (10:00-10:30, 10:30-11:00) are fine.
ALTER TABLE interviews ADD CONSTRAINT interviews_no_interviewer_overlap
  EXCLUDE USING gist (interviewer_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');
ALTER TABLE interviews ADD CONSTRAINT interviews_no_room_overlap
  EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');
ALTER TABLE interviews ADD CONSTRAINT interviews_no_candidate_overlap
  EXCLUDE USING gist (candidate_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (candidate_id IS NOT NULL AND status <> 'cancelled');

-- A candidate can hold at most one live interview per round.
CREATE UNIQUE INDEX interviews_one_per_round
  ON interviews (round_id, candidate_id)
  WHERE candidate_id IS NOT NULL AND status <> 'cancelled';

-- Lets a retried booking request return the original result instead of booking twice.
CREATE TABLE idempotency_keys (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key        text NOT NULL,
  response   jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind         text NOT NULL,
  title        text NOT NULL,
  body         text NOT NULL,
  interview_id uuid REFERENCES interviews (id) ON DELETE SET NULL,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user ON notifications (user_id, created_at DESC);

CREATE TABLE schedule_runs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id   uuid NOT NULL REFERENCES drives (id) ON DELETE CASCADE,
  created_by uuid REFERENCES users (id),
  report     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schedule_runs_drive ON schedule_runs (drive_id, created_at DESC);
