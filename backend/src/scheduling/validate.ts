import { contains } from "./ranges";
import type { BusyInterview, ScheduleInput } from "./types";

export interface ProposedInterview {
  candidateId: string | null;
  roundId: string;
  interviewerId: string;
  roomId: string;
  start: number;
  end: number;
}

/**
 * Independent checker for the hard constraints. Used as a safety net after the solver runs
 * (a bug there must never reach the database) and as the oracle in the tests.
 * `subject` are the interviews being checked; `existing` are the others they must not clash with.
 * Returns human-readable violations; an empty array means the schedule is valid.
 */
export function validateSchedule(input: ScheduleInput, subject: ProposedInterview[], existing: BusyInterview[] = []): string[] {
  const problems: string[] = [];
  const roundById = new Map(input.rounds.map((r) => [r.id, r]));
  const interviewer = new Map(input.interviewers.map((p) => [p.id, p]));
  const candidate = new Map(input.candidates.map((p) => [p.id, p]));
  const room = new Map(input.rooms.map((r) => [r.id, r]));

  const all = [
    ...existing.map((e) => ({ ...e, fresh: false })),
    ...subject.map((s, i) => ({ ...s, id: `subject:${i}`, fresh: true })),
  ];

  // Overlaps: nobody and nothing is in two places at once.
  const clash = (key: "interviewerId" | "roomId" | "candidateId", label: string) => {
    for (let a = 0; a < all.length; a++) {
      for (let b = a + 1; b < all.length; b++) {
        const x = all[a];
        const y = all[b];
        if (!x.fresh && !y.fresh) continue;
        if (x[key] === null || x[key] !== y[key]) continue;
        if (x.start < y.end && y.start < x.end) problems.push(`${label} ${String(x[key])} is double-booked.`);
      }
    }
  };
  clash("interviewerId", "Interviewer");
  clash("roomId", "Room");
  clash("candidateId", "Candidate");

  const perInterviewer = new Map<string, number>();
  for (const e of existing) {
    if (roundById.has(e.roundId)) perInterviewer.set(e.interviewerId, (perInterviewer.get(e.interviewerId) ?? 0) + 1);
  }

  for (const s of subject) {
    const round = roundById.get(s.roundId);
    const iv = interviewer.get(s.interviewerId);
    const rm = room.get(s.roomId);
    if (!round) {
      problems.push(`Unknown round ${s.roundId}.`);
      continue;
    }
    if (s.start < input.window.start || s.end > input.window.end) problems.push("Interview is outside the drive window.");
    if (s.end - s.start !== round.durationMs) problems.push(`Round "${round.name}" has the wrong duration.`);
    if (!iv) problems.push(`Unknown interviewer ${s.interviewerId}.`);
    else {
      if (!contains(iv.availability ?? [], s.start, s.end)) problems.push(`${iv.name} is not available then.`);
      if (!round.requiredSkills.every((k) => iv.skills.includes(k))) problems.push(`${iv.name} lacks a required skill.`);
      perInterviewer.set(iv.id, (perInterviewer.get(iv.id) ?? 0) + 1);
    }
    if (!rm) problems.push(`Unknown room ${s.roomId}.`);
    else if (rm.capacity < round.requiredCapacity) problems.push(`${rm.name} is too small for "${round.name}".`);
    if (s.candidateId) {
      const c = candidate.get(s.candidateId);
      if (c?.availability && !contains(c.availability, s.start, s.end)) problems.push(`${c.name} is not available then.`);
    }
  }

  for (const iv of input.interviewers) {
    if (iv.maxInterviews !== null && (perInterviewer.get(iv.id) ?? 0) > iv.maxInterviews) {
      problems.push(`${iv.name} has more than ${iv.maxInterviews} interviews.`);
    }
  }

  // Round order and minimum gaps, per candidate.
  const byCandidate = new Map<string, { roundId: string; start: number; end: number }[]>();
  for (const a of all) {
    if (a.candidateId === null || !roundById.has(a.roundId)) continue;
    const list = byCandidate.get(a.candidateId) ?? [];
    list.push({ roundId: a.roundId, start: a.start, end: a.end });
    byCandidate.set(a.candidateId, list);
  }
  for (const [id, list] of byCandidate) {
    const sorted = list
      .map((x) => ({ ...x, round: roundById.get(x.roundId)! }))
      .sort((a, b) => a.round.position - b.round.position);
    for (let k = 1; k < sorted.length; k++) {
      const prev = sorted[k - 1];
      const cur = sorted[k];
      if (cur.start < prev.end + cur.round.minGapMs) {
        problems.push(`Candidate ${id}: round "${cur.round.name}" starts too soon after "${prev.round.name}".`);
      }
    }
  }

  return problems;
}
