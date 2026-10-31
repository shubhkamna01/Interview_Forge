import type { InterviewStatus } from "../api";

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const longDateFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatLongDate = (iso: string) => longDateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;

/** "Fri, Oct 30 · 9:00 AM – 5:00 PM" (or both dates if the range crosses midnight). */
export function formatRange(startIso: string, endIso: string): string {
  const sameDay = new Date(startIso).toDateString() === new Date(endIso).toDateString();
  return sameDay
    ? `${formatDate(startIso)} · ${formatTime(startIso)} – ${formatTime(endIso)}`
    : `${formatDateTime(startIso)} – ${formatDateTime(endIso)}`;
}

const two = (n: number) => String(n).padStart(2, "0");
export const pad2 = two;

/** ISO string to the value format of <input type="datetime-local"> in the viewer's timezone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** The reverse: a datetime-local value to an ISO string. Returns "" if it isn't a valid time. */
export function fromLocalInput(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function statusLabel(status: InterviewStatus): string {
  return status === "open" ? "Open slot" : status.charAt(0).toUpperCase() + status.slice(1);
}

export const roundTypeLabel: Record<string, string> = {
  online_assessment: "Online assessment",
  technical: "Technical",
  hr: "HR",
  other: "Other",
};

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return formatDate(iso);
}

/** True if the time is still ahead. Kept here so components don't read the clock while rendering. */
export const isFuture = (iso: string): boolean => new Date(iso).getTime() > Date.now();

/** An ISO time `days` from now, used as a sensible default for new forms. */
export const daysFromNow = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();
