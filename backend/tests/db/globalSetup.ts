import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { startEmbeddedPostgres } from "../../src/dev/embeddedDb";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

/** One real PostgreSQL for the whole test run, thrown away afterwards. */
export default async function setup() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "if-test-pg-"));
  const db = await startEmbeddedPostgres({ dataDir: dir, port: await freePort(), persistent: false });

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = db.url;
  process.env.JWT_SECRET = "test-secret-test-secret-test-secret-1234";
  process.env.COORDINATOR_SIGNUP_CODE = "team-code-123";
  process.env.AUTH_RATE_LIMIT_MAX = "10000";

  const { pool } = await import("../../src/db/pool");
  const { migrate } = await import("../../src/db/migrate");
  await migrate(pool);
  await pool.end();

  return async () => {
    await db.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
