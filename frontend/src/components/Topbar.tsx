import type { View } from "../hooks/useHashView";

const titles: Record<View, string> = {
  dashboard: "Dashboard",
  candidates: "Candidates",
  interviewers: "Interviewers",
  rooms: "Rooms & Slots",
  schedule: "Schedule",
};

export function Topbar({ view }: { view: View }) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        Workspace <span>/</span> {titles[view]}
      </div>
      <div className="topbar-right">
        <span className="demo-label">DEMO DATA</span>
        <div className="avatar small-avatar">PC</div>
      </div>
    </header>
  );
}
