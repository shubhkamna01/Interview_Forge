import type { IconName } from "../data/mock";
import type { View } from "../hooks/useHashView";
import { Icon } from "./Icon";

const items: { view: View; label: string; icon: IconName }[] = [
  { view: "dashboard", label: "Dashboard", icon: "dashboard" },
  { view: "candidates", label: "Candidates", icon: "candidates" },
  { view: "interviewers", label: "Interviewers", icon: "interviewers" },
  { view: "rooms", label: "Rooms & Slots", icon: "rooms" },
  { view: "schedule", label: "Schedule", icon: "schedule" },
];

export function Sidebar({ active }: { active: View }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">I</div>
        <div className="brand-text">
          <h2>Interview Forge</h2>
          <span>INTERVIEW INTELLIGENCE</span>
        </div>
      </div>

      <div className="nav-label">WORKSPACE</div>

      <nav className="navigation" aria-label="Main">
        {items.map((item) => (
          <a
            key={item.view}
            className={`nav-item${active === item.view ? " active" : ""}`}
            href={`#/${item.view}`}
            aria-current={active === item.view ? "page" : undefined}
            title={item.label}
          >
            <Icon name={item.icon} />
            <span className="nav-text">{item.label}</span>
          </a>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="help-card">
          <div className="help-icon">
            <Icon name="sparkles" size={20} />
          </div>
          <strong>Scheduling made simpler.</strong>
          <p>Coordinate interviews without the chaos.</p>
        </div>
        <div className="profile">
          <div className="avatar">PC</div>
          <div className="profile-text">
            <strong>Placement Team</strong>
            <span>Coordinator</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
