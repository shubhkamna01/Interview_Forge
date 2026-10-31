import { useState } from "react";
import { api, type Drive, type Participants, type Person } from "../api";
import { useAuth } from "../auth/useAuth";
import { Async, ErrorPanel, LoadingPanel } from "../components/Async";
import { ConfirmButton } from "../components/ConfirmButton";
import { Icon } from "../components/Icon";
import { OpenSlotsView, ScheduleReportView } from "../components/ScheduleReport";
import { StatusBadge } from "../components/StatusBadge";
import { useNotifications } from "../components/useNotifications";
import { useAction } from "../hooks/useAction";
import { useAsync } from "../hooks/useAsync";
import { go, type Route } from "../hooks/useRoute";
import { formatRange, roundTypeLabel } from "../lib/format";
import { DriveForm } from "./DriveForm";

export function Drives({ route }: { route: Route }) {
  const { user } = useAuth();
  if (!user) return null;
  const [first, second] = route.parts;
  const coordinator = user.role === "coordinator";

  if (first === "new" && coordinator) return <DriveForm />;
  if (first && second === "edit" && coordinator) return <EditDrive id={first} />;
  if (first) return <DriveDetail id={first} />;
  return coordinator ? <CoordinatorList /> : <AttendeeList />;
}

function EditDrive({ id }: { id: string }) {
  const state = useAsync(() => api.drives.get(id), [id]);
  if (state.data === null) return state.error ? <ErrorPanel message={state.error} onRetry={state.reload} /> : <LoadingPanel />;
  if (state.data.status !== "draft") {
    return (
      <article className="panel placeholder-panel">
        <h2>Unpublish to edit</h2>
        <p>Published drives are locked so people's bookings stay valid.</p>
        <a className="primary-button cta" href={`#/drives/${id}`}>Back to the drive</a>
      </article>
    );
  }
  return <DriveForm drive={state.data} />;
}

function CoordinatorList() {
  const state = useAsync(() => api.drives.list(), []);
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">RECRUITMENT</p>
          <h1>Drives</h1>
          <p className="subtitle">Create a drive, define its rounds, then publish it for people to join.</p>
        </div>
        <a className="primary-button" href="#/drives/new">
          <Icon name="plus" size={16} /> New drive
        </a>
      </section>
      <Async state={state}>
        {(drives) =>
          drives.length === 0 ? (
            <article className="panel placeholder-panel">
              <h2>No drives yet</h2>
              <p>Create your first placement drive to start scheduling.</p>
            </article>
          ) : (
            <article className="panel">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>DRIVE</th>
                      <th>WHEN</th>
                      <th>ROUNDS</th>
                      <th>PEOPLE</th>
                      <th>INTERVIEWS</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drives.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <a className="row-link" href={`#/drives/${d.id}`}>
                            <strong>{d.title}</strong>
                          </a>
                          <span className="secondary-cell">{d.company}</span>
                        </td>
                        <td>{formatRange(d.windowStart, d.windowEnd)}</td>
                        <td>{d.rounds.length}</td>
                        <td>
                          {d.counts?.candidates ?? 0} candidates
                          <span className="secondary-cell">{d.counts?.interviewers ?? 0} interviewers</span>
                        </td>
                        <td>
                          {d.counts?.interviews ?? 0}
                          {(d.counts?.openSlots ?? 0) > 0 && <span className="secondary-cell">{d.counts?.openSlots} open</span>}
                        </td>
                        <td>
                          <StatusBadge status={d.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )
        }
      </Async>
    </>
  );
}

