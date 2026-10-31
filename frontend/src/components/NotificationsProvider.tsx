import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type AppNotification } from "../api";
import { NotificationsContext } from "./NotificationsContext";

const POLL_MS = 30_000;

/** Keeps the bell's unread count fresh. (Polling; a live push channel can replace this later.) */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.notifications.list();
      setItems(res.items);
      setUnreadCount(res.unreadCount);
    } catch {
      /* the bell is a nicety: stay quiet if the poll fails */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const markRead = useCallback(
    async (id: string) => {
      await api.notifications.markRead(id);
      await refresh();
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    await api.notifications.markAllRead();
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ items, unreadCount, loading, refresh, markRead, markAllRead }),
    [items, unreadCount, loading, refresh, markRead, markAllRead],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
