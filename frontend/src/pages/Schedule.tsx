import { useState } from "react";
import { api, type Drive, type Interview, type OpenSlotsReport, type Participants } from "../api";
import { useAuth } from "../auth/useAuth";
import { Async, ErrorPanel, LoadingPanel } from "../components/Async";
import { ConfirmButton } from "../components/ConfirmButton";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { InterviewTable } from "../components/InterviewTable";
import { ReschedulePanel } from "../components/ReschedulePanel";
import { OpenSlotsView, ScheduleReportView } from "../components/ScheduleReport";
import { StatusBadge } from "../components/StatusBadge";
import { useNotifications } from "../components/useNotifications";
import { useAction } from "../hooks/useAction";
import { useAsync } from "../hooks/useAsync";
import { go, type Route } from "../hooks/useRoute";
import { formatDate, formatDateTime, formatLongDate, formatRange, formatTime, isFuture } from "../lib/format";

export function Schedule({ route }: { route: Route }) {
  const { user } = useAuth();
  const coordinator = user?.role === "coordinator";
  const state = useAsync(async () => {
    const all = await api.drives.list();
    return coordinator ? all.filter((d) => d.status === "published") : all.filter((d) => d.joined);
  }, [coordinator]);

  if (!user) return null;
  const candidate = user.role === "candidate";

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">SCHEDULE</p>
          <h1>{candidate ? "My interviews" : coordinator ? "Interview schedule" : "My schedule"}</h1>
          <p className="subtitle">
            {candidate
              ? "Pick a time for each round, in order. Add them to your calendar when you're done."
              : coordinator
                ? "Generate the schedule, open slots, and handle cancellations."
                : "Your interviews, with calendar export and a way to hand them over if you can't make it."}
          </p>
        </div>
      </section>

      <Async state={state}>
        {(drives) => {
          if (drives.length === 0) {
            return (
              <article className="panel placeholder-panel">
                <h2>{coordinator ? "No published drives" : "You haven't joined a drive"}</h2>
                <p>{coordinator ? "Publish a drive to schedule it." : "Join a drive to see and book interviews."}</p>
                <a className="primary-button cta" href="#/drives">{coordinator ? "Go to drives" : "Browse drives"}</a>
              </article>
            );
          }
          const chosen = drives.find((d) => d.id === route.parts[0]) ?? drives[0];
          return (
            <>
              {drives.length > 1 && (
                <div className="drive-picker">
                  <Field label="Drive">
                    <select value={chosen.id} onChange={(e) => go(`schedule/${e.target.value}`)}>
                      {drives.map((d) => (
                        <option key={d.id} value={d.id}>{d.title} · {d.company}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
              {coordinator && <CoordinatorSchedule key={chosen.id} drive={chosen} />}
              {user.role === "interviewer" && <InterviewerSchedule key={chosen.id} drive={chosen} />}
              {candidate && <CandidateSchedule key={chosen.id} drive={chosen} />}
            </>
          );
        }}
      </Async>
    </>
  );
}

// ---------- Coordinator ----------

function CoordinatorSchedule({ drive }: { drive: Drive }) {
  const interviews = useAsync(() => api.interviews.list(drive.id), [drive.id]);
  const people = useAsync<Participants>(() => api.drives.participants(drive.id), [drive.id]);
  const latest = useAsync(() => api.drives.latestRun(drive.id), [drive.id]);
  const { busy, run } = useAction();
  const { refresh } = useNotifications();
  const [slots, setSlots] = useState<OpenSlotsReport | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);

  const reloadAll = () => {
    interviews.reload();
    people.reload();
    latest.reload();
    void refresh();
  };

  async function generate() {
    const report = await run(() => api.drives.generateSchedule(drive.id), "Schedule generated.");
    if (report) {
      setSlots(null);
      reloadAll();
    }
  }

  async function openSlots() {
    const report = await run(() => api.drives.openSlots(drive.id), "Slots opened for self-booking.");
    if (report) {
      setSlots(report);
      reloadAll();
    }
  }

  async function cancel(row: Interview) {
    const ok = await run(async () => {
      await api.interviews.cancelBooking(row.id);
      return true;
    }, "Booking cancelled. The slot is open again.");
    if (ok) reloadAll();
  }

  const rows = interviews.data ?? [];
  const booked = rows.filter((r) => r.status === "scheduled" || r.status === "completed").length;
  const open = rows.filter((r) => r.status === "open").length;

  return (
    <>
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>{drive.title}</h2>
            <p>
              {drive.company} · {formatRange(drive.windowStart, drive.windowEnd)}
            </p>
          </div>
          <div className="heading-actions">
            <button className="primary-button" disabled={busy} onClick={generate}>
              <Icon name="sparkles" size={16} /> {busy ? "Working…" : "Generate schedule"}
            </button>
            <button className="secondary-button" disabled={busy} onClick={openSlots}>
              Open slots for self-booking
            </button>
            <button className="secondary-button" onClick={() => setShowReschedule((v) => !v)}>
              Interviewer cancelled
            </button>
          </div>
        </div>
        <div className="mini-stats">
          <span><strong>{booked}</strong> booked</span>
          <span><strong>{open}</strong> open slots</span>
          <span><strong>{people.data?.candidates.length ?? "–"}</strong> candidates</span>
          <span><strong>{people.data?.interviewers.length ?? "–"}</strong> interviewers</span>
        </div>
      </article>

      {showReschedule && people.data && (
        <ReschedulePanel
          drive={drive}
          interviewers={people.data.interviewers}
          onDone={reloadAll}
          onClose={() => setShowReschedule(false)}
        />
      )}

      {slots && (
        <article className="panel panel-spaced">
          <OpenSlotsView report={slots} />
        </article>
      )}

      {latest.data && (
        <article className="panel panel-spaced">
          <div className="panel-heading">
            <div>
              <h2>Latest schedule run</h2>
            </div>
          </div>
          <ScheduleReportView report={latest.data} />
        </article>
      )}

      <article className="panel panel-spaced">
        <div className="panel-heading">
          <div>
            <h2>All interviews</h2>
            <p>In time order</p>
          </div>
        </div>
        {interviews.data === null ? (
          interviews.error ? <ErrorPanel message={interviews.error} onRetry={interviews.reload} /> : <LoadingPanel />
        ) : (
          <InterviewTable
            rows={rows}
            empty="Nothing scheduled yet. Generate the schedule or open slots."
            actions={(row) =>
              row.status === "scheduled" && isFuture(row.startsAt) ? (
                <ConfirmButton className="danger-button small" disabled={busy} onConfirm={() => cancel(row)} confirmLabel="Confirm">
                  Cancel booking
                </ConfirmButton>
              ) : null
            }
          />
        )}
      </article>
    </>
  );
}

// ---------- Interviewer ----------

function InterviewerSchedule({ drive }: { drive: Drive }) {
  const { user } = useAuth();
  const interviews = useAsync(() => api.interviews.list(drive.id), [drive.id]);
  const { busy, run } = useAction();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  if (!user) return null;
  const rows = interviews.data ?? [];
  const booked = rows.filter((r) => r.status === "scheduled" || r.status === "completed");

  return (
    <>
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>{drive.title}</h2>
            <p>
              {drive.company} · {booked.length} interview{booked.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="heading-actions">
            {booked.length > 0 && (
              <button className="secondary-button" disabled={busy} onClick={() => run(() => api.interviews.downloadMyCalendar())}>
                <Icon name="download" size={14} /> Add all to calendar (.ics)
              </button>
            )}
            <button className="secondary-button" onClick={() => setRange({ from: drive.windowStart, to: drive.windowEnd })}>
              I can't make it
            </button>
          </div>
        </div>
        {interviews.data === null ? (
          interviews.error ? <ErrorPanel message={interviews.error} onRetry={interviews.reload} /> : <LoadingPanel />
        ) : (
          <InterviewTable
            rows={rows}
            showInterviewer={false}
            empty="No interviews yet. Once your coordinator generates the schedule they'll appear here. Make sure your availability is set."
            actions={(row) => (
              <>
                {row.status !== "open" && (
                  <button className="secondary-button small" disabled={busy} onClick={() => run(() => api.interviews.downloadCalendar(row.id))}>
                    <Icon name="download" size={14} /> .ics
                  </button>
                )}
                {row.status !== "completed" && isFuture(row.startsAt) && (
                  <button className="text-button" onClick={() => setRange({ from: row.startsAt, to: row.endsAt })}>
                    Can't attend
                  </button>
                )}
              </>
            )}
          />
        )}
      </article>

      {range && (
        <ReschedulePanel
          key={`${range.from}-${range.to}`}
          drive={drive}
          interviewers={[{ id: user.id, name: user.name }]}
          fixedInterviewer
          initialFrom={range.from}
          initialTo={range.to}
          onDone={interviews.reload}
          onClose={() => setRange(null)}
        />
      )}
    </>
  );
}

// ---------- Candidate ----------

function CandidateSchedule({ drive }: { drive: Drive }) {
  const state = useAsync(async () => {
    const [mine, slots] = await Promise.all([api.interviews.list(drive.id), api.drives.eligibleSlots(drive.id)]);
    return { mine, slots };
  }, [drive.id]);
  const { busy, run } = useAction();
  const { refresh } = useNotifications();

  async function book(slot: Interview) {
    const booked = await run(() => api.interviews.book(slot.id), "Interview booked!");
    // Reload either way: if someone else took the slot, the list now shows what is really free.
    state.reload();
    void refresh();
    return booked;
  }

  async function cancel(row: Interview) {
    const ok = await run(async () => {
      await api.interviews.cancelBooking(row.id);
      return true;
    }, "Booking cancelled.");
    if (ok) {
      state.reload();
      void refresh();
    }
  }

  if (state.data === null) return state.error ? <ErrorPanel message={state.error} onRetry={state.reload} /> : <LoadingPanel />;
  const { mine, slots } = state.data;
  const byRound = new Map(mine.filter((i) => i.status !== "cancelled").map((i) => [i.round.id, i]));
  const nextIndex = drive.rounds.findIndex((r) => !byRound.has(r.id));
  const lastBookedPosition = Math.max(0, ...[...byRound.values()].map((i) => i.round.position));

  return (
    <>
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>{drive.title}</h2>
            <p>
              {drive.company} · {byRound.size} of {drive.rounds.length} rounds booked
            </p>
          </div>
          {byRound.size > 0 && (
            <button className="secondary-button" disabled={busy} onClick={() => run(() => api.interviews.downloadMyCalendar())}>
              <Icon name="download" size={14} /> Add all to calendar (.ics)
            </button>
          )}
        </div>
        <div className="progress-track padded-x" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${(byRound.size / drive.rounds.length) * 100}%` }} />
        </div>
        {nextIndex < 0 && <p className="all-clear padded">All your rounds are booked. Good luck!</p>}
      </article>

      <ol className="journey">
        {drive.rounds.map((round, i) => {
          const booked = byRound.get(round.id);
          const isNext = i === nextIndex;

          return (
            <li key={round.id} className={booked ? "booked" : isNext ? "next" : "locked"}>
              <span className="round-number">{round.position}</span>
              <div className="journey-body">
                <div className="journey-head">
                  <strong>{round.name}</strong>
                  <span className="muted">{round.durationMinutes} min</span>
                  {booked && <StatusBadge status={booked.status} />}
                </div>

                {booked ? (
                  <>
                    <p>
                      {formatLongDate(booked.startsAt)} · <strong>{formatTime(booked.startsAt)} – {formatTime(booked.endsAt)}</strong>
                    </p>
                    <p className="muted">
                      {booked.room.name} · with {booked.interviewer.name}
                    </p>
                    <div className="card-actions">
                      <button className="secondary-button small" disabled={busy} onClick={() => run(() => api.interviews.downloadCalendar(booked.id))}>
                        <Icon name="download" size={14} /> Add to calendar
                      </button>
                      {booked.status === "scheduled" && round.position === lastBookedPosition && isFuture(booked.startsAt) && (
                        <ConfirmButton className="text-button danger" disabled={busy} onConfirm={() => cancel(booked)} confirmLabel="Confirm cancel">
                          Cancel booking
                        </ConfirmButton>
                      )}
                    </div>
                  </>
                ) : isNext ? (
                  slots.length === 0 ? (
                    <p className="empty-note left">
                      No slots are open for this round yet. You'll get a notification when your coordinator opens them.
                    </p>
                  ) : (
                    <SlotPicker slots={slots} busy={busy} onBook={book} />
                  )
                ) : (
                  <p className="muted">Book “{drive.rounds[i - 1]?.name}” first.</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function SlotPicker({ slots, busy, onBook }: { slots: Interview[]; busy: boolean; onBook: (s: Interview) => void }) {
  const days = new Map<string, Interview[]>();
  for (const s of slots) {
    const key = formatDate(s.startsAt);
    days.set(key, [...(days.get(key) ?? []), s]);
  }

  return (
    <div className="slot-picker">
      <p className="muted">Choose a time. Slots are first come, first served.</p>
      {[...days.entries()].map(([day, list]) => (
        <div key={day}>
          <h4 className="slot-day">{day}</h4>
          <ul className="slot-grid">
            {list.map((s) => (
              <li key={s.id}>
                <button className="slot-button" disabled={busy} onClick={() => onBook(s)} title={`${s.room.name} · ${s.interviewer.name}`}>
                  <strong>{formatTime(s.startsAt)}</strong>
                  <span>{s.room.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <span className="sr-only">{formatDateTime(slots[0].startsAt)}</span>
    </div>
  );
}
