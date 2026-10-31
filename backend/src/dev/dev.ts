// `npm run dev`: starts everything needed locally, with no setup.
// If DATABASE_URL isn't set, a real PostgreSQL is started from an npm package and its data is kept in ./.data/pg.
import "dotenv/config";
import path from "node:path";
import { startEmbeddedPostgres, type EmbeddedDb } from "./embeddedDb";

let embedded: EmbeddedDb | null = null;

if (!process.env.DATABASE_URL) {
  const dataDir = path.resolve(".data/pg");
  console.log("No DATABASE_URL set: starting a local PostgreSQL (first run takes a few seconds)...");
  embedded = await startEmbeddedPostgres({ dataDir, port: Number(process.env.DEV_DB_PORT ?? 54329), persistent: true });
  process.env.DATABASE_URL = embedded.url;
}

// Imported after DATABASE_URL is known, because the connection pool reads it on load.
const { config } = await import("../config");
const { pool } = await import("../db/pool");
const { migrate } = await import("../db/migrate");
const { seedDemoData } = await import("../db/seed");
const { createApp } = await import("../app");

const applied = await migrate(pool);
if (applied.length) console.log(`Applied migrations: ${applied.join(", ")}`);

if (process.env.SEED_DEMO !== "false" && (await seedDemoData(pool))) {
  console.log("Demo data created. Sign in with coordinator@interviewforge.com / forge123");
  console.log("(also interviewer@interviewforge.com and candidate@interviewforge.com, same password)");
}

const server = createApp().listen(config.port, () => {
  console.log(`InterviewForge API ready: http://localhost:${config.port}/api/health`);
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  await pool.end().catch(() => undefined);
  await embedded?.stop().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
