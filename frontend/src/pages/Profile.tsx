import { useState, type SyntheticEvent } from "react";
import { api } from "../api";
import { ROLE_LABEL } from "../auth/roles";
import { useAuth } from "../auth/useAuth";
import { Field } from "../components/Field";
import { useAction } from "../hooks/useAction";

export function Profile() {
  const { user, setUser } = useAuth();
  const { busy, run } = useAction();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [skills, setSkills] = useState((user?.skills ?? []).join(", "));
  if (!user) return null;

  async function save(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const updated = await run(
      () =>
        api.auth.updateProfile({
          name: name.trim(),
          phone: phone.trim() || null,
          skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      "Profile saved.",
    );
    if (updated) {
      setUser(updated);
      setSkills(updated.skills.join(", "));
    }
  }

  const skillsMatter =
    user.role === "interviewer"
      ? "Rounds that need a skill are only given to interviewers who have it, so list what you can interview on (for example: dsa, system design, hr)."
      : "Optional. Shown to your coordinator.";

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">ACCOUNT</p>
          <h1>Your profile</h1>
          <p className="subtitle">
            {ROLE_LABEL[user.role]} · {user.email}
          </p>
        </div>
      </section>

      <article className="panel">
        <form className="form-grid" onSubmit={save}>
          <Field label="Full name">
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" maxLength={30} />
          </Field>
          <Field label="Skill tags" hint={skillsMatter} className="wide">
            <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="dsa, system design" />
          </Field>
          <div className="form-actions wide">
            <button className="primary-button" disabled={busy || !name.trim()}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </article>
    </>
  );
}
