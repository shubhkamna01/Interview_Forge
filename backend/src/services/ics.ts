import type { InterviewDto } from "./dto";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** RFC 5545: lines are at most 75 octets; continuation lines start with a space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never cut in the middle of a multi-byte character.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74;
  }
  return parts.join("\r\n ");
}

export function buildCalendar(interviews: InterviewDto[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InterviewForge//Scheduler//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

  for (const i of interviews) {
    const who = [i.candidate ? `Candidate: ${i.candidate.name}` : null, `Interviewer: ${i.interviewer.name}`].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${i.id}@interviewforge`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(new Date(i.startsAt))}`,
      `DTEND:${stamp(new Date(i.endsAt))}`,
      `SUMMARY:${escapeText(`${i.round.name} - ${i.drive.company}`)}`,
      `LOCATION:${escapeText(i.room.name)}`,
      `DESCRIPTION:${escapeText(`${i.drive.title}\n${who}`)}`,
      i.status === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
