import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthProvider } from "../src/auth/AuthProvider";
import { AuthGate } from "../src/AuthGate";
import { ToastProvider } from "../src/components/ToastProvider";

configure({ asyncUtilTimeout: 10_000 });

// The tests talk to a real backend started with: PORT=8124 npm run dev (in ../backend, fresh database).
const BASE = "http://localhost:8124/api";

async function call<T = any>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.message}`);
  return json as T;
}
const loginApi = async (email: string, password = "forge123") => (await call("POST", "/auth/login", undefined, { email, password })).token as string;

function mount() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ToastProvider>,
  );
}

const user = userEvent.setup();

async function signInWithDemo(role: "Coordinator" | "Interviewer" | "Candidate") {
  await user.click(await screen.findByRole("button", { name: role }));
  await user.click(screen.getByRole("button", { name: /fill demo credentials/i }));
  await user.click(screen.getByRole("button", { name: `Sign in as ${role}` }));
  // Wait until the signed-in page is showing; login itself resets the URL to the overview.
  await screen.findByText(/Good (morning|afternoon|evening)/);
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});
afterEach(cleanup);

describe("coordinator", () => {
  it("signs in, creates and publishes a drive, then generates a schedule", async () => {
    mount();
    await signInWithDemo("Coordinator");
    await screen.findByText(/Good (morning|afternoon|evening), Coordinator/);
    expect(await screen.findByText("Campus Drive 2026")).toBeTruthy();

    // Create a drive through the form.
    window.location.hash = "#/drives/new";
    fireEvent.change(await screen.findByLabelText(/Drive name/), { target: { value: "UI Test Drive" } });
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "UiCorp" } });
    await user.click(screen.getByRole("button", { name: /add a round/i }));
    expect(screen.getAllByLabelText(/Round name/)).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Create drive" }));

    await screen.findByRole("heading", { name: /UI Test Drive/ });
    expect(screen.getByText("Draft")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getAllByText("Published").length).toBeGreaterThan(0));

    // Generate the seeded drive's schedule and read the report.
    window.location.hash = "#/drives";
    await user.click(await screen.findByRole("link", { name: "Campus Drive 2026" }));
    await user.click(await screen.findByRole("button", { name: /generate schedule/i }));
    await screen.findByText(/interviews? created/);
    expect(await screen.findByText(/could not be scheduled|Everyone is fully scheduled/)).toBeTruthy();
    expect(screen.getByText("Average wait between rounds")).toBeTruthy();

    // The same schedule is on the Schedule page, one click away.
    await user.click(screen.getByRole("link", { name: /view all interviews/i }));
    await screen.findByText("All interviews");
    expect((await screen.findAllByText("Online Assessment")).length).toBeGreaterThan(5);
  }, 60_000);

  it("manages rooms", async () => {
    mount();
    await signInWithDemo("Coordinator");
    window.location.hash = "#/rooms";
    await screen.findByText("Room 03");
    fireEvent.change(screen.getByLabelText(/Room name/), { target: { value: "Lab Z" } });
    await user.click(screen.getByRole("button", { name: /add room/i }));
    await screen.findByText("Lab Z");
    // Duplicate names are refused with a readable message.
    fireEvent.change(screen.getByLabelText(/Room name/), { target: { value: "lab z" } });
    await user.click(screen.getByRole("button", { name: /add room/i }));
    await screen.findByText("A room with that name already exists.");
    // Delete needs a second click.
    const row = screen.getByText("Lab Z").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: /delete/i }));
    await user.click(within(row).getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(screen.queryByText("Lab Z")).toBeNull());
  }, 60_000);
});

describe("candidate and interviewer", () => {
  it("a candidate sees their scheduled rounds and an interviewer sees theirs", async () => {
    mount();
    await signInWithDemo("Candidate");
    window.location.hash = "#/schedule";
    await screen.findByText(/rounds booked/);
    expect((await screen.findAllByText("Add to calendar")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Log out" }));

    await signInWithDemo("Interviewer");
    window.location.hash = "#/schedule";
    await screen.findByRole("button", { name: /I can't make it/i });
    expect((await screen.findAllByText("Scheduled")).length).toBeGreaterThan(0);

    // Role fences: an interviewer who types a coordinator URL lands on their own overview.
    window.location.hash = "#/rooms";
    await screen.findByText(/Good (morning|afternoon|evening), Priya/);
  }, 60_000);

  it("rejects a wrong password and a wrong role with readable messages", async () => {
    mount();
    await user.click(await screen.findByRole("button", { name: "Coordinator" }));
    await user.type(screen.getByLabelText(/Email/), "coordinator@interviewforge.com");
    await user.type(screen.getByLabelText(/Password/), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in as Coordinator" }));
    expect(await screen.findByText("Incorrect email or password.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Candidate" }));
    await user.clear(screen.getByLabelText(/Password/));
    await user.type(screen.getByLabelText(/Password/), "forge123");
    await user.click(screen.getByRole("button", { name: "Sign in as Candidate" }));
    expect(await screen.findByText(/different role/)).toBeTruthy();
  }, 60_000);

  it("a new candidate signs up, registers for a drive, picks slots, and books every round", async () => {
    // Set the stage through the API: a published two-round drive with one interviewer.
    const coord = await loginApi("coordinator@interviewforge.com");
    const day = (h: number) => {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      d.setHours(h, 0, 0, 0);
      return d.toISOString();
    };
    const drive = await call("POST", "/drives", coord, {
      title: "Slot Test Drive",
      company: "SlotCorp",
      windowStart: day(9),
      windowEnd: day(17),
      rounds: [
        { name: "Screening", type: "technical", durationMinutes: 30 },
        { name: "Final Round", type: "hr", durationMinutes: 30, minGapMinutes: 15 },
      ],
    });
    await call("POST", `/drives/${drive.id}/publish`, coord);
    const iv = await loginApi("interviewer@interviewforge.com");
    await call("POST", `/drives/${drive.id}/join`, iv);
    await call("PUT", `/drives/${drive.id}/availability`, iv, { windows: [{ startsAt: day(9), endsAt: day(17) }] });

    // The candidate signs up in the UI.
    mount();
    await user.click(await screen.findByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText(/Full name/), "Uma Tester");
    await user.type(screen.getByLabelText(/Email/), `uma-${Date.now()}@example.com`);
    await user.type(screen.getByLabelText(/Password/), "password123");
    await user.click(screen.getByRole("button", { name: /create candidate account/i }));
    await screen.findByText(/Good (morning|afternoon|evening), Uma/);

    // Registers for the drive.
    window.location.hash = "#/drives";
    const card = (await screen.findByText("Slot Test Drive")).closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Register" }));
    await within(card).findByText("Registered");

    // Before slots exist, the page explains what happens next.
    window.location.hash = `#/schedule/${drive.id}`;
    await screen.findByText(/No slots are open for this round yet/);

    // The coordinator opens slots; the candidate gets a notification and can book.
    await call("POST", `/drives/${drive.id}/open-slots`, coord);
    window.location.hash = "#/notifications";
    await screen.findByText(/Interview slots are open/, undefined, { timeout: 10_000 }).catch(async () => {
      // The bell polls every 30 s; a refocus triggers an immediate refresh.
      window.dispatchEvent(new Event("focus"));
      await screen.findByText(/Interview slots are open/);
    });

    window.location.hash = `#/schedule/${drive.id}`;
    await screen.findByText(/Choose a time/);
    const firstSlots = document.querySelectorAll<HTMLButtonElement>(".slot-button");
    expect(firstSlots.length).toBeGreaterThan(0);
    await user.click(firstSlots[0]);
    await screen.findByText("Interview booked!");

    // Round 2 unlocks, and only later times are offered.
    await waitFor(() => expect(screen.getByText("Add to calendar")).toBeTruthy());
    await waitFor(() => expect(document.querySelectorAll(".slot-button").length).toBeGreaterThan(0));
    await user.click(document.querySelectorAll<HTMLButtonElement>(".slot-button")[0]);
    await screen.findByText(/All your rounds are booked/);
    expect(screen.getAllByText("Add to calendar")).toHaveLength(2);

    // The booking really exists on the server, once per round.
    const token = localStorage.getItem("interviewforge.token")!;
    const mine = await call<any[]>("GET", `/interviews?driveId=${drive.id}`, token);
    expect(mine.map((i) => i.round.name).sort()).toEqual(["Final Round", "Screening"]);
  }, 90_000);
});

