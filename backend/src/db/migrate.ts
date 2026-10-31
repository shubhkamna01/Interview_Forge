import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

/** Applies any *.sql files in ./migrations that haven't run yet, in filename order. Safe to call repeatedly. */
export async function migrate(pool: pg.Pool): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    // One process migrates at a time, even if several instances start together.
    await client.query("SELECT pg_advisory_lock(727001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name as string));
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727001)").catch(() => undefined);
    client.release();
  }
  return applied;
}
