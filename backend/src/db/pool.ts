import pg from "pg";
import { config } from "../config";

if (!config.databaseUrl) {
  // Not fatal at import time so tools like `tsc` and unit tests of pure code still work.
  console.warn("DATABASE_URL is not set. Database calls will fail.");
}

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
});

export type Db = pg.Pool | pg.PoolClient;

/**
 * Runs `fn` inside one transaction on one connection.
 * Any thrown error rolls everything back, so a half-finished booking can never be saved.
 */
export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
