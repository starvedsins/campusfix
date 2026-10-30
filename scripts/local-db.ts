import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const databaseDir = path.resolve(".data/postgres");
const server = new EmbeddedPostgres({
  databaseDir,
  user: "campusfix",
  password: "campusfix-local-only",
  port: 55432,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  autoRehydrateSymlinks: true,
  onLog: (message) => {
    if (
      /ready to accept connections|database system is shut down/.test(message)
    )
      console.log(message);
  },
});
if (!existsSync(path.join(databaseDir, "PG_VERSION")))
  await server.initialise();
await server.start();
const client = new pg.Client({
  connectionString:
    "postgresql://campusfix:campusfix-local-only@127.0.0.1:55432/postgres",
});
await client.connect();
for (const name of ["campusfix", "campusfix_test"])
  if (
    !(await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]))
      .rowCount
  )
    await client.query(`CREATE DATABASE ${name}`);
await client.end();
console.log(
  "CampusFix PostgreSQL is ready on 127.0.0.1:55432. Keep this terminal running.",
);
const stop = async () => {
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("message", (message) => {
  if (message === "shutdown") void stop();
});
setInterval(() => {}, 60_000);