function AttendeeList() {
  const { user } = useAuth();
  const state = useAsync(() => api.drives.list(), []);
  const { busy, run } = useAction();
  const candidate = user?.role === "candidate";

  async function toggle(d: Drive) {
    const ok = await run(
      async () => {
        await (d.joined ? api.drives.leave(d.id) : api.drives.join(d.id));
        return true;
      },
      d.joined ? "You left the drive." : candidate ? "You're registered." : "You joined the drive. Now set your availability.",
    );
    if (ok) state.reload();
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">RECRUITMENT</p>
          <h1>Drives</h1>
          <p className="subtitle">{candidate ? "Register for a drive to book your interviews." : "Join a drive, then tell us when you're free."}</p>
        </div>
      </section>
      <Async state={state}>
        {(drives) =>
          drives.length === 0 ? (
            <article className="panel placeholder-panel">
              <h2>No open drives right now</h2>
              <p>When your coordinator publishes a drive, it will appear here.</p>
            </article>
          ) : (
            <div className="card-grid">
              {drives.map((d) => (
                <article key={d.id} className="panel drive-card">
                  <div className="drive-card-head">
                    <div>
                      <a className="row-link" href={`#/drives/${d.id}`}>
                        <h3>{d.title}</h3>
                      </a>
                      <span className="secondary-cell">{d.company}</span>
                    </div>
                    {d.joined && <span className="status scheduled">{candidate ? "Registered" : "Joined"}</span>}
                  </div>
                  <p className="drive-when">{formatRange(d.windowStart, d.windowEnd)}</p>
                  <p className="muted">{d.rounds.map((r) => r.name).join(" → ")}</p>
                  <div className="card-actions">
                    {d.joined ? (
                      <>
                        <a className="secondary-button" href={candidate ? `#/schedule/${d.id}` : `#/availability/${d.id}`}>
                          {candidate ? "Book interviews" : "Set availability"}
                        </a>
                        <ConfirmButton className="text-button danger" disabled={busy} onConfirm={() => toggle(d)} confirmLabel="Confirm leave">
                          Leave
                        </ConfirmButton>
                      </>
                    ) : (
                      <button className="primary-button" disabled={busy} onClick={() => toggle(d)}>
                        {candidate ? "Register" : "Join drive"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )
        }
      </Async>
    </>
  );
}

function RoundsList({ drive }: { drive: Drive }) {
  return (
    <ol className="rounds-view">
      {drive.rounds.map((r) => (
        <li key={r.id}>
          <span className="round-number">{r.position}</span>
          <div>
            <strong>{r.name}</strong>
            <span className="secondary-cell">
              {roundTypeLabel[r.type]} · {r.durationMinutes} min
              {r.position > 1 && r.minGapMinutes > 0 && ` · ${r.minGapMinutes} min after the previous round`}
              {` · room for ${r.requiredCapacity}`}
              {r.requiredSkills.length > 0 && ` · needs ${r.requiredSkills.join(", ")}`}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function DriveDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const coordinator = user?.role === "coordinator";
  const state = useAsync(() => api.drives.get(id), [id]);

  if (state.data === null) return state.error ? <ErrorPanel message={state.error} onRetry={state.reload} /> : <LoadingPanel />;
  return coordinator ? <CoordinatorDrive drive={state.data} reload={state.reload} /> : <AttendeeDrive drive={state.data} reload={state.reload} />;
}

function AttendeeDrive({ drive, reload }: { drive: Drive; reload: () => void }) {
  const { user } = useAuth();
  const { busy, run } = useAction();
  const candidate = user?.role === "candidate";

  async function toggle() {
    const ok = await run(async () => {
      await (drive.joined ? api.drives.leave(drive.id) : api.drives.join(drive.id));
      return true;
    }, drive.joined ? "You left the drive." : "You're in.");
    if (ok) reload();
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">{drive.company.toUpperCase()}</p>
          <h1>{drive.title}</h1>
          <p className="subtitle">{formatRange(drive.windowStart, drive.windowEnd)}</p>
        </div>
        {drive.joined ? (
          <ConfirmButton className="danger-button" disabled={busy} onConfirm={toggle} confirmLabel="Confirm leave">
            Leave drive
          </ConfirmButton>
        ) : (
          <button className="primary-button" disabled={busy} onClick={toggle}>
            {candidate ? "Register" : "Join drive"}
          </button>
        )}
      </section>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Interview rounds</h2>
            <p>Taken in this order</p>
          </div>
        </div>
        <RoundsList drive={drive} />
        {drive.joined && (
          <div className="panel-footer">
            <a className="primary-button" href={candidate ? `#/schedule/${drive.id}` : `#/availability/${drive.id}`}>
              {candidate ? "Book my interviews" : "Set my availability"} <Icon name="arrow" size={14} />
            </a>
            {candidate && (
              <a className="secondary-button" href={`#/availability/${drive.id}`}>
                My availability (optional)
              </a>
            )}
          </div>
        )}
      </article>
    </>
  );
}

function PeopleTable({ title, people, interviewers }: { title: string; people: Person[]; interviewers?: boolean }) {
  return (
    <div>
      <h3 className="sub-title">
        {title} <span className="muted">({people.length})</span>
      </h3>
      {people.length === 0 ? (
        <p className="empty-note small">Nobody yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>NAME</th>
                <th>{interviewers ? "SKILLS" : "AVAILABILITY"}</th>
                <th>INTERVIEWS</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <span className="secondary-cell">{p.email}</span>
                  </td>
                  <td>
                    {interviewers ? (
                      <>
                        {p.skills.length ? p.skills.join(", ") : <span className="muted">none</span>}
                        <span className="secondary-cell">
                          {p.availabilityWindows ? `${p.availabilityWindows} window${p.availabilityWindows === 1 ? "" : "s"}` : "No availability yet"}
                          {p.maxInterviews ? ` · max ${p.maxInterviews}` : ""}
                        </span>
                      </>
                    ) : p.availabilityWindows ? (
                      `${p.availabilityWindows} window${p.availabilityWindows === 1 ? "" : "s"}`
                    ) : (
                      <span className="muted">Any time</span>
                    )}
                  </td>
                  <td>{p.interviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CoordinatorDrive({ drive, reload }: { drive: Drive; reload: () => void }) {
  const { busy, run } = useAction();
  const { refresh } = useNotifications();
  const people = useAsync<Participants>(() => api.drives.participants(drive.id), [drive.id]);
  const latest = useAsync(() => api.drives.latestRun(drive.id), [drive.id]);
  const [slots, setSlots] = useState<Awaited<ReturnType<typeof api.drives.openSlots>> | null>(null);
  const published = drive.status === "published";

  async function changeStatus() {
    const ok = await run(() => (published ? api.drives.unpublish(drive.id) : api.drives.publish(drive.id)), published ? "Drive unpublished." : "Drive published. People can join now.");
    if (ok) reload();
  }

  async function remove() {
    const ok = await run(async () => {
      await api.drives.remove(drive.id);
      return true;
    }, "Drive deleted.");
    if (ok) go("drives");
  }

  async function generate() {
    const report = await run(() => api.drives.generateSchedule(drive.id), "Schedule generated.");
    if (report) {
      setSlots(null);
      latest.reload();
      people.reload();
      reload();
      void refresh();
    }
  }

  async function openSlots() {
    const report = await run(() => api.drives.openSlots(drive.id), "Slots opened for self-booking.");
    if (report) {
      setSlots(report);
      reload();
      void refresh();
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">{drive.company.toUpperCase()}</p>
          <h1>
            {drive.title} <StatusBadge status={drive.status} />
          </h1>
          <p className="subtitle">{formatRange(drive.windowStart, drive.windowEnd)}</p>
        </div>
        <div className="heading-actions">
          {!published && (
            <a className="secondary-button" href={`#/drives/${drive.id}/edit`}>
              <Icon name="edit" size={14} /> Edit
            </a>
          )}
          <button className={published ? "secondary-button" : "primary-button"} disabled={busy} onClick={changeStatus}>
            {published ? "Unpublish" : "Publish"}
          </button>
          {!published && (
            <ConfirmButton disabled={busy} onConfirm={remove} confirmLabel="Confirm delete">
              <Icon name="trash" size={14} /> Delete
            </ConfirmButton>
          )}
        </div>
      </section>

      <section className="overview-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Interview rounds</h2>
              <p>Candidates take these in order</p>
            </div>
          </div>
          <RoundsList drive={drive} />
        </article>

        <article className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Scheduling</h2>
              <p>{published ? "Run once people have added their availability" : "Publish the drive first"}</p>
            </div>
          </div>
          <div className="stack">
            <button className="primary-button" disabled={busy || !published} onClick={generate}>
              <Icon name="sparkles" size={16} /> {busy ? "Working…" : "Generate schedule"}
            </button>
            <button className="secondary-button" disabled={busy || !published} onClick={openSlots}>
              Open remaining slots for self-booking
            </button>
            <a className="text-button" href={`#/schedule/${drive.id}`}>
              View all interviews <Icon name="arrow" size={14} />
            </a>
          </div>
          <p className="muted-note">
            Generating never moves interviews that already exist. Opening slots replaces earlier unbooked slots.
          </p>
        </article>
      </section>

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
              <p>What the scheduler did, and what it could not do</p>
            </div>
          </div>
          <ScheduleReportView report={latest.data} />
        </article>
      )}

      <article className="panel panel-spaced">
        <div className="panel-heading">
          <div>
            <h2>People</h2>
            <p>Who has joined this drive</p>
          </div>
        </div>
        <Async state={people}>
          {(p) => (
            <div className="two-col">
              <PeopleTable title="Candidates" people={p.candidates} />
              <PeopleTable title="Interviewers" people={p.interviewers} interviewers />
            </div>
          )}
        </Async>
      </article>
    </>
  );
}
