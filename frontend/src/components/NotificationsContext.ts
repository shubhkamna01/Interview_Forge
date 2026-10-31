import { createContext } from "react";
import type { AppNotification } from "../api";

export interface NotificationsValue {
  items: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const NotificationsContext = createContext<NotificationsValue | null>(null);
