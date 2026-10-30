import { config } from "dotenv";
import assert from "node:assert/strict";
import pg from "pg";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
config({ path: ".env.vercel.local", quiet: true });
const base = "https://campusfix-seven-iota.vercel.app";
const health = await fetch(base + "/api/health");
const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify({
    identifier: "student@utech.edu.jm",
    password: "CampusFix2026!",
  }),
});
const rawCookie =
  login.headers
    .getSetCookie()
    .find((c) => c.startsWith("campusfix_session=")) ?? "";
const cookie = rawCookie.split(";")[0];
assert.equal(health.status, 200);
assert.equal(login.status, 200);
assert.match(rawCookie, /;\s*Secure/i);
assert.match(rawCookie, /;\s*HttpOnly/i);
assert.match(rawCookie, /SameSite=lax/i);
const session = await fetch(base + "/api/session", {
  headers: { Cookie: cookie },
});
await fetch(base + "/api/auth/logout", {
  method: "POST",
  headers: { Cookie: cookie, Origin: base },
});
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const jobs = (
  await c.query(
    "SELECT kind,status,count(*)::int AS count,count(workflow_run_id)::int AS linked_workflows FROM background_jobs GROUP BY kind,status ORDER BY kind,status",
  )
).rows;
const delivery = (
  await c.query(
    "SELECT status,count(*)::int AS count FROM notification_deliveries GROUP BY status ORDER BY status",
  )
).rows;
const schema = (
  await c.query(
    "SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
  )
).rows[0];
await c.end();
const original = await readFile(
  "../CampusFix_Programme_Manual_Data_Design.sql",
);
const baseline = await readFile("db/migrations/0001_course_baseline.sql");
await writeFile(
  "docs/evidence/deployment.json",
  JSON.stringify(
    {
      runAt: new Date().toISOString(),
      url: base,
      team: "campusfix7",
      selectedPlans: {
        vercel: "Hobby",
        neon: "Free free_v3",
        blob: "Private store in iad1",
      },
      healthStatus: health.status,
      health: await health.json(),
      loginStatus: login.status,
      sessionStatus: session.status,
      sessionCookie: {
        secure: /;\s*Secure/i.test(rawCookie),
        httpOnly: /;\s*HttpOnly/i.test(rawCookie),
        sameSiteLax: /SameSite=lax/i.test(rawCookie),
      },
      schema,
      jobs,
      delivery,
      live72HourWaitObserved: false,
    },
    null,
    2,
  ),
);
await writeFile(
  "docs/evidence/course-sql-integrity.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      unchangedCopy: original.equals(baseline),
      sha256: createHash("sha256").update(original).digest("hex"),
      original: "../CampusFix_Programme_Manual_Data_Design.sql",
      copy: "db/migrations/0001_course_baseline.sql",
    },
    null,
    2,
  ),
);
console.log(
  "Saved hosted checks, Workflow totals, cookie flags, and baseline integrity. No secrets were saved.",
);
