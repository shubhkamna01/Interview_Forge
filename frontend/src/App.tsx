import "./App.css";

const stats = [
  {
    label: "Total Candidates",
    value: "24",
    icon: "♙",
    note: "Registered candidates",
  },
  {
    label: "Interviewers",
    value: "08",
    icon: "♧",
    note: "Available interviewers",
  },
  { label: "Rooms", value: "04", icon: "▦", note: "Interview rooms" },
  {
    label: "Scheduled Interviews",
    value: "18",
    icon: "✓",
    note: "Sample assignments",
  },
];

const interviews = [
  {
    time: "09:00 AM",
    candidate: "Aarav Sharma",
    role: "Software Engineer",
    interviewer: "Priya Mehta",
    room: "Room 01",
    status: "Scheduled",
  },
  {
    time: "10:00 AM",
    candidate: "Ananya Singh",
    role: "Data Analyst",
    interviewer: "Rahul Verma",
    room: "Room 02",
    status: "Scheduled",
  },
  {
    time: "11:00 AM",
    candidate: "Ishaan Gupta",
    role: "Product Intern",
    interviewer: "Neha Kapoor",
    room: "Room 03",
    status: "Pending",
  },
  {
    time: "12:00 PM",
    candidate: "Meera Joshi",
    role: "Software Engineer",
    interviewer: "Priya Mehta",
    room: "Room 01",
    status: "Scheduled",
  },
];

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <h2>SlotWise</h2>
            <span>INTERVIEW INTELLIGENCE</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav className="navigation">
          <a className="nav-item active" href="#dashboard">
            <span>▦</span> Dashboard
          </a>
          <a className="nav-item" href="#candidates">
            <span>♙</span> Candidates
          </a>
          <a className="nav-item" href="#interviewers">
            <span>♧</span> Interviewers
          </a>
          <a className="nav-item" href="#rooms">
            <span>▤</span> Rooms & Slots
          </a>
          <a className="nav-item" href="#schedule">
            <span>▦</span> Schedule
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">✦</div>
            <strong>Scheduling made simpler.</strong>
            <p>Coordinate interviews without the chaos.</p>
          </div>
          <div className="profile">
            <div className="avatar">PC</div>
            <div>
              <strong>Placement Team</strong>
              <span>Coordinator</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> Dashboard
          </div>
          <div className="topbar-right">
            <span className="demo-label">DEMO DATA</span>
            <div className="avatar small-avatar">PC</div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <p className="eyebrow">PLACEMENT OVERVIEW</p>
            <h1>
              Good morning, Coordinator <span>✦</span>
            </h1>
            <p className="subtitle">
              Here's what's happening with your interview schedule.
            </p>
          </div>
          <button
            className="primary-button"
            onClick={() =>
              alert(
                "The scheduling engine will be added in our next milestones.",
              )
            }
          >
            <span>✦</span> Generate Schedule
          </button>
        </section>

        <section className="stats-grid">
          {stats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <div className="stat-top">
                <span className="stat-label">{stat.label}</span>
                <span className="stat-icon">{stat.icon}</span>
              </div>
              <h2>{stat.value}</h2>
              <p>{stat.note}</p>
            </article>
          ))}
        </section>

        <section className="overview-grid">
          <article className="panel schedule-panel" id="schedule">
            <div className="panel-heading">
              <div>
                <h2>Upcoming Interviews</h2>
                <p>Your interview lineup for today</p>
              </div>
              <button
                className="text-button"
                onClick={() => alert("Full schedule view is coming next.")}
              >
                View schedule →
              </button>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>TIME</th>
                    <th>CANDIDATE</th>
                    <th>INTERVIEWER</th>
                    <th>ROOM</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {interviews.map((interview) => (
                    <tr key={interview.candidate}>
                      <td className="time-cell">{interview.time}</td>
                      <td>
                        <strong>{interview.candidate}</strong>
                        <span className="secondary-cell">{interview.role}</span>
                      </td>
                      <td>{interview.interviewer}</td>
                      <td>{interview.room}</td>
                      <td>
                        <span
                          className={`status ${interview.status.toLowerCase()}`}
                        >
                          {interview.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                  04 <small>/ 24 candidates</small>
                </h3>
              </div>
              <span className="overview-symbol">↗</span>
            </div>

            <div className="progress-track">
              <div className="progress-fill" />
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

            <button
              className="secondary-button"
              onClick={() =>
                alert(
                  "Candidate and interviewer management will be built next.",
                )
              }
            >
              Explore workspace →
            </button>
          </article>
        </section>

        <footer className="footer">
          <span>SlotWise · Intelligent Interview Scheduling</span>
          <span>Development preview · Sample data</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
