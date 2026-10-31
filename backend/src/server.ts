import { createApp } from "./app";
import { config } from "./config";
import { migrate } from "./db/migrate";
import { pool } from "./db/pool";

const applied = await migrate(pool);
if (applied.length) console.log(`Applied migrations: ${applied.join(", ")}`);

const server = createApp().listen(config.port, () => {
  console.log(`InterviewForge API listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
