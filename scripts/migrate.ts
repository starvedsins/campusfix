import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export async function migrate(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("Set DATABASE_URL in .env.local first.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(8024001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS campusfix_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    for (const name of (await readdir("db/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (
          await client.query(
            "SELECT 1 FROM campusfix_migrations WHERE name=$1",
            [name],
          )
        ).rowCount
      )
        continue;
      await client.query("BEGIN");
      try {
        await client.query(
          await readFile(path.join("db/migrations", name), "utf8"),
        );
        await client.query(
          "INSERT INTO campusfix_migrations(name) VALUES ($1)",
          [name],
        );
        await client.query("COMMIT");
        console.log(`Applied ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}
if (process.argv[1]?.endsWith("migrate.ts")) await migrate();
