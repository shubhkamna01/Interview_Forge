import type { InterviewStatus } from "../api";
import { statusLabel } from "../lib/format";

export function StatusBadge({ status }: { status: InterviewStatus | "draft" | "published" }) {
  const label = status === "draft" || status === "published" ? status.charAt(0).toUpperCase() + status.slice(1) : statusLabel(status);
  return <span className={`status ${status}`}>{label}</span>;
}
