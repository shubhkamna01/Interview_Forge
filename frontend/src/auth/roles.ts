export type Role = "candidate" | "interviewer" | "coordinator";

export const ROLES: { id: Role; label: string; blurb: string }[] = [
  { id: "candidate", label: "Candidate", blurb: "See your interview time, room and interviewer." },
  { id: "interviewer", label: "Interviewer", blurb: "See the candidates you are interviewing today." },
  { id: "coordinator", label: "Coordinator", blurb: "Manage candidates, interviewers, rooms and the schedule." },
];

export const ROLE_LABEL: Record<Role, string> = {
  candidate: "Candidate",
  interviewer: "Interviewer",
  coordinator: "Coordinator",
};
