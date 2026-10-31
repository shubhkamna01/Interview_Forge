import { useState } from "react";
import { api, type Drive, type PlanItem, type ReschedulePreview } from "../api";
import { useAction } from "../hooks/useAction";
import { formatDateTime, fromLocalInput, toLocalInput } from "../lib/format";
import { ConfirmButton } from "./ConfirmButton";
import { Field } from "./Field";
import { useNotifications } from "./useNotifications";

interface Props {
  drive: Drive;
  /** Coordinators pick an interviewer; interviewers can only change themselves. */
  interviewers: { id: string; name: string }[];
  fixedInterviewer?: boolean;
  /** Pre-filled period, e.g. one interview's time. */
  initialFrom?: string;
  initialTo?: string;
  onDone: () => void;
  onClose?: () => void;
}

function describe(item: PlanItem): string {
  const o = item.outcome;
  if (o.kind === "none") return `Can't move: ${o.reason ?? "no free slot"}`;
  const how = o.kind === "open_slot" ? "Use open slot" : "Move";
  return `${how} to ${formatDateTime(o.startsAt!)} · ${o.room!.name} · ${o.interviewer!.name}`;
}

/**
 * "An interviewer can't make it": preview who is affected and where each interview could go,
 * then apply. Only interviews inside the period are touched.
 */
export function ReschedulePanel({ drive, interviewers, fixedInterviewer, initialFrom, initialTo, onDone, onClose }: Props) {
  const { busy, run } = useAction();
  const { refresh } = useNotifications();
  const [interviewerId, setInterviewerId] = useState(interviewers[0]?.id ?? "");
  const [from, setFrom] = useState(toLocalInput(initialFrom ?? drive.windowStart));
  const [to, setTo] = useState(toLocalInput(initialTo ?? drive.windowEnd));
  const [preview, setPreview] = useState<ReschedulePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const request = () => ({ interviewerId, from: fromLocalInput(from), to: fromLocalInput(to) });

  function invalid(): string | null {
    if (!interviewerId) return "Choose an interviewer.";
    if (!fromLocalInput(from) || !fromLocalInput(to)) return "Fill in both times.";
    if (new Date(to) <= new Date(from)) return "The end must be after the start.";
    return null;
  }

  async function check() {
    const problem = invalid();
    if (problem) return setError(problem);
    setError(null);
    setPreview(null);
    setDone(null);
    const result = await run(() => api.drives.previewReschedule(drive.id, request()));
    if (result) setPreview(result);
  }

  async function apply() {
    const result = await run(() => api.drives.applyReschedule(drive.id, request()));
    if (!result) return;
    const text =
      result.cancelled === 0
        ? "Nothing was scheduled in that period."
        : `${result.moved} moved${result.unresolved ? `, ${result.unresolved} need attention` : ""}. Everyone affected was notified.`;
    setPreview(null);
    void refresh();
    onDone();
    setDone(text);
  }

  return (
    <article className="panel panel-spaced">
      <div className="panel-heading">
        <div>
          <h2>{fixedInterviewer ? "I can't make it" : "Handle an interviewer cancellation"}</h2>
          <p>
            {fixedInterviewer
              ? "Pick the period you're unavailable. Your interviews in it are moved to someone else where possible."
              : "Only interviews in the chosen period are moved. Everything else stays exactly as it is."}
          </p>
        </div>
        {onClose && (
          <button className="text-button" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <div className="form-grid padded">
        {!fixedInterviewer && (
          <Field label="Interviewer">
            <select value={interviewerId} onChange={(e) => { setInterviewerId(e.target.value); setPreview(null); }}>
              {interviewers.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Unavailable from">
          <input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPreview(null); }} />
        </Field>
        <Field label="Until">
          <input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPreview(null); }} />
        </Field>
      </div>

      {error && <p className="login-error form-error" role="alert">{error}</p>}

      <div className="form-actions padded">
        <button className="secondary-button" disabled={busy} onClick={check}>
          {busy && !preview ? "Checking…" : "See what would change"}
        </button>
      </div>

      {done && <p className="all-clear padded">{done}</p>}

      {preview && (
        <div className="padded">
          {preview.affected === 0 ? (
            <p className="empty-note">No interviews fall in that period. Applying will just mark {preview.interviewer.name} as unavailable then.</p>
          ) : (
            <>
              <p className="warn-note">
                {preview.affected} interview{preview.affected === 1 ? "" : "s"} affected, {preview.canMove} can be moved.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>CANDIDATE</th>
                      <th>NOW</th>
                      <th>PLAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.map((it) => (
                      <tr key={it.interview.id}>
                        <td>
                          <strong>{it.interview.candidate?.name ?? "Open slot"}</strong>
                          <span className="secondary-cell">{it.interview.round.name}</span>
                        </td>
                        <td>{formatDateTime(it.interview.startsAt)}</td>
                        <td className={it.outcome.kind === "none" ? "reason" : undefined}>{describe(it)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="form-actions">
            <ConfirmButton className="primary-button" disabled={busy} onConfirm={apply} confirmLabel="Click again to apply">
              Apply these changes
            </ConfirmButton>
          </div>
        </div>
      )}
    </article>
  );
}
