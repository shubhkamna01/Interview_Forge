export type InterviewStatus = "Scheduled" | "Pending";

export interface Interview {
  id: number;
  time: string;
  candidate: string;
  role: string;
  interviewer: string;
  room: string;
  status: InterviewStatus;
}

export interface Stat {
  label: string;
  value: string;
  note: string;
  icon: IconName;
}

export type IconName =
  | "dashboard"
  | "candidates"
  | "interviewers"
  | "rooms"
  | "schedule"
  | "sparkles"
  | "check"
  | "arrow"
  | "trend";

export const TOTAL_CANDIDATES = 24;

export const stats: Stat[] = [
  { label: "Total Candidates", value: "24", icon: "candidates", note: "Registered candidates" },
  { label: "Interviewers", value: "08", icon: "interviewers", note: "Available interviewers" },
  { label: "Rooms", value: "04", icon: "rooms", note: "Interview rooms" },
  { label: "Scheduled Interviews", value: "18", icon: "check", note: "Sample assignments" },
];

export const interviews: Interview[] = [
  { id: 1, time: "09:00 AM", candidate: "Aarav Sharma", role: "Software Engineer", interviewer: "Priya Mehta", room: "Room 01", status: "Scheduled" },
  { id: 2, time: "10:00 AM", candidate: "Ananya Singh", role: "Data Analyst", interviewer: "Rahul Verma", room: "Room 02", status: "Scheduled" },
  { id: 3, time: "11:00 AM", candidate: "Ishaan Gupta", role: "Product Intern", interviewer: "Neha Kapoor", room: "Room 03", status: "Pending" },
  { id: 4, time: "12:00 PM", candidate: "Meera Joshi", role: "Software Engineer", interviewer: "Priya Mehta", room: "Room 01", status: "Scheduled" },
];
