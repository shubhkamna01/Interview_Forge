import type { ReactNode } from "react";
import type { Interview } from "../api";
import { formatDate, formatTime } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

interface Props {
  rows: Interview[];
  showCandidate?: boolean;
  showInterviewer?: boolean;
  showDate?: boolean;
  /** Extra buttons for each row. */
  actions?: (row: Interview) => ReactNode;
  empty?: string;
}

export function InterviewTable({ rows, showCandidate = true, showInterviewer = true, showDate = true, actions, empty = "No interviews to show yet." }: Props) {
  if (rows.length === 0) return <p className="empty-note">{empty}</p>;

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">WHEN</th>
            <th scope="col">ROUND</th>
            {showCandidate && <th scope="col">CANDIDATE</th>}
            {showInterviewer && <th scope="col">INTERVIEWER</th>}
            <th scope="col">ROOM</th>
            <th scope="col">STATUS</th>
            {actions && <th scope="col" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.status === "cancelled" ? "row-muted" : undefined}>
              <td className="time-cell">
                {formatTime(row.startsAt)}
                {showDate && <span className="secondary-cell">{formatDate(row.startsAt)}</span>}
              </td>
              <td>
                <strong>{row.round.name}</strong>
                <span className="secondary-cell">{row.drive.company}</span>
              </td>
              {showCandidate && <td>{row.candidate ? row.candidate.name : <span className="muted">Unbooked</span>}</td>}
              {showInterviewer && <td>{row.interviewer.name}</td>}
              <td>{row.room.name}</td>
              <td>
                <StatusBadge status={row.status} />
              </td>
              {actions && <td className="row-actions">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
