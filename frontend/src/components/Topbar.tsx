import { ROLE_LABEL } from "../auth/roles";
import { initials, useAuth } from "../auth/useAuth";
import type { View } from "../hooks/useRoute";
import { viewTitle } from "../navigation";
import { Icon } from "./Icon";
import { useNotifications } from "./useNotifications";

export function Topbar({ view }: { view: View }) {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  if (!user) return null;

  return (
    <header className="topbar">
      <div className="breadcrumb">
        Workspace <span>/</span> {viewTitle(view, user.role)}
      </div>
      <div className="topbar-right">
        <span className="role-badge">{ROLE_LABEL[user.role]}</span>
        <a
          className="bell"
          href="#/notifications"
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
          title="Notifications"
        >
          <Icon name="bell" />
          {unreadCount > 0 && <span className="bell-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
        </a>
        <a href="#/profile" className="avatar small-avatar" title="Your profile">
          {initials(user.name)}
        </a>
      </div>
    </header>
  );
}
