import { api, type Drive, type Interview } from "../api";
import { useAuth } from "../auth/useAuth";
import { Async } from "../components/Async";
import { Icon } from "../components/Icon";
import { InterviewTable } from "../components/InterviewTable";
import { StatCard, type Stat } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAsync } from "../hooks/useAsync";
import { formatDate, formatDateTime, formatRange, pad2 } from "../lib/format";

function timeOfDay(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();

function Heading({ eyebrow, name, subtitle }: { eyebrow: string; name: string; subtitle: string }) {
  return (
    <section className="page-heading">
      <div>
        <p className="eyebrow">
          {eyebrow} · {today}
        </p>
        <h1>
          {timeOfDay()}, {name} <span>✦</span>
        </h1>
        <p className="subtitle">{subtitle}</p>
      </div>
    </section>
  );
}

export function Overview() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "coordinator") return <CoordinatorOverview />;
  return <AttendeeOverview role={user.role} name={user.name.split(" ")[0]} />;
}

function CoordinatorOverview() {
  const state = useAsync(() => api.drives.list(), []);

  return (
    <>
      <Heading eyebrow="PLACEMENT OVERVIEW" name="Coordinator" subtitle="Here's what's happening across your placement drives." />
      <Async state={state}>
        {(drives) => {
          const sum = (pick: (d: Drive) => number) => drives.reduce((n, d) => n + pick(d), 0);
          const published = drives.filter((d) => d.status === "published");
          const candidates = sum((d) => d.counts?.candidates ?? 0);
          const interviewers = sum((d) => d.counts?.interviewers ?? 0);
          const interviews = sum((d) => d.counts?.interviews ?? 0);

          const stats: Stat[] = [
            { label: "Drives", value: pad2(drives.length), icon: "drives", note: `${published.length} published` },
            { label: "Candidates", value: pad2(candidates), icon: "candidates", note: "Registered in drives" },
            { label: "Interviewers", value: pad2(interviewers), icon: "user", note: "Joined drives" },
            { label: "Interviews", value: pad2(interviews), icon: "check", note: `${sum((d) => d.counts?.openSlots ?? 0)} open slots` },
          ];

          const steps = [
            { done: drives.length > 0, text: "Create a drive and define its rounds", href: "#/drives/new" },
            { done: published.length > 0, text: "Publish it so people can join", href: "#/drives" },
            { done: candidates > 0 && interviewers > 0, text: "Candidates register, interviewers add availability", href: "#/drives" },
            { done: interviews > 0, text: "Generate the schedule", href: "#/schedule" },
          ];

          return (
            <>
              <section className="stats-grid" aria-label="Key numbers">
                {stats.map((s) => (
                  <StatCard key={s.label} stat={s} />
                ))}
              </section>

              <section className="overview-grid">
                <article className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Your Drives</h2>
                      <p>Most recent first</p>
                    </div>
                    <a className="text-button" href="#/drives">
                      All drives <Icon name="arrow" size={14} />
                    </a>
                  </div>
                  {drives.length === 0 ? (
                    <p className="empty-note">No drives yet. Create your first one to get started.</p>
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>DRIVE</th>
                            <th>WHEN</th>
                            <th>PEOPLE</th>
                            <th>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drives.slice(0, 6).map((d) => (
                            <tr key={d.id}>
                              <td>
                                <a className="row-link" href={`#/drives/${d.id}`}>
                                  <strong>{d.title}</strong>
                                </a>
                                <span className="secondary-cell">{d.company}</span>
                              </td>
                              <td>{formatDate(d.windowStart)}</td>
                              <td>
                                {d.counts?.candidates ?? 0} candidates
                                <span className="secondary-cell">{d.counts?.interviewers ?? 0} interviewers</span>
                              </td>
                              <td>
                                <StatusBadge status={d.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>

                <article className="panel activity-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Getting Started</h2>
                      <p>The usual order of things</p>
                    </div>
                  </div>
                  <ol className="checklist">
                    {steps.map((s) => (
                      <li key={s.text} className={s.done ? "done" : undefined}>
                        <span className="check-dot" aria-hidden="true">{s.done ? "✓" : ""}</span>
                        <a href={s.href}>{s.text}</a>
                      </li>
                    ))}
                  </ol>
                  <a className="secondary-button" href="#/drives/new">
                    <Icon name="plus" size={14} /> New drive
                  </a>
                </article>
              </section>
            </>
          );
        }}
      </Async>
    </>
  );
}

function AttendeeOverview({ role, name }: { role: "candidate" | "interviewer"; name: string }) {
  const state = useAsync(async () => {
    const [drives, interviews] = await Promise.all([api.drives.list(), api.interviews.list()]);
    return { drives, interviews };
  }, []);
  const isCandidate = role === "candidate";

  return (
    <>
      <Heading
        eyebrow={isCandidate ? "CANDIDATE" : "INTERVIEWER"}
        name={name}
        subtitle={isCandidate ? "Your drives and interviews at a glance." : "The drives you've joined and the candidates you're meeting."}
      />
      <Async state={state}>
        {({ drives, interviews }) => {
          const mine = drives.filter((d) => d.joined);
          const booked = interviews.filter((i) => i.status === "scheduled" || i.status === "completed");
          const open = interviews.filter((i) => i.status === "open");
          const upcoming = booked.filter((i) => new Date(i.startsAt).getTime() > Date.now());
          const next = upcoming[0];

          const stats: Stat[] = [
            { label: isCandidate ? "Drives Registered" : "Drives Joined", value: pad2(mine.length), icon: "drives", note: `${drives.length} open to join` },
            { label: "Interviews", value: pad2(booked.length), icon: "check", note: isCandidate ? "Booked for you" : "Assigned to you" },
            isCandidate
              ? { label: "Rounds To Book", value: pad2(roundsToBook(mine, booked)), icon: "schedule", note: "Across your drives" }
              : { label: "Open Slots", value: pad2(open.length), icon: "clock", note: "Waiting for a candidate" },
            { label: "Next Interview", value: next ? formatDate(next.startsAt) : "—", icon: "trend", note: next ? formatDateTime(next.startsAt) : "Nothing coming up" },
          ];

          return (
            <>
              <section className="stats-grid" aria-label="Your numbers">
                {stats.map((s) => (
                  <StatCard key={s.label} stat={s} />
                ))}
              </section>

              {mine.length === 0 ? (
                <article className="panel panel-spaced placeholder-panel">
                  <h2>You haven't joined a drive yet</h2>
                  <p>{isCandidate ? "Register for a placement drive to book your interviews." : "Join a drive and tell us when you're free."}</p>
                  <a className="primary-button cta" href="#/drives">
                    Browse drives
                  </a>
                </article>
              ) : (
                <>
                  <article className="panel panel-spaced">
                    <div className="panel-heading">
                      <div>
                        <h2>{isCandidate ? "Your Interviews" : "Your Schedule"}</h2>
                        <p>{booked.length ? "In time order" : isCandidate ? "Nothing booked yet" : "Nothing assigned yet"}</p>
                      </div>
                      <a className="text-button" href="#/schedule">
                        {isCandidate ? "Book or manage" : "Open my schedule"} <Icon name="arrow" size={14} />
                      </a>
                    </div>
                    <InterviewTable
                      rows={booked.slice(0, 8)}
                      showCandidate={!isCandidate}
                      showInterviewer={isCandidate}
                      empty={isCandidate ? "Open My Interviews to pick your times." : "You'll see interviews here once a schedule is generated."}
                    />
                  </article>
                  <MyDrives drives={mine} isCandidate={isCandidate} interviews={booked} />
                </>
              )}
            </>
          );
        }}
      </Async>
    </>
  );
}

function roundsToBook(drives: Drive[], booked: Interview[]): number {
  return drives.reduce((n, d) => n + d.rounds.filter((r) => !booked.some((b) => b.round.id === r.id)).length, 0);
}

function MyDrives({ drives, isCandidate, interviews }: { drives: Drive[]; isCandidate: boolean; interviews: Interview[] }) {
  return (
    <article className="panel panel-spaced">
      <div className="panel-heading">
        <div>
          <h2>Your Drives</h2>
          <p>{isCandidate ? "Progress through the interview rounds" : "Where you're taking part"}</p>
        </div>
      </div>
      <ul className="drive-list">
        {drives.map((d) => {
          const done = d.rounds.filter((r) => interviews.some((i) => i.round.id === r.id)).length;
          return (
            <li key={d.id}>
              <div>
                <a className="row-link" href={`#/drives/${d.id}`}>
                  <strong>{d.title}</strong>
                </a>
                <span className="secondary-cell">
                  {d.company} · {formatRange(d.windowStart, d.windowEnd)}
                </span>
              </div>
              {isCandidate ? (
                <div className="drive-progress">
                  <span>
                    {done} of {d.rounds.length} rounds booked
                  </span>
                  <div className="progress-track" aria-hidden="true">
                    <div className="progress-fill" style={{ width: `${d.rounds.length ? (done / d.rounds.length) * 100 : 0}%` }} />
                  </div>
                </div>
              ) : (
                <a className="text-button" href={`#/availability/${d.id}`}>
                  Set availability <Icon name="arrow" size={14} />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
