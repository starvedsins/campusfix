import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import sharp from "sharp";
import { sql } from "drizzle-orm";
const run = promisify(execFile);
// Use only the isolated check container, never the main presentation database.
process.env.DATABASE_URL =
  "postgresql://campusfix:campusfix-local-only@127.0.0.1:55433/campusfix";
process.env.STORAGE_DRIVER = "local";
const { migrate } = await import("./migrate");
const { seed } = await import("./seed");
const { one, closeDatabase } = await import("../src/db");
const { createTicket } = await import("../src/lib/tickets");
const { saveLocalPhoto } = await import("../src/lib/storage");
const { login } = await import("../src/lib/auth");
type User = import("../src/lib/domain").User;
await migrate();
await seed();
const user = (await one<User>(
  sql`SELECT * FROM users WHERE email='student@utech.edu.jm'`,
))!;
const category = (await one<{ category_id: string }>(
  sql`SELECT category_id FROM categories WHERE category_name='Electrical'`,
))!;
const location = (await one<{ location_id: string }>(
  sql`SELECT location_id FROM locations ORDER BY location_id LIMIT 1`,
))!;
const photo = await sharp({
  create: { width: 32, height: 32, channels: 3, background: "#557b60" },
})
  .png()
  .toBuffer();
const attachment = await saveLocalPhoto(
  user,
  new File([new Uint8Array(photo)], "restart-proof.png", { type: "image/png" }),
  "BEFORE",
);
const report = await createTicket(user, {
  categoryId: category.category_id,
  locationId: location.location_id,
  title: `Restart check ${randomUUID().slice(0, 8)}`,
  description: "This is a controlled restart check for the course application.",
  urgency: "LOW",
  submissionKey: randomUUID(),
  attachmentId: attachment!.attachment_id as string,
});
const token = await login({
  identifier: user.email,
  password: "CampusFix2026!",
});
await closeDatabase();
const url = "http://localhost:3002";
let server: ChildProcess | undefined;
async function start() {
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", "3002"],
    {
      env: { ...process.env, APP_URL: url },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error("The restart check server exited.");
    try {
      if ((await fetch(url + "/api/health")).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("The restart check server did not start.");
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const stopped = new Promise<void>((resolve) =>
    server!.once("exit", () => resolve()),
  );
  server.kill("SIGTERM");
  await stopped;
}
const headers = { Cookie: `campusfix_session=${token}` };
async function read() {
  const response = await fetch(`${url}/api/tickets/${report.ticketId}`, {
    headers,
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  const image = await fetch(
    `${url}/api/attachments/${attachment!.attachment_id}`,
    { headers },
  );
  assert.equal(image.status, 200);
  return {
    ticket: data.ticket,
    attachments: data.attachments,
    photoHash: createHash("sha256")
      .update(Buffer.from(await image.arrayBuffer()))
      .digest("hex"),
  };
}
try {
  await start();
  const before = await read();
  await stop();
  await run("docker", ["compose", "-p", "campusfix-check", "restart", "db"], {
    env: { ...process.env, CAMPUSFIX_DB_PORT: "55433" },
    timeout: 60000,
  });
  await start();
  const after = await read();
  assert.deepEqual(after, before);
  await mkdir("docs/evidence", { recursive: true });
  await writeFile(
    "docs/evidence/persistence.json",
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        passed: true,
        database:
          "PostgreSQL 16 in isolated Docker container campusfix-check-db-1",
        application: "Next.js production server on local port 3002",
        operations: [
          "Create a ticket with a validated PNG",
          "Read its private photo and ticket using the real HTTP API",
          "Stop the application server",
          "Restart the PostgreSQL container",
          "Start a new application process",
          "Read using the persisted session and compare the ticket, attachment metadata, and photo hash",
        ],
        ticketId: report.ticketId,
        photoSha256: after.photoHash,
      },
      null,
      2,
    ),
  );
  console.log(
    "Application and Docker database restart check passed. Ticket, session, and private photo survived.",
  );
} finally {
  await stop();
  await closeDatabase();
}
