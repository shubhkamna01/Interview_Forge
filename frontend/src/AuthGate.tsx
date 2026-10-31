import App from "./App";
import { useAuth } from "./auth/useAuth";
import { NotificationsProvider } from "./components/NotificationsProvider";
import { Login } from "./pages/Login";

export function AuthGate() {
  const { user, restoring } = useAuth();

  if (restoring) {
    return (
      <div className="splash" role="status">
        Loading…
      </div>
    );
  }
  if (!user) return <Login />;

  return (
    <NotificationsProvider>
      <App />
    </NotificationsProvider>
  );
}
