import type { Range } from "./types";

/** Tracks which time ranges are taken, per resource id (a person or a room). */
export class Calendar {
  private busy = new Map<string, Range[]>();
  private totals = new Map<string, number>();

  isFree(id: string, start: number, end: number): boolean {
    const list = this.busy.get(id);
    if (!list) return true;
    for (const r of list) if (r.start < end && start < r.end) return false;
    return true;
  }

  add(id: string, start: number, end: number): void {
    const list = this.busy.get(id);
    if (list) list.push({ start, end });
    else this.busy.set(id, [{ start, end }]);
    this.totals.set(id, (this.totals.get(id) ?? 0) + (end - start));
  }

  remove(id: string, start: number, end: number): void {
    const list = this.busy.get(id);
    if (!list) return;
    const i = list.findIndex((r) => r.start === start && r.end === end);
    if (i >= 0) {
      list.splice(i, 1);
      this.totals.set(id, (this.totals.get(id) ?? 0) - (end - start));
    }
  }

  /** Total busy milliseconds, used to spread work across interviewers. */
  load(id: string): number {
    return this.totals.get(id) ?? 0;
  }
}
