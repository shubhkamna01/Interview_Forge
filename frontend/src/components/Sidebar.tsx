import { ROLE_LABEL } from "../auth/roles";
import { initials, useAuth } from "../auth/useAuth";
import type { View } from "../hooks/useRoute";
import { navFor } from "../navigation";
import { Icon } from "./Icon";

export function Sidebar({ active }: { active: View }) {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">IF</div>
        <div className="brand-text">
          <h2>Interview Forge</h2>
          <span>INTERVIEW INTELLIGENCE</span>
        </div>
      </div>

      <div className="nav-label">WORKSPACE</div>

      <nav className="navigation" aria-label="Main">
        {navFor(user.role).map((item) => (
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
          <a className="profile-link" href="#/profile" title="Your profile">
            <div className="avatar">{initials(user.name)}</div>
            <div className="profile-text">
              <strong>{user.name}</strong>
              <span>{ROLE_LABEL[user.role]}</span>
            </div>
          </a>
          <button className="logout-button" onClick={logout} aria-label="Log out" title="Log out">
            <Icon name="logout" />
          </button>
        </div>
      </div>
    </aside>
  );
}
