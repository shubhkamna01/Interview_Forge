import { pool } from "./pool";
import { migrate } from "./migrate";

const applied = await migrate(pool);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
await pool.end();
