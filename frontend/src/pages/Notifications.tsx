import { useAction } from "../hooks/useAction";
import { LoadingPanel } from "../components/Async";
import { useNotifications } from "../components/useNotifications";
import { timeAgo } from "../lib/format";

export function Notifications() {
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const { busy, run } = useAction();

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">UPDATES</p>
          <h1>Notifications</h1>
          <p className="subtitle">Bookings, schedule changes and cancellations show up here.</p>
        </div>
        {unreadCount > 0 && (
          <button className="secondary-button" disabled={busy} onClick={() => run(markAllRead)}>
            Mark all as read ({unreadCount})
          </button>
        )}
      </section>

      {loading && items.length === 0 ? (
        <LoadingPanel />
      ) : items.length === 0 ? (
        <article className="panel placeholder-panel">
          <h2>You're all caught up</h2>
          <p>New notifications will appear here.</p>
        </article>
      ) : (
        <article className="panel">
          <ul className="notification-list">
            {items.map((n) => (
              <li key={n.id} className={n.read ? "" : "unread"}>
                <span className="unread-dot" aria-label={n.read ? "Read" : "Unread"} />
                <div className="notification-body">
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <span className="secondary-cell">{timeAgo(n.createdAt)}</span>
                </div>
                {!n.read && (
                  <button className="text-button" disabled={busy} onClick={() => run(() => markRead(n.id))}>
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        </article>
      )}
    </>
  );
}
