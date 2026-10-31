import { pool } from "./pool";
import { seedDemoData } from "./seed";

console.log((await seedDemoData(pool)) ? "Demo data created." : "Skipped: the database already has users.");
await pool.end();
