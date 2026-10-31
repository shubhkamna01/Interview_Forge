import type { OpenSlotsReport, ScheduleReport as Report } from "../api";
import { formatDateTime } from "../lib/format";

export function ScheduleReportView({ report }: { report: Report }) {
  const { stats } = report;
  const gaps = stats.avgGapMinutes === null ? "—" : `${stats.avgGapMinutes} min`;

  return (
    <div className="report">
      <div className="report-head">
        <strong>
          {report.assigned} interview{report.assigned === 1 ? "" : "s"} created
        </strong>
        <span className="muted">
          {formatDateTime(report.createdAt)} · took {report.durationMs} ms
          {report.alreadyScheduled > 0 && ` · ${report.alreadyScheduled} already scheduled, left untouched`}
        </span>
      </div>

      <dl className="report-stats">
        <div>
          <dt>Average wait between rounds</dt>
          <dd>{gaps}</dd>
        </div>
        <div>
          <dt>Interviewer time used</dt>
          <dd>{stats.interviewerUtilizationPct}%</dd>
        </div>
        <div>
          <dt>Room time used</dt>
          <dd>{stats.roomUtilizationPct}%</dd>
        </div>
      </dl>

      {report.unresolved.length === 0 ? (
        <p className="all-clear">Everyone is fully scheduled.</p>
      ) : (
        <>
          <p className="warn-note">
            {report.unresolved.length} interview{report.unresolved.length === 1 ? "" : "s"} could not be scheduled. Nothing was forced: each one is listed with the reason.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CANDIDATE</th>
                  <th>ROUND</th>
                  <th>WHY</th>
                </tr>
              </thead>
              <tbody>
                {report.unresolved.map((u) => (
                  <tr key={`${u.candidate.id}-${u.round.id}`}>
                    <td>
                      <strong>{u.candidate.name}</strong>
                    </td>
                    <td>{u.round.name}</td>
                    <td className="reason">{u.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function OpenSlotsView({ report }: { report: OpenSlotsReport }) {
  return (
    <div className="report">
      <div className="report-head">
        <strong>
          {report.created} open slot{report.created === 1 ? "" : "s"} created
        </strong>
        <span className="muted">Candidates who still need a round were notified.</span>
      </div>
      <ul className="slot-summary">
        {report.perRound.map((r) => (
          <li key={r.round.id}>
            <strong>{r.round.name}</strong>
            <span>
              {r.created} of {r.demand} needed
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
