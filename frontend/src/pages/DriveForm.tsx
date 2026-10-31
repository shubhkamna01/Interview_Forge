import { useState, type SyntheticEvent } from "react";
import { api, type Drive, type RoundInput, type RoundType } from "../api";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { useAction } from "../hooks/useAction";
import { go } from "../hooks/useRoute";
import { daysFromNow, roundTypeLabel } from "../lib/format";

interface RoundDraft {
  name: string;
  type: RoundType;
  durationMinutes: string;
  skills: string;
  minGapMinutes: string;
  requiredCapacity: string;
}

const two = (n: number) => String(n).padStart(2, "0");
const dateValue = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const timeValue = (iso: string) => {
  const d = new Date(iso);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
};

const blankRound = (n: number): RoundDraft => ({
  name: n === 1 ? "Online Assessment" : n === 2 ? "Technical Interview" : `Round ${n}`,
  type: n === 1 ? "online_assessment" : "technical",
  durationMinutes: n === 1 ? "30" : "45",
  skills: "",
  minGapMinutes: "15",
  requiredCapacity: "2",
});

const fromRound = (r: Drive["rounds"][number]): RoundDraft => ({
  name: r.name,
  type: r.type,
  durationMinutes: String(r.durationMinutes),
  skills: r.requiredSkills.join(", "),
  minGapMinutes: String(r.minGapMinutes),
  requiredCapacity: String(r.requiredCapacity),
});

export function DriveForm({ drive }: { drive?: Drive }) {
  const { busy, run } = useAction();

  const [title, setTitle] = useState(drive?.title ?? "");
  const [company, setCompany] = useState(drive?.company ?? "");
  const [date, setDate] = useState(dateValue(drive?.windowStart ?? daysFromNow(1)));
  const [start, setStart] = useState(drive ? timeValue(drive.windowStart) : "09:00");
  const [end, setEnd] = useState(drive ? timeValue(drive.windowEnd) : "17:00");
  const [rounds, setRounds] = useState<RoundDraft[]>(drive ? drive.rounds.map(fromRound) : [blankRound(1), blankRound(2)]);
  const [error, setError] = useState<string | null>(null);

  const editing = Boolean(drive);
  const patch = (i: number, p: Partial<RoundDraft>) => setRounds((list) => list.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const move = (i: number, by: -1 | 1) =>
    setRounds((list) => {
      const j = i + by;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const windowStart = new Date(`${date}T${start}`);
    const windowEnd = new Date(`${date}T${end}`);
    if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime())) return setError("Enter the date and both times.");
    if (windowEnd <= windowStart) return setError("The window must end after it starts.");

    const input = {
      title: title.trim(),
      company: company.trim(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      rounds: rounds.map(
        (r): RoundInput => ({
          name: r.name.trim(),
          type: r.type,
          durationMinutes: Number(r.durationMinutes),
          requiredSkills: r.skills.split(",").map((s) => s.trim()).filter(Boolean),
          minGapMinutes: Number(r.minGapMinutes) || 0,
          requiredCapacity: Number(r.requiredCapacity) || 2,
        }),
      ),
    };

    setError(null);
    const saved = await run(() => (drive ? api.drives.update(drive.id, input) : api.drives.create(input)), drive ? "Drive saved." : "Drive created. Publish it when you're ready.");
    if (saved) go(`drives/${saved.id}`);
    else setError("The drive couldn't be saved. Check the highlighted message above and try again.");
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">PLACEMENT DRIVE</p>
          <h1>{editing ? "Edit drive" : "New drive"}</h1>
          <p className="subtitle">Define the company, the day, and the interview rounds to schedule.</p>
        </div>
      </section>

      <form onSubmit={submit}>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Drive details</h2>
              <p>Interviews will only be scheduled inside this time window.</p>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Drive name">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Campus Drive 2026" required maxLength={120} />
            </Field>
            <Field label="Company">
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="TechCorp" required maxLength={120} />
            </Field>
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <div className="field-pair">
              <Field label="Window starts">
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
              </Field>
              <Field label="Window ends">
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
              </Field>
            </div>
          </div>
        </article>

        <article className="panel panel-spaced">
          <div className="panel-heading">
            <div>
              <h2>Interview rounds</h2>
              <p>Candidates go through these in order. Each round starts at least its minimum gap after the previous one ends.</p>
            </div>
          </div>

          <ol className="round-list">
            {rounds.map((r, i) => (
              <li key={i} className="round-card">
                <div className="round-head">
                  <span className="round-number">{i + 1}</span>
                  <div className="round-tools">
                    <button type="button" className="icon-button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move round up">↑</button>
                    <button type="button" className="icon-button" onClick={() => move(i, 1)} disabled={i === rounds.length - 1} aria-label="Move round down">↓</button>
                    <button type="button" className="icon-button" onClick={() => setRounds((l) => l.filter((_, k) => k !== i))} disabled={rounds.length === 1} aria-label="Remove round">
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
                <div className="form-grid compact">
                  <Field label="Round name">
                    <input value={r.name} onChange={(e) => patch(i, { name: e.target.value })} required maxLength={80} />
                  </Field>
                  <Field label="Type">
                    <select value={r.type} onChange={(e) => patch(i, { type: e.target.value as RoundType })}>
                      {Object.entries(roundTypeLabel).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Duration (minutes)">
                    <input type="number" min={5} max={480} value={r.durationMinutes} onChange={(e) => patch(i, { durationMinutes: e.target.value })} required />
                  </Field>
                  {i > 0 && (
                    <Field label="Minimum gap after previous (min)">
                      <input type="number" min={0} max={480} value={r.minGapMinutes} onChange={(e) => patch(i, { minGapMinutes: e.target.value })} />
                    </Field>
                  )}
                  <Field label="Room must hold (people)">
                    <input type="number" min={1} max={50} value={r.requiredCapacity} onChange={(e) => patch(i, { requiredCapacity: e.target.value })} />
                  </Field>
                  <Field label="Interviewer skills needed" hint="Comma separated. Leave empty for any interviewer.">
                    <input value={r.skills} onChange={(e) => patch(i, { skills: e.target.value })} placeholder="dsa, java" />
                  </Field>
                </div>
              </li>
            ))}
          </ol>

          <div className="panel-footer">
            <button type="button" className="secondary-button" disabled={rounds.length >= 8} onClick={() => setRounds((l) => [...l, blankRound(l.length + 1)])}>
              <Icon name="plus" size={14} /> Add a round
            </button>
          </div>
        </article>

        {error && (
          <p className="login-error form-error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button className="primary-button" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create drive"}
          </button>
          <a className="secondary-button" href={drive ? `#/drives/${drive.id}` : "#/drives"}>
            Cancel
          </a>
        </div>
      </form>
    </>
  );
}
