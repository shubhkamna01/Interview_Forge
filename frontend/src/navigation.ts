import type { Role } from "./auth/roles";
import type { IconName } from "./components/Icon";
import type { View } from "./hooks/useRoute";

export interface NavItem {
  view: View;
  icon: IconName;
  label: string;
}

const NAV: Record<Role, NavItem[]> = {
  coordinator: [
    { view: "overview", icon: "dashboard", label: "Overview" },
    { view: "drives", icon: "drives", label: "Drives" },
    { view: "rooms", icon: "rooms", label: "Rooms" },
    { view: "schedule", icon: "schedule", label: "Schedule" },
  ],
  interviewer: [
    { view: "overview", icon: "dashboard", label: "Overview" },
    { view: "drives", icon: "drives", label: "Drives" },
    { view: "availability", icon: "clock", label: "Availability" },
    { view: "schedule", icon: "schedule", label: "My Schedule" },
  ],
  candidate: [
    { view: "overview", icon: "dashboard", label: "Overview" },
    { view: "drives", icon: "drives", label: "Drives" },
    { view: "availability", icon: "clock", label: "Availability" },
    { view: "schedule", icon: "schedule", label: "My Interviews" },
  ],
};

export const navFor = (role: Role): NavItem[] => NAV[role];

/** Pages a role may open: its sidebar pages plus the ones everyone has. */
export const allowedViews = (role: Role): View[] => [...NAV[role].map((n) => n.view), "notifications", "profile"];

const TITLES: Record<View, string> = {
  overview: "Overview",
  drives: "Drives",
  availability: "Availability",
  rooms: "Rooms",
  schedule: "Schedule",
  notifications: "Notifications",
  profile: "Profile",
};

export function viewTitle(view: View, role: Role): string {
  return NAV[role].find((n) => n.view === view)?.label ?? TITLES[view];
}