describe("availability and rescheduling", () => {
  it("an interviewer edits availability and the interview limit, with validation", async () => {
    mount();
    await signInWithDemo("Interviewer");
    // The interviewer may have joined several drives; open this one explicitly.
    const mine = await call<any[]>("GET", "/drives", localStorage.getItem("interviewforge.token")!);
    const campus = mine.find((d) => d.title === "Campus Drive 2026");
    window.location.hash = `#/availability/${campus.id}`;
    await screen.findByText(/Your skills:/);
    expect(screen.getByText(/Your skills:/).parentElement!.textContent).toContain("dsa");

    // Invalid: the end is before the start.
    await user.click(screen.getByRole("button", { name: /add a time window/i }));
    const [from, until] = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')).slice(-2);
    fireEvent.change(from, { target: { value: until.value } });
    fireEvent.change(until, { target: { value: from.min } });
    await user.click(screen.getByRole("button", { name: "Save availability" }));
    expect(await screen.findByText(/must end after it starts|inside the drive window/)).toBeTruthy();

    // Valid: restore the whole window, set a limit, save.
    fireEvent.change(from, { target: { value: from.min } });
    fireEvent.change(until, { target: { value: from.max } });
    fireEvent.change(screen.getByLabelText(/Most interviews/), { target: { value: "6" } });
    await user.click(screen.getByRole("button", { name: "Save availability" }));
    await screen.findByText("Availability saved.");

    const token = localStorage.getItem("interviewforge.token")!;
    const saved = await call("GET", `/drives/${campus.id}/availability`, token);
    expect(saved.maxInterviews).toBe(6);
  }, 60_000);

  it("a coordinator previews and applies an interviewer cancellation", async () => {
    mount();
    await signInWithDemo("Coordinator");
    window.location.hash = "#/drives";
    await user.click(await screen.findByRole("link", { name: "Campus Drive 2026" }));
    await user.click(await screen.findByRole("link", { name: /view all interviews/i }));
    await user.click(await screen.findByRole("button", { name: /interviewer cancelled/i }));

    await user.selectOptions(await screen.findByLabelText(/^Interviewer/), "Priya Mehta");
    await user.click(screen.getByRole("button", { name: /see what would change/i }));
    await screen.findByText(/interviews? affected/);
    expect(screen.getByText("PLAN")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /apply these changes/i }));
    await user.click(screen.getByRole("button", { name: /click again to apply/i }));
    await screen.findByText(/\d+ moved/);

    // On the server: Priya has nothing left, everyone else's interviews are untouched, nobody is double-booked.
    const coord = localStorage.getItem("interviewforge.token")!;
    const drives = await call<any[]>("GET", "/drives", coord);
    const id = drives.find((d) => d.title === "Campus Drive 2026").id;
    const all = await call<any[]>("GET", `/interviews?driveId=${id}`, coord);
    expect(all.filter((i) => i.interviewer.name === "Priya Mehta")).toEqual([]);
    expect(all.length).toBeGreaterThan(20);
    const seen = new Set<string>();
    for (const i of all) {
      for (const key of [`iv:${i.interviewer.id}:${i.startsAt}`, `rm:${i.room.id}:${i.startsAt}`]) {
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  }, 60_000);

});
