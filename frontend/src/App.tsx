import { useCallback, useState } from "react";
import "./App.css";
import { Icon } from "./components/Icon";
import { InterviewTable } from "./components/InterviewTable";
import { Placeholder } from "./components/Placeholder";
import { Sidebar } from "./components/Sidebar";
import { Toast } from "./components/Toast";
import { Topbar } from "./components/Topbar";
import { TOTAL_CANDIDATES, interviews, stats } from "./data/mock";
import { useHashView } from "./hooks/useHashView";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const todayLabel = new Date().toLocaleDateString("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function App() {
  const view = useHashView();
  const [toast, setToast] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  const shown = interviews.length;
  const progress = Math.round((shown / TOTAL_CANDIDATES) * 100);

  return (
    <div className="app-shell">
      <Sidebar active={view} />

      <main className="main-content">
        <Topbar view={view} />

        {view === "dashboard" && (
          <>
            <section className="page-heading">
              <div>
                <p className="eyebrow">PLACEMENT OVERVIEW · {todayLabel.toUpperCase()}</p>
                <h1>
                  {greeting()}, Coordinator <span>✦</span>
                </h1>
                <p className="subtitle">
                  Here's what's happening with your interview schedule.
                </p>
              </div>
              <button
                className="primary-button"
                onClick={() =>
                  setToast("The scheduling engine will be added in an upcoming milestone.")
                }
              >
                <Icon name="sparkles" size={16} /> Generate Schedule
              </button>
            </section>

            <section className="stats-grid" aria-label="Key numbers">
              {stats.map((stat) => (
                <article className="stat-card" key={stat.label}>
                  <div className="stat-top">
                    <span className="stat-label">{stat.label}</span>
                    <span className="stat-icon">
                      <Icon name={stat.icon} />
                    </span>
                  </div>
                  <h2>{stat.value}</h2>
                  <p>{stat.note}</p>
                </article>
              ))}
            </section>

            <section className="overview-grid">
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Upcoming Interviews</h2>
                    <p>Your interview lineup for today</p>
                  </div>
                  <a className="text-button" href="#/schedule">
                    View schedule <Icon name="arrow" size={14} />
                  </a>
                </div>
                <InterviewTable rows={interviews} />
              </article>

              <article className="panel activity-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Scheduling Overview</h2>
                    <p>Sample workload summary</p>
                  </div>
                </div>

                <div className="overview-number">
                  <div>
                    <span>Assignments shown</span>
                    <h3>
                      {String(shown).padStart(2, "0")}{" "}
                      <small>/ {TOTAL_CANDIDATES} candidates</small>
                    </h3>
                  </div>
                  <span className="overview-symbol">
                    <Icon name="trend" />
                  </span>
                </div>

                <div
                  className="progress-track"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Candidates with a sample assignment"
                >
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <p className="muted-note">
                  Illustrative progress only — not live scheduling data.
                </p>

                <div className="divider" />

                <div className="quick-status">
                  <div className="status-dot green-dot" />
                  <div>
                    <strong>Schedule workspace</strong>
                    <p>Ready for scheduling logic</p>
                  </div>
                </div>
                <div className="quick-status">
                  <div className="status-dot amber-dot" />
                  <div>
                    <strong>Conflict detection</strong>
                    <p>Not implemented yet</p>
                  </div>
                </div>

                <a className="secondary-button" href="#/candidates">
                  Explore workspace <Icon name="arrow" size={14} />
                </a>
              </article>
            </section>
          </>
        )}

        {view === "schedule" && (
          <>
            <section className="page-heading">
              <div>
                <p className="eyebrow">SCHEDULE</p>
                <h1>Interview Schedule</h1>
                <p className="subtitle">All sample interviews for today, in time order.</p>
              </div>
              <button
                className="primary-button"
                onClick={() => setToast("The scheduling engine will be added in an upcoming milestone.")}
              >
                <Icon name="sparkles" size={16} /> Generate Schedule
              </button>
            </section>
            <article className="panel">
              <InterviewTable rows={interviews} />
            </article>
          </>
        )}

        {view === "candidates" && (
          <Placeholder
            eyebrow="PEOPLE"
            title="Candidates"
            icon="candidates"
            description="Manage everyone who needs to be interviewed."
            planned={["Add, edit and remove candidates", "Role, availability and preferences", "Bulk import from CSV"]}
          />
        )}

        {view === "interviewers" && (
          <Placeholder
            eyebrow="PEOPLE"
            title="Interviewers"
            icon="interviewers"
            description="Keep track of who can interview, and when."
            planned={["Interviewer profiles and skills", "Availability windows", "Workload balancing"]}
          />
        )}

        {view === "rooms" && (
          <Placeholder
            eyebrow="RESOURCES"
            title="Rooms & Slots"
            icon="rooms"
            description="Define interview rooms and their time slots."
            planned={["Room list with capacity", "Slot length and break rules", "Room/slot conflict checks"]}
          />
        )}

        <footer className="footer">
          <span>Interview Forge · Intelligent Interview Scheduling</span>
          <span>Development preview · Sample data</span>
        </footer>
      </main>

      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}

export default App;
