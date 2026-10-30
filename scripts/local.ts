import { config } from "dotenv";
import { existsSync, copyFileSync } from "node:fs";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import pg from "pg";
if (!existsSync(".env.local")) copyFileSync(".env.example", ".env.local");
config({ path: ".env.local", quiet: true });
const children: ChildProcess[] = [];
let managedDatabase: ChildProcess | undefined;
const run = (args: string[], ipc = false) => {
  const child = spawn(process.execPath, args, {
    stdio: ipc ? ["inherit", "inherit", "inherit", "ipc"] : "inherit",
    windowsHide: true,
  });
  children.push(child);
  return child;
};
async function reachable() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 1000,
  });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}
if (!(await reachable())) {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "55432"
  )
    throw new Error(
      "The configured database is not reachable. Check DATABASE_URL.",
    );
  managedDatabase = run(
    ["node_modules/tsx/dist/cli.mjs", "scripts/local-db.ts"],
    true,
  );
  const deadline = Date.now() + 60_000;
  while (!(await reachable())) {
    if (Date.now() > deadline)
      throw new Error(
        "PostgreSQL did not start. Run npm run db:start to inspect its log.",
      );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
const { migrate } = await import("./migrate");
const { seed } = await import("./seed");
const { closeDatabase } = await import("../src/db");
await migrate();
await seed();
await closeDatabase();
run(["node_modules/tsx/dist/cli.mjs", "scripts/jobs.ts"]);
const web = run(["node_modules/next/dist/bin/next", "dev"]);
console.log("Open http://localhost:3000. Use Ctrl+C to stop CampusFix.");
const stop = () => {
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (child === managedDatabase && child.connected) {
      child.send("shutdown");
      continue;
    }
    if (process.platform === "win32")
      execFile(
        "taskkill",
        ["/pid", String(child.pid), "/t", "/f"],
        { windowsHide: true },
        () => {},
      );
    else child.kill("SIGTERM");
  }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
web.on("exit", (code) => {
  stop();
  process.exitCode = code ?? 0;
});
