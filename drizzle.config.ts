import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
config({ path: ".env.local", quiet: true });
export default defineConfig({
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  out: "./db/introspection",
  schema: "./src/db/schema.ts",
});
