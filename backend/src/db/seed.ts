import type pg from "pg";
import { hashPassword } from "../services/passwords";

export const DEMO_PASSWORD = "forge123";

/**
 * Demo data for local development: three login accounts plus a published drive with people,
 * rooms and availability, so "Generate schedule" has something to work on straight away.
 * Does nothing if any user already exists. Never run this against production.
 */
export async function seedDemoData(pool: pg.Pool): Promise<boolean> {
  const existing = await pool.query("SELECT 1 FROM users LIMIT 1");
  if (existing.rowCount) return false;

  const hash = await hashPassword(DEMO_PASSWORD);
  const addUser = async (name: string, email: string, role: string, skills: string[] = []) => {
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO users (name, email, password_hash, role, skills) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [name, email, hash, role, skills],
    );
    return rows[0].id;
  };

  const coordinator = await addUser("Placement Coordinator", "coordinator@interviewforge.com", "coordinator");
  const interviewers = [
    await addUser("Priya Mehta", "interviewer@interviewforge.com", "interviewer", ["dsa"]),
    await addUser("Rahul Verma", "rahul@interviewforge.com", "interviewer", ["dsa"]),
    await addUser("Neha Kapoor", "neha@interviewforge.com", "interviewer", ["hr"]),
    await addUser("Arjun Nair", "arjun@interviewforge.com", "interviewer", ["hr", "dsa"]),
  ];
  const names = [
    "Aarav Sharma", "Ananya Singh", "Ishaan Gupta", "Meera Joshi", "Rohit Malhotra", "Sneha Iyer",
    "Kabir Khanna", "Diya Patel", "Aditya Rao", "Tanvi Desai", "Yash Agarwal", "Riya Bansal",
  ];
  const candidates: string[] = [];
  for (const [i, n] of names.entries()) {
    candidates.push(await addUser(n, i === 0 ? "candidate@interviewforge.com" : `${n.split(" ")[0].toLowerCase()}@interviewforge.com`, "candidate"));
  }

  for (const [name, capacity] of [["Room 01", 4], ["Room 02", 4], ["Room 03", 6]] as const) {
    await pool.query("INSERT INTO rooms (name, capacity) VALUES ($1, $2)", [name, capacity]);
  }

  // Tomorrow, 09:00 to 17:00 in the server's local time.
  const at = (h: number) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, 0, 0, 0);
    return d;
  };

  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO drives (title, company, window_start, window_end, status, created_by) VALUES ($1, $2, $3, $4, 'published', $5) RETURNING id",
    ["Campus Drive 2026", "TechCorp", at(9), at(17), coordinator],
  );
  const drive = rows[0].id;

  const rounds: [string, string, number, string[], number][] = [
    ["Online Assessment", "online_assessment", 30, [], 0],
    ["Technical Interview", "technical", 45, ["dsa"], 15],
    ["HR Interview", "hr", 30, ["hr"], 15],
  ];
  for (const [i, [name, type, mins, skills, gap]] of rounds.entries()) {
    await pool.query(
      `INSERT INTO rounds (drive_id, position, name, type, duration_minutes, required_skills, min_gap_minutes, required_capacity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 2)`,
      [drive, i + 1, name, type, mins, skills, gap],
    );
  }

  const windows: [number, number][] = [[9, 17], [9, 17], [10, 16], [9, 13]];
  for (const [i, id] of interviewers.entries()) {
    await pool.query("INSERT INTO drive_participants (drive_id, user_id) VALUES ($1, $2)", [drive, id]);
    await pool.query("INSERT INTO availability (drive_id, user_id, starts_at, ends_at) VALUES ($1, $2, $3, $4)", [drive, id, at(windows[i][0]), at(windows[i][1])]);
  }
  for (const [i, id] of candidates.entries()) {
    await pool.query("INSERT INTO drive_participants (drive_id, user_id) VALUES ($1, $2)", [drive, id]);
    // One candidate is only free in the morning, to show the solver handling a constraint.
    if (i === 1) {
      await pool.query("INSERT INTO availability (drive_id, user_id, starts_at, ends_at) VALUES ($1, $2, $3, $4)", [drive, id, at(9), at(12)]);
    }
  }
  return true;
}
