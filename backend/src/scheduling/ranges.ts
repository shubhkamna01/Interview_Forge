import type { Range } from "./types";

export const overlaps = (a: Range, b: Range): boolean => a.start < b.end && b.start < a.end;

/** True if [start, end) fits entirely inside one of the ranges. */
export function contains(ranges: Range[], start: number, end: number): boolean {
  return ranges.some((r) => r.start <= start && end <= r.end);
}

export function clip(r: Range, to: Range): Range | null {
  const start = Math.max(r.start, to.start);
  const end = Math.min(r.end, to.end);
  return end > start ? { start, end } : null;
}

/** Sorts and joins ranges that overlap or touch. */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges.map((r) => ({ ...r })).sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push(r);
  }
  return out;
}

/** Removes `cut` from every range, splitting ranges that contain it. */
export function subtractRange(ranges: Range[], cut: Range): Range[] {
  const out: Range[] = [];
  for (const r of ranges) {
    if (!overlaps(r, cut)) {
      out.push(r);
      continue;
    }
    if (r.start < cut.start) out.push({ start: r.start, end: cut.start });
    if (cut.end < r.end) out.push({ start: cut.end, end: r.end });
  }
  return out;
}

export const totalMs = (ranges: Range[]): number => ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
