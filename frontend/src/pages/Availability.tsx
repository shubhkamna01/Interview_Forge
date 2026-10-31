import { useState } from "react";
import { api, type Availability as AvailabilityData, type Drive } from "../api";
import { useAuth } from "../auth/useAuth";
import { Async, LoadingPanel } from "../components/Async";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { useAction } from "../hooks/useAction";
import { useAsync } from "../hooks/useAsync";
import { go, type Route } from "../hooks/useRoute";
import { formatRange, fromLocalInput, toLocalInput } from "../lib/format";

export function Availability({ route }: { route: Route }) {
  const state = useAsync(async () => (await api.drives.list()).filter((d) => d.joined), []);
  const { user } = useAuth();
  const candidate = user?.role === "candidate";

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">AVAILABILITY</p>
          <h1>{candidate ? "When can you interview?" : "When are you free?"}</h1>
          <p className="subtitle">
            {candidate
              ? "Optional. If you add times, you'll only be scheduled inside them. Leave it empty to be free any time in the drive."
              : "You'll only be given interviews inside the times you add. Without any, you can't be scheduled."}
          </p>
        </div>
      </section>

      <Async state={state}>
        {(drives) => {
          if (drives.length === 0) {
            return (
              <article className="panel placeholder-panel">
                <h2>Join a drive first</h2>
                <p>Availability is set per drive.</p>
                <a className="primary-button cta" href="#/drives">Browse drives</a>
              </article>
            );
          }
          const chosen = drives.find((d) => d.id === route.parts[0]) ?? drives[0];
          return (
            <>
              {drives.length > 1 && (
                <div className="drive-picker">
                  <Field label="Drive">
                    <select value={chosen.id} onChange={(e) => go(`availability/${e.target.value}`)}>
                      {drives.map((d) => (
                        <option key={d.id} value={d.id}>{d.title} · {d.company}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
              <EditorLoader key={chosen.id} drive={chosen} />
            </>
          );
        }}
      </Async>
    </>
  );
}

function EditorLoader({ drive }: { drive: Drive }) {
  const state = useAsync(() => api.drives.getAvailability(drive.id), [drive.id]);
  if (state.data === null) return state.error ? <Async state={state}>{() => null}</Async> : <LoadingPanel />;
  return <Editor drive={drive} initial={state.data} />;
}

interface Row {
  start: string;
  end: string;
}

function Editor({ drive, initial }: { drive: Drive; initial: AvailabilityData }) {
  const { user } = useAuth();
  const { busy, run } = useAction();
  const interviewer = user?.role === "interviewer";

  const [rows, setRows] = useState<Row[]>(initial.windows.map((w) => ({ start: toLocalInput(w.startsAt), end: toLocalInput(w.endsAt) })));
  const [limit, setLimit] = useState(initial.maxInterviews ? String(initial.maxInterviews) : "");
  const [error, setError] = useState<string | null>(null);

  const min = toLocalInput(drive.windowStart);
  const max = toLocalInput(drive.windowEnd);
  const wholeWindow = (): Row => ({ start: min, end: max });
  const patch = (i: number, p: Partial<Row>) => setRows((list) => list.map((r, k) => (k === i ? { ...r, ...p } : r)));

  async function save() {
    for (const r of rows) {
      const s = fromLocalInput(r.start);
      const e = fromLocalInput(r.end);
      if (!s || !e) return setError("Fill in both the start and the end of every time window.");
      if (new Date(e) <= new Date(s)) return setError("Each time window must end after it starts.");
      if (r.start < min || r.end > max) return setError("Every time window must be inside the drive window.");
    }
    setError(null);
    const saved = await run(
      () =>
        api.drives.setAvailability(drive.id, {
          windows: rows.map((r) => ({ startsAt: fromLocalInput(r.start), endsAt: fromLocalInput(r.end) })),
          maxInterviews: interviewer ? (limit.trim() ? Number(limit) : null) : undefined,
        }),
      "Availability saved.",
    );
    if (saved) setRows(saved.windows.map((w) => ({ start: toLocalInput(w.startsAt), end: toLocalInput(w.endsAt) })));
  }

  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <h2>{drive.title}</h2>
          <p>
            {drive.company} · drive window {formatRange(drive.windowStart, drive.windowEnd)}
          </p>
        </div>
      </div>

      {interviewer && (
        <div className="notice">
          <strong>Your skills:</strong> {user?.skills.length ? user.skills.join(", ") : "none yet"}.{" "}
          Rounds that need a skill only go to interviewers who have it. <a href="#/profile">Edit skills</a>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="empty-note">
          {interviewer ? "No times added yet. Add the windows you can interview in." : "No restrictions. You're treated as free any time in the drive."}
        </p>
      ) : (
        <ul className="window-list">
          {rows.map((r, i) => (
            <li key={i}>
              <Field label="From">
                <input type="datetime-local" value={r.start} min={min} max={max} onChange={(e) => patch(i, { start: e.target.value })} />
              </Field>
              <Field label="Until">
                <input type="datetime-local" value={r.end} min={min} max={max} onChange={(e) => patch(i, { end: e.target.value })} />
              </Field>
              <button type="button" className="icon-button" aria-label="Remove time window" onClick={() => setRows((l) => l.filter((_, k) => k !== i))}>
                <Icon name="trash" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="panel-footer">
        <button type="button" className="secondary-button" onClick={() => setRows((l) => [...l, wholeWindow()])}>
          <Icon name="plus" size={14} /> Add a time window
        </button>
        {rows.length > 0 && (
          <button type="button" className="text-button" onClick={() => setRows([])}>
            {interviewer ? "Clear all" : "Clear (free any time)"}
          </button>
        )}
      </div>

      {interviewer && (
        <div className="panel-footer">
          <Field label="Most interviews you'll take in this drive" hint="Leave empty for no limit.">
            <input className="narrow" type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </Field>
        </div>
      )}

      {error && (
        <p className="login-error form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions padded">
        <button className="primary-button" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save availability"}
        </button>
      </div>
    </article>
  );
}
