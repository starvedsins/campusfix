import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import pg from "pg";
import { chromium } from "@playwright/test";
const base = process.env.LOAD_BASE_URL ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error(
    "Run the 500-client load test against the local presentation copy only.",
  );
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.ceil(values.length * p) - 1)
  ];
const summarize = (values: number[]) => ({
  samples: values.length,
  minMs: Math.round(Math.min(...values)),
  p50Ms: Math.round(percentile(values, 0.5)),
  p95Ms: Math.round(percentile(values, 0.95)),
  maxMs: Math.round(Math.max(...values)),
});
const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify({
    identifier: "student@utech.edu.jm",
    password: process.env.DEMO_PASSWORD ?? "CampusFix2026!",
  }),
});
if (!login.ok) throw new Error("The demo account could not sign in.");
const cookie = login.headers
  .getSetCookie()
  .find((value) => value.startsWith("campusfix_session="))!
  .split(";")[0];
await fetch(base + "/api/dashboard", { headers: { Cookie: cookie } });
const durations: number[] = [];
let failed = 0;
const begin = performance.now();
await Promise.all(
  Array.from({ length: 500 }, async () => {
    const start = performance.now();
    try {
      const response = await fetch(base + "/api/dashboard", {
        headers: { Cookie: cookie },
      });
      await response.arrayBuffer();
      if (!response.ok) failed++;
    } catch {
      failed++;
    }
    durations.push(performance.now() - start);
  }),
);
const elapsed = performance.now() - begin;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const queryTimes: number[] = [];
for (let i = 0; i < 100; i++) {
  const start = performance.now();
  await client.query(
    "SELECT t.ticket_id,t.status,l.building_name,c.category_name FROM tickets t JOIN locations l USING(location_id) JOIN categories c USING(category_id) ORDER BY t.created_at DESC LIMIT 25",
  );
  queryTimes.push(performance.now() - start);
}
const version = (await client.query("SHOW server_version")).rows[0]
  .server_version;
await client.end();
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies([
  { name: "campusfix_session", value: cookie.split("=")[1], url: base },
]);
const page = await context.newPage();
const navigationTimes: number[] = [];
for (let i = 0; i < 5; i++) {
  const start = performance.now();
  await page.goto(base + "/app");
  await page.getByRole("heading", { name: "Hello, Avery." }).waitFor();
  await page.locator(".stats-row").waitFor();
  navigationTimes.push(performance.now() - start);
}
await browser.close();
await fetch(base + "/api/auth/logout", {
  method: "POST",
  headers: { Cookie: cookie, Origin: base },
});
const evidence = {
  runAt: new Date().toISOString(),
  mode: process.env.LOAD_MODE ?? "local development",
  environment: {
    platform: os.platform(),
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    totalMemoryGb: Math.round(os.totalmem() / 1024 ** 3),
    node: process.version,
    postgres: version,
  },
  scenario:
    "500 simultaneous authenticated dashboard requests. Clients share one demo account. No login load or hosted load was tested.",
  api: {
    ...summarize(durations),
    failed,
    elapsedMs: Math.round(elapsed),
    targetP95Ms: 2000,
    targetMet: failed === 0 && percentile(durations, 0.95) <= 2000,
  },
  database: {
    ...summarize(queryTimes),
    query: "Latest 25 reports with category and location joins",
    targetP95Ms: 500,
    targetMet: percentile(queryTimes, 0.95) <= 500,
  },
  navigation: {
    ...summarize(navigationTimes),
    targetP95Ms: 2000,
    targetMet: percentile(navigationTimes, 0.95) <= 2000,
  },
};
await mkdir("docs/evidence", { recursive: true });
await writeFile(
  "docs/evidence/performance.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(JSON.stringify(evidence, null, 2));
