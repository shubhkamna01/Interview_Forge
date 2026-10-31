import "./App.css";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { useAuth } from "./auth/useAuth";
import { useRoute } from "./hooks/useRoute";
import { allowedViews } from "./navigation";
import { Availability } from "./pages/Availability";
import { Drives } from "./pages/Drives";
import { Notifications } from "./pages/Notifications";
import { Overview } from "./pages/Overview";
import { Profile } from "./pages/Profile";
import { Rooms } from "./pages/Rooms";
import { Schedule } from "./pages/Schedule";

function App() {
  const { user } = useAuth();
  // AuthGate only renders <App /> when someone is signed in.
  if (!user) return null;
  return <Workspace role={user.role} />;
}

function Workspace({ role }: { role: NonNullable<ReturnType<typeof useAuth>["user"]>["role"] }) {
  const route = useRoute(allowedViews(role));

  return (
    <div className="app-shell">
      <Sidebar active={route.view} />

      <main className="main-content">
        <Topbar view={route.view} />

        {route.view === "overview" && <Overview />}
        {route.view === "drives" && <Drives route={route} />}
        {route.view === "availability" && <Availability route={route} />}
        {route.view === "rooms" && <Rooms />}
        {route.view === "schedule" && <Schedule route={route} />}
        {route.view === "notifications" && <Notifications />}
        {route.view === "profile" && <Profile />}

        <footer className="footer">
          <span>Interview Forge · Intelligent Interview Scheduling</span>
          <span>v1.0</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
