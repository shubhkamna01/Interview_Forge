import { useState, type SyntheticEvent } from "react";
import { errorMessage } from "../api";
import { ROLES, type Role } from "../auth/roles";
import { useAuth } from "../auth/useAuth";
import { Field } from "../components/Field";

// Created by `npm run dev` in the backend. Only shown while developing; stripped from production builds.
const DEV_PASSWORD = "forge123";
const DEV_EMAIL: Record<Role, string> = {
  candidate: "candidate@interviewforge.com",
  interviewer: "interviewer@interviewforge.com",
  coordinator: "coordinator@interviewforge.com",
};

export function Login() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<Role>("candidate");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = ROLES.find((r) => r.id === role)!;
  const signingUp = mode === "signup";

  async function onSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (signingUp && !name.trim()) return setError("Enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    if (signingUp && password.length < 8) return setError("Password must be at least 8 characters.");

    setError(null);
    setBusy(true);
    try {
      if (signingUp) {
        await signup({ name: name.trim(), email: email.trim(), password, role, accessCode: role === "coordinator" ? accessCode : undefined });
      } else {
        await login(email.trim(), password, role);
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function switchMode(next: "login" | "signup") {
    setMode(next);
    setError(null);
  }

  return (
    <div className="login-shell">
      <section className="login-hero" aria-hidden="true">
        <div className="brand">
          <div className="brand-mark light">IF</div>
          <div className="brand-text">
            <h2>Interview Forge</h2>
            <span>INTERVIEW INTELLIGENCE</span>
          </div>
        </div>
        <h1>Coordinate interviews without the chaos.</h1>
        <p>Drives, rounds, availability, rooms and slots, all in one place.</p>
      </section>

      <main className="login-panel">
        <form className="login-card" onSubmit={onSubmit} noValidate>
          <h2>{signingUp ? "Create your account" : "Welcome back"}</h2>
          <p className="login-sub">{signingUp ? "Choose how you'll use Interview Forge." : "Choose how you're signing in."}</p>

          <div className="role-picker" role="group" aria-label="I am a">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`role-option${r.id === role ? " selected" : ""}`}
                aria-pressed={r.id === role}
                onClick={() => {
                  setRole(r.id);
                  setError(null);
                }}
                disabled={busy}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="role-blurb">{current.blurb}</p>

          {signingUp && (
            <Field label="Full name">
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" disabled={busy} />
            </Field>
          )}
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@college.edu" disabled={busy} />
          </Field>
          <Field label="Password" hint={signingUp ? "At least 8 characters." : undefined}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={signingUp ? "new-password" : "current-password"}
              placeholder="••••••••"
              disabled={busy}
            />
          </Field>
          {signingUp && role === "coordinator" && (
            <Field label="Coordinator access code" hint="Ask your placement team lead for this code.">
              <input value={accessCode} onChange={(e) => setAccessCode(e.target.value)} autoComplete="off" disabled={busy} />
            </Field>
          )}

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button className="primary-button login-submit" type="submit" disabled={busy}>
            {busy ? "Please wait…" : signingUp ? `Create ${current.label.toLowerCase()} account` : `Sign in as ${current.label}`}
          </button>

          <p className="switch-mode">
            {signingUp ? "Already have an account?" : "New here?"}{" "}
            <button type="button" className="link-button" onClick={() => switchMode(signingUp ? "login" : "signup")} disabled={busy}>
              {signingUp ? "Sign in" : "Create an account"}
            </button>
          </p>

          {import.meta.env.DEV && !signingUp && (
            <div className="demo-box">
              <strong>Development demo account</strong>
              <span>Created by <code>npm run dev</code> in the backend:</span>
              <code>{DEV_EMAIL[role]}</code>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setEmail(DEV_EMAIL[role]);
                  setPassword(DEV_PASSWORD);
                  setError(null);
                }}
              >
                Fill demo credentials
              </button>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
