import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const { migrate } = await import("./migrate");
const { seed } = await import("./seed");
const { closeDatabase } = await import("../src/db");
await migrate();
await seed();
await closeDatabase();
