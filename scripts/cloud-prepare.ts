import { config } from "dotenv";
config({ path: ".env.vercel.local", override: true, quiet: true });
const url = new URL(process.env.DATABASE_URL ?? "");
if (!url.hostname.endsWith(".neon.tech"))
  throw new Error("The cloud setup requires the linked Neon database.");
const { migrate } = await import("./migrate");
const { seed } = await import("./seed");
const { closeDatabase } = await import("../src/db");
await migrate();
await seed();
await closeDatabase();
console.log("The linked Neon database is ready. No credentials were printed.");
