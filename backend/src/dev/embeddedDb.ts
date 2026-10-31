import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

export interface EmbeddedDb {
  url: string;
  stop: () => Promise<void>;
}

/**
 * Starts a real PostgreSQL server from an npm package, so development and tests need
 * no separate database install. Not for production: use a managed Postgres (e.g. Supabase) there.
 */
export async function startEmbeddedPostgres(opts: { dataDir: string; port: number; persistent: boolean }): Promise<EmbeddedDb> {
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    user: "postgres",
    password: "postgres",
    port: opts.port,
    persistent: opts.persistent,
    onLog: () => undefined,
    onError: () => undefined,
  });

  if (!existsSync(path.join(opts.dataDir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase("interviewforge");
  } catch {
    /* already exists */
  }

  return {
    url: `postgres://postgres:postgres@localhost:${opts.port}/interviewforge`,
    stop: () => pg.stop(),
  };
}
