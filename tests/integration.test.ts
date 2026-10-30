import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate";
import { seed } from "../scripts/seed";
import { closeDatabase, one, rows } from "../src/db";
import { getUser, login, logout } from "../src/lib/auth";
import type { User } from "../src/lib/domain";
import { processTestDeliveries } from "../src/lib/notifications";
import { createUser, updateReference, updateUser } from "../src/lib/reference";
import { exportCsv, reports } from "../src/lib/reports";
import { photoBytes, saveLocalPhoto } from "../src/lib/storage";
import {
  autoCloseTicket,
  createTicket,
  duplicateSuggestions,
  listTickets,
  ticketAction,
  ticketDetail,
} from "../src/lib/tickets";

config({ path: ".env.local", quiet: true });
let student: User,
  staff: User,
  admin: User,
  dispatcher: User,
  tech: User,
  plumber: User;
let categoryId: string, locationId: string;
let image: Buffer;
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== "/campusfix_test")
    throw new Error(
      "Integration tests require the separate campusfix_test database.",
    );
  await closeDatabase();
  process.env.DATABASE_URL = url;
  process.env.STORAGE_DRIVER = "local";
  process.env.LOCAL_STORAGE_DIR = ".data/test-uploads";
  await migrate(url);
  // The guarded test database is disposable. Reset it so reruns have the same inputs.
  await rows(sql`TRUNCATE TABLE users,locations,categories CASCADE`);
  await rows(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1001`);
  await seed();
  const users = await rows<User>(sql`SELECT * FROM users`);
  student = users.find((u) => u.role === "STUDENT")!;
  staff = users.find((u) => u.role === "STAFF")!;
  admin = users.find((u) => u.role === "FMD_ADMIN")!;
  dispatcher = users.find((u) => u.role === "FMD_DISPATCHER")!;
  tech = users.find((u) => u.email === "technician@utech.edu.jm")!;
  plumber = users.find((u) => u.email === "plumber@utech.edu.jm")!;
  categoryId = (await one<{ category_id: string }>(
    sql`SELECT category_id FROM categories WHERE category_name='Electrical'`,
  ))!.category_id;
  locationId = (await one<{ location_id: string }>(
    sql`SELECT location_id FROM locations WHERE room_number='Computer Lab 3'`,
  ))!.location_id;
  image = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "#4d7856" },
  })
    .png()
    .toBuffer();
});
afterAll(closeDatabase);
async function report(
  owner = student,
  overrides: Record<string, unknown> = {},
) {
  return createTicket(owner, {
    categoryId,
    locationId,
    title: "Integration test report",
    description: "A classroom light needs a careful inspection.",
    urgency: "MEDIUM",
    submissionKey: randomUUID(),
    ...overrides,
  });
}
async function current(id: string) {
  return (await ticketDetail(admin, id)).ticket;
}
async function assign(
  id: string,
  priority = "P2_URGENT",
  technicianId = tech.user_id,
) {
  const t = await current(id);
  await ticketAction(dispatcher, id, {
    action: "assign",
    version: t.version,
    priority,
    technicianId,
  });
  return current(id);
}
describe("Authentication and account access", () => {
  it("signs in by institutional ID and revokes the session on logout", async () => {
    const token = await login({
      identifier: student.institutional_id,
      password: "CampusFix2026!",
    });
    expect((await getUser(token))?.user_id).toBe(student.user_id);
    await logout(token);
    expect(await getUser(token)).toBeNull();
  });
  it("uses a generic error for an unknown account", async () => {
    await expect(
      login({
        identifier: "missing@utech.edu.jm",
        password: "NotThePassword!",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("locks after five failed attempts and permits sign-in after expiry", async () => {
    const suffix = randomUUID().slice(0, 8);
    const made = await createUser(admin, {
      fullName: "Lock Test",
      institutionalId: `LOCK${suffix}`,
      email: `lock${suffix}@utech.edu.jm`,
      role: "STAFF",
      password: "ValidPassword2026!",
    });
    for (let i = 1; i <= 5; i++)
      await expect(
        login({ identifier: `LOCK${suffix}`, password: "WrongPassword!" }),
      ).rejects.toMatchObject({ status: i === 5 ? 429 : 401 });
    await expect(
      login({ identifier: `LOCK${suffix}`, password: "ValidPassword2026!" }),
    ).rejects.toMatchObject({ status: 429 });
    await rows(
      sql`UPDATE users SET locked_until=NOW()-INTERVAL '1 minute' WHERE user_id=${made!.user_id}::uuid`,
    );
    const token = await login({
      identifier: `LOCK${suffix}`,
      password: "ValidPassword2026!",
    });
    expect((await getUser(token))?.full_name).toBe("Lock Test");
  });
  it("prevents a reporter from creating admin accounts", async () => {
    await expect(createUser(student, {})).rejects.toMatchObject({
      status: 403,
    });
  });
});
describe("Ticket data and integration boundaries", () => {
  it("stores a real report and its audit record", async () => {
    const { ticketId } = await report();
    const detail = await ticketDetail(student, ticketId);
    expect(detail.ticket.status).toBe("PENDING");
    expect(detail.activity.some((a) => a.event_code === "TICKET_CREATED")).toBe(
      true,
    );
  });
  it("keeps the full ticket number after the sequence passes 9999", async () => {
    await rows(
      sql`SELECT setval('ticket_number_seq',GREATEST((SELECT last_value FROM ticket_number_seq),10000))`,
    );
    const { ticketId } = await report();
    expect(Number(ticketId.split("-")[2])).toBeGreaterThan(10000);
    expect((await current(ticketId)).ticket_id).toBe(ticketId);
  });
  it("keeps offline retries idempotent, including simultaneous submissions", async () => {
    const key = randomUUID();
    const result = await Promise.all([
      report(student, { submissionKey: key }),
      report(student, { submissionKey: key }),
    ]);
    expect(result[0].ticketId).toBe(result[1].ticketId);
    expect(result.filter((r) => r.replayed)).toHaveLength(1);
  });
  it("does not disclose another user's idempotency result", async () => {
    const key = randomUUID();
    await report(student, { submissionKey: key });
    await expect(report(staff, { submissionKey: key })).rejects.toMatchObject({
      status: 409,
    });
  });
  it("blocks unrelated reporters and unassigned technicians", async () => {
    const { ticketId } = await report();
    await expect(ticketDetail(staff, ticketId)).rejects.toMatchObject({
      status: 403,
    });
    await expect(ticketDetail(tech, ticketId)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("limits reporter list queries to owned or followed reports", async () => {
    const { ticketId } = await report(staff);
    expect(
      (await listTickets(student, new URLSearchParams({ search: ticketId })))
        .tickets,
    ).toHaveLength(0);
  });
  it("finds recent duplicates and follows only after an explicit action", async () => {
    const { ticketId } = await report();
    const matches = await duplicateSuggestions(staff, categoryId, locationId);
    expect(matches.some((t) => t.ticket_id === ticketId)).toBe(true);
    await ticketAction(staff, ticketId, { action: "follow" });
    expect((await ticketDetail(staff, ticketId)).ticket.is_following).toBe(
      true,
    );
  });
  it("rejects inactive reference data", async () => {
    const id = randomUUID();
    await rows(
      sql`INSERT INTO locations(location_id,faculty_code,building_name,room_number,is_active) VALUES (${id}::uuid,'FENC','Test block',${id.slice(0, 8)},FALSE)`,
    );
    await expect(report(student, { locationId: id })).rejects.toThrow(
      "active category",
    );
  });
  it("rolls back the report if the photo is not owned or verified", async () => {
    const key = randomUUID();
    await expect(
      report(student, { submissionKey: key, attachmentId: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await one(sql`SELECT 1 FROM tickets WHERE submission_key=${key}::uuid`),
    ).toBeUndefined();
  });
  it("keeps photos private and links a validated image to the report", async () => {
    const file = new File([new Uint8Array(image)], "before.png", {
      type: "image/png",
    });
    const saved = await saveLocalPhoto(student, file, "BEFORE");
    const { ticketId } = await report(student, {
      attachmentId: saved!.attachment_id,
    });
    const detail = await ticketDetail(student, ticketId);
    expect(detail.attachments).toHaveLength(1);
    const row = await one<{ storage_key: string }>(
      sql`SELECT storage_key FROM attachments WHERE attachment_id=${saved!.attachment_id}::uuid`,
    );
    expect((await photoBytes(row!.storage_key)).length).toBeGreaterThan(20);
  });
});
describe("Dispatch and repair lifecycle", () => {
  for (const priority of ["P1_CRITICAL", "P2_URGENT", "P3_ROUTINE"])
    it(`dispatches with ${priority} and retains the original time`, async () => {
      const { ticketId } = await report();
      const before = await current(ticketId);
      await assign(ticketId, priority);
      const after = await current(ticketId);
      expect(new Date(after.created_at).getTime()).toBe(
        new Date(before.created_at).getTime(),
      );
      expect(
        new Date(after.sla_deadline).getTime() -
          new Date(after.created_at).getTime(),
      ).toBe(
        (priority === "P1_CRITICAL" ? 4 : priority === "P2_URGENT" ? 24 : 72) *
          3600000,
      );
    });
  it("rejects a technician with the wrong trade", async () => {
    const { ticketId } = await report();
    await expect(
      assign(ticketId, "P2_URGENT", plumber.user_id),
    ).rejects.toThrow("correct trade");
    expect((await current(ticketId)).status).toBe("PENDING");
  });
  it("keeps the report pending when no qualified technician is available", async () => {
    const c = await one<{ category_id: string }>(
      sql`SELECT category_id FROM categories WHERE trade_specialty='MASONRY_STRUCTURAL'`,
    );
    const { ticketId } = await report(student, { categoryId: c!.category_id });
    await assign(ticketId, "P1_CRITICAL", "auto");
    const t = await current(ticketId);
    expect(t.status).toBe("PENDING");
    expect(t.assigned_tech_id).toBeNull();
    expect(t.priority).toBe("P1_CRITICAL");
  });
  it("selects the least busy available technician from actual active jobs", async () => {
    const { ticketId } = await report();
    const expected = await one<{ tech_id: string }>(
      sql`SELECT p.tech_id FROM technicians p JOIN users u ON u.user_id=p.tech_id WHERE p.trade_specialty='ELECTRICAL' AND p.is_available AND u.is_active ORDER BY(SELECT COUNT(*) FROM tickets t WHERE t.assigned_tech_id=p.tech_id AND t.status IN('ASSIGNED','IN_PROGRESS')),p.tech_id LIMIT 1`,
    );
    await assign(ticketId, "P3_ROUTINE", "auto");
    expect((await current(ticketId)).assigned_tech_id).toBe(expected!.tech_id);
  });
  it("allows exactly one concurrent update from the same ticket version", async () => {
    const { ticketId } = await report();
    const t = await current(ticketId);
    const input = {
      action: "assign",
      version: t.version,
      priority: "P2_URGENT",
      technicianId: tech.user_id,
    };
    const results = await Promise.allSettled([
      ticketAction(dispatcher, ticketId, input),
      ticketAction(dispatcher, ticketId, input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("blocks a reporter from dispatching their own report", async () => {
    const { ticketId } = await report();
    await expect(
      ticketAction(student, ticketId, {
        action: "assign",
        version: 1,
        priority: "P1_CRITICAL",
        technicianId: "auto",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("completes, disputes, repairs again, and closes a report", async () => {
    const { ticketId } = await report();
    let t = await assign(ticketId);
    await ticketAction(tech, ticketId, { action: "start", version: t.version });
    t = await current(ticketId);
    await ticketAction(tech, ticketId, {
      action: "log",
      version: t.version,
      notes: "Checked fittings and tested the circuit.",
      parts: "One replacement lamp",
      laborMinutes: 25,
    });
    t = await current(ticketId);
    await expect(
      ticketAction(tech, ticketId, {
        action: "complete",
        version: t.version,
        notes: "Replaced lamp and tested it.",
        attachmentId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await current(ticketId)).status).toBe("IN_PROGRESS");
    const proof = await saveLocalPhoto(
      tech,
      new File([new Uint8Array(image)], "after.png", { type: "image/png" }),
      "AFTER",
    );
    await ticketAction(tech, ticketId, {
      action: "complete",
      version: t.version,
      notes: "Replaced lamp and tested it.",
      attachmentId: proof!.attachment_id,
    });
    t = await current(ticketId);
    expect(t.status).toBe("COMPLETED");
    await expect(
      ticketAction(plumber, ticketId, { action: "close", version: t.version }),
    ).rejects.toMatchObject({ status: 403 });
    await ticketAction(student, ticketId, {
      action: "dispute",
      version: t.version,
      reason: "The new light is still flickering.",
    });
    t = await current(ticketId);
    expect(t.status).toBe("IN_PROGRESS");
    const proof2 = await saveLocalPhoto(
      tech,
      new File([new Uint8Array(image)], "after-fixed.png", {
        type: "image/png",
      }),
      "AFTER",
    );
    await ticketAction(tech, ticketId, {
      action: "complete",
      version: t.version,
      notes: "Replaced the fitting and checked stability.",
      attachmentId: proof2!.attachment_id,
    });
    t = await current(ticketId);
    await ticketAction(student, ticketId, {
      action: "close",
      version: t.version,
    });
    expect((await current(ticketId)).status).toBe("CLOSED");
    const mismatch = await rows(
      sql`SELECT p.tech_id FROM technicians p WHERE p.active_workload<>(SELECT COUNT(*) FROM tickets t WHERE t.assigned_tech_id=p.tech_id AND t.status IN('ASSIGNED','IN_PROGRESS'))`,
    );
    expect(mismatch).toHaveLength(0);
  });
  it("merges duplicates and carries the reporter to the main ticket", async () => {
    const main = await report();
    const duplicate = await report(staff);
    await ticketAction(dispatcher, duplicate.ticketId, {
      action: "merge",
      version: 1,
      masterId: main.ticketId,
      reason: "The reports describe the same classroom fault.",
    });
    expect((await current(duplicate.ticketId)).status).toBe("DUPLICATE");
    expect((await ticketDetail(staff, main.ticketId)).ticket.is_following).toBe(
      true,
    );
  });
  it("prevents self-merges and merges between different categories", async () => {
    const a = await report();
    await expect(
      ticketAction(dispatcher, a.ticketId, {
        action: "merge",
        version: 1,
        masterId: a.ticketId,
        reason: "This should not be allowed.",
      }),
    ).rejects.toThrow("itself");
    const c = await one<{ category_id: string }>(
      sql`SELECT category_id FROM categories WHERE category_name='Plumbing'`,
    );
    const b = await report(student, { categoryId: c!.category_id });
    await expect(
      ticketAction(dispatcher, a.ticketId, {
        action: "merge",
        version: 1,
        masterId: b.ticketId,
        reason: "This should not be allowed.",
      }),
    ).rejects.toThrow("same location and category");
  });
  it("does not close an active, missing, or newly completed ticket automatically", async () => {
    const a = await report();
    expect(await autoCloseTicket(a.ticketId, 1)).toBe(false);
    expect(await autoCloseTicket("CF-2026-9999", 1)).toBe(false);
  });
});
describe("Notifications, auditing, and reports", () => {
  it("closes only an undisputed repair older than 72 hours with the matching version", async () => {
    const { ticketId } = await report();
    let t = await assign(ticketId);
    await ticketAction(tech, ticketId, { action: "start", version: t.version });
    t = await current(ticketId);
    const proof = await saveLocalPhoto(
      tech,
      new File([new Uint8Array(image)], "automatic-close.png", {
        type: "image/png",
      }),
      "AFTER",
    );
    await ticketAction(tech, ticketId, {
      action: "complete",
      version: t.version,
      notes: "Replaced the fitting and verified stable operation.",
      attachmentId: proof!.attachment_id,
    });
    t = await current(ticketId);
    expect(await autoCloseTicket(ticketId, t.version)).toBe(false);
    await rows(
      sql`UPDATE tickets SET created_at=NOW()-INTERVAL '80 hours',resolved_at=NOW()-INTERVAL '73 hours',sla_deadline=NOW()-INTERVAL '56 hours' WHERE ticket_id=${ticketId}`,
    );
    expect(await autoCloseTicket(ticketId, t.version + 1)).toBe(false);
    expect(await autoCloseTicket(ticketId, t.version)).toBe(true);
    expect((await current(ticketId)).status).toBe("CLOSED");
    expect(await autoCloseTicket(ticketId, t.version)).toBe(false);
  });
  it("rejects completion before work starts and rejects an unrelated technician", async () => {
    const { ticketId } = await report();
    const t = await assign(ticketId);
    await expect(
      ticketAction(tech, ticketId, {
        action: "complete",
        version: t.version,
        notes: "The repair has been completed.",
        attachmentId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      ticketAction(plumber, ticketId, { action: "start", version: t.version }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("records comments and prevents new comments after rejection", async () => {
    const { ticketId } = await report();
    await ticketAction(student, ticketId, {
      action: "comment",
      body: "The switch is beside the classroom door.",
    });
    expect((await ticketDetail(student, ticketId)).comments).toHaveLength(1);
    await ticketAction(dispatcher, ticketId, {
      action: "reject",
      version: 1,
      reason: "The report is outside this demonstration service.",
    });
    await expect(
      ticketAction(student, ticketId, {
        action: "comment",
        body: "Another message",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("revokes existing sessions when an account is deactivated", async () => {
    const suffix = randomUUID().slice(0, 8);
    const id = `SESSION${suffix}`;
    const made = await createUser(admin, {
      fullName: "Session Test",
      institutionalId: id,
      email: `session${suffix}@utech.edu.jm`,
      role: "STAFF",
      password: "ValidPassword2026!",
    });
    const token = await login({
      identifier: id,
      password: "ValidPassword2026!",
    });
    await updateUser(admin, { userId: made!.user_id, active: false });
    expect(await getUser(token)).toBeNull();
    await expect(
      login({ identifier: id, password: "ValidPassword2026!" }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("creates and updates category and location reference data", async () => {
    const suffix = randomUUID().slice(0, 8);
    await updateReference(admin, {
      kind: "category",
      name: `Test category ${suffix}`,
      trade: "ELECTRICAL",
      priority: "P2_URGENT",
      active: true,
    });
    const c = await one<{ category_id: string }>(
      sql`SELECT category_id FROM categories WHERE category_name=${`Test category ${suffix}`}`,
    );
    expect(c).toBeDefined();
    await updateReference(admin, {
      kind: "category",
      id: c!.category_id,
      name: `Test category ${suffix}`,
      trade: "ELECTRICAL",
      priority: "P3_ROUTINE",
      active: false,
    });
    await updateReference(admin, {
      kind: "location",
      faculty: "FENC",
      building: `Test building ${suffix}`,
      room: "Room 1",
      active: true,
    });
    const l = await one<{ location_id: string }>(
      sql`SELECT location_id FROM locations WHERE building_name=${`Test building ${suffix}`}`,
    );
    expect(l).toBeDefined();
    await updateReference(admin, {
      kind: "location",
      id: l!.location_id,
      faculty: "FENC",
      building: `Test building ${suffix}`,
      room: "Room 1",
      active: false,
    });
  });
  it("records test email and SMS delivery without changing the ticket", async () => {
    const { ticketId } = await report();
    await processTestDeliveries();
    const result = await rows(
      sql`SELECT d.status FROM notification_deliveries d JOIN notifications n ON n.notification_id=d.notification_id WHERE n.ticket_id=${ticketId}`,
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.status === "TEST_RECORDED")).toBe(true);
    expect((await current(ticketId)).status).toBe("PENDING");
  });
  it("keeps a failed notification pending for retry without losing the ticket", async () => {
    const { ticketId } = await report();
    await processTestDeliveries(true);
    const failed = await rows(
      sql`SELECT d.status,d.attempts,d.last_error FROM notification_deliveries d JOIN notifications n ON n.notification_id=d.notification_id WHERE n.ticket_id=${ticketId}`,
    );
    expect(failed.some((r) => r.status === "PENDING" && r.attempts === 1)).toBe(
      true,
    );
    await processTestDeliveries();
    expect((await current(ticketId)).status).toBe("PENDING");
  });
  it("makes audit records append-only", async () => {
    const row = await one<{ audit_id: string }>(
      sql`SELECT audit_id FROM audit_logs LIMIT 1`,
    );
    await expect(
      rows(
        sql`UPDATE audit_logs SET details='changed' WHERE audit_id=${row!.audit_id}::uuid`,
      ),
    ).rejects.toThrow();
  });
  it("blocks reporters from facilities reports", async () => {
    await expect(reports(student)).rejects.toMatchObject({ status: 403 });
  });
  it("calculates reports and exports real data", async () => {
    const result = await reports(admin);
    expect(result.summary?.total).toBeGreaterThan(0);
    const csv = await exportCsv(admin, new URLSearchParams());
    expect(csv).toContain('"ticket_id"');
    expect(csv).toContain("CF-2026-");
  });
  it("uses Jamaica calendar dates for report and CSV filters", async () => {
    const { ticketId } = await report();
    await rows(
      sql`UPDATE tickets SET created_at='2020-01-02T02:00:00Z',sla_deadline='2020-01-05T02:00:00Z' WHERE ticket_id=${ticketId}`,
    );
    const params = new URLSearchParams({
      from: "2020-01-01",
      to: "2020-01-01",
    });
    expect((await reports(admin, params)).summary?.total).toBe(1);
    expect(await exportCsv(admin, params)).toContain(ticketId);
    expect(
      (
        await reports(
          admin,
          new URLSearchParams({ from: "2020-01-02", to: "2020-01-02" }),
        )
      ).summary?.total,
    ).toBe(0);
  });
  it("prevents an administrator from deactivating their own account", async () => {
    await expect(
      updateUser(admin, { userId: admin.user_id, active: false }),
    ).rejects.toThrow("own account");
  });
});
