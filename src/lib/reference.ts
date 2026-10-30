import { database, one, rows } from "@/db";
import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { PRIORITIES, ROLES, TRADES, isManager, type User } from "./domain";
import { assert } from "./errors";
import { audit } from "./tickets";

export async function referenceData(user: User) {
  const manager = isManager(user.role);
  const [categories, locations, technicians] = await Promise.all([
    rows(
      sql`SELECT * FROM categories WHERE is_active OR ${manager} ORDER BY category_name`,
    ),
    rows(
      sql`SELECT * FROM locations WHERE is_active OR ${manager} ORDER BY faculty_code,building_name,room_number`,
    ),
    rows(
      sql`SELECT p.tech_id,u.full_name,p.trade_specialty,p.active_workload,p.is_available,u.is_active FROM technicians p JOIN users u ON u.user_id=p.tech_id WHERE ${manager} OR p.tech_id=${user.user_id}::uuid ORDER BY u.full_name`,
    ),
  ]);
  return {
    categories,
    locations,
    technicians,
    storageDriver: process.env.STORAGE_DRIVER ?? "local",
    demoMode: process.env.DEMO_MODE === "true",
  };
}
export async function listUsers(user: User) {
  assert(
    user.role === "FMD_ADMIN",
    "Only administrators can manage accounts.",
    403,
  );
  return rows(
    sql`SELECT u.user_id,u.institutional_id,u.full_name,u.email,u.role,u.is_active,u.locked_until,p.trade_specialty,p.is_available,p.active_workload FROM users u LEFT JOIN technicians p ON p.tech_id=u.user_id ORDER BY u.full_name`,
  );
}
const newUser = z.object({
  fullName: z.string().trim().min(2).max(120),
  institutionalId: z.string().trim().min(3).max(20),
  email: z
    .email()
    .regex(
      /@(utech\.edu\.jm|utechstudents\.edu\.jm)$/i,
      "Use an institutional email address.",
    ),
  role: z.enum(ROLES),
  password: z.string().min(12).max(72),
  trade: z.enum(TRADES).optional(),
});
export async function createUser(actor: User, input: unknown) {
  assert(
    actor.role === "FMD_ADMIN",
    "Only administrators can create accounts.",
    403,
  );
  const data = newUser.parse(input);
  assert(
    data.role !== "TECHNICIAN" || data.trade,
    "Select a technician trade.",
  );
  const passwordHash = await hash(data.password, 12);
  return database().transaction(async (tx) => {
    const created = await one<{ user_id: string }>(
      sql`INSERT INTO users(institutional_id,full_name,email,phone_number,password_hash,role) VALUES (${data.institutionalId},${data.fullName},${data.email.toLowerCase()},'',${passwordHash},${data.role}) RETURNING user_id`,
      tx,
    );
    if (data.role === "TECHNICIAN")
      await rows(
        sql`INSERT INTO technicians(tech_id,trade_specialty) VALUES (${created!.user_id}::uuid,${data.trade!})`,
        tx,
      );
    await audit(
      actor.user_id,
      "USER_CREATED",
      null,
      `Created ${data.role} account ${data.institutionalId}.`,
      tx,
    );
    return created;
  });
}
export async function updateUser(actor: User, input: unknown) {
  assert(
    actor.role === "FMD_ADMIN",
    "Only administrators can manage accounts.",
    403,
  );
  const data = z
    .object({
      userId: z.uuid(),
      active: z.boolean().optional(),
      available: z.boolean().optional(),
      unlock: z.boolean().optional(),
    })
    .parse(input);
  assert(
    data.userId !== actor.user_id || data.active !== false,
    "You cannot deactivate your own account.",
  );
  await database().transaction(async (tx) => {
    const target = await one(
      sql`SELECT user_id FROM users WHERE user_id=${data.userId}::uuid FOR UPDATE`,
      tx,
    );
    assert(target, "This account was not found.", 404);
    if (data.active === false) {
      const jobs = await one<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM tickets WHERE assigned_tech_id=${data.userId}::uuid AND status IN ('ASSIGNED','IN_PROGRESS')`,
        tx,
      );
      assert(
        !jobs?.count,
        "Reassign this technician's active jobs before deactivating the account.",
        409,
      );
      await rows(
        sql`DELETE FROM sessions WHERE user_id=${data.userId}::uuid`,
        tx,
      );
    }
    if (data.active !== undefined)
      await rows(
        sql`UPDATE users SET is_active=${data.active},updated_at=NOW() WHERE user_id=${data.userId}::uuid`,
        tx,
      );
    if (data.available !== undefined)
      await rows(
        sql`UPDATE technicians SET is_available=${data.available} WHERE tech_id=${data.userId}::uuid`,
        tx,
      );
    if (data.unlock)
      await rows(
        sql`UPDATE users SET is_locked=FALSE,locked_until=NULL,failed_attempts=0 WHERE user_id=${data.userId}::uuid`,
        tx,
      );
    await audit(
      actor.user_id,
      "USER_UPDATED",
      null,
      `Updated account ${data.userId}.`,
      tx,
    );
  });
  return { ok: true };
}
export async function updateReference(actor: User, input: unknown) {
  assert(
    actor.role === "FMD_ADMIN",
    "Only administrators can manage reference data.",
    403,
  );
  const data = z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("category"),
        id: z.uuid().optional(),
        name: z.string().trim().min(2).max(60),
        trade: z.enum(TRADES),
        priority: z.enum(PRIORITIES),
        active: z.boolean(),
      }),
      z.object({
        kind: z.literal("location"),
        id: z.uuid().optional(),
        faculty: z.enum(["FENC", "FOBM", "FOSS", "COHS", "CML", "RES"]),
        building: z.string().trim().min(2).max(80),
        room: z.string().trim().min(1).max(30),
        active: z.boolean(),
      }),
    ])
    .parse(input);
  await database().transaction(async (tx) => {
    if (data.kind === "category") {
      if (data.id)
        await rows(
          sql`UPDATE categories SET category_name=${data.name},trade_specialty=${data.trade},default_priority=${data.priority},default_sla_hours=${data.priority === "P1_CRITICAL" ? 4 : data.priority === "P2_URGENT" ? 24 : 72},is_active=${data.active} WHERE category_id=${data.id}::uuid`,
          tx,
        );
      else
        await rows(
          sql`INSERT INTO categories(category_name,trade_specialty,default_priority,default_sla_hours,is_active) VALUES (${data.name},${data.trade},${data.priority},${data.priority === "P1_CRITICAL" ? 4 : data.priority === "P2_URGENT" ? 24 : 72},${data.active})`,
          tx,
        );
    } else {
      if (data.id)
        await rows(
          sql`UPDATE locations SET faculty_code=${data.faculty},building_name=${data.building},room_number=${data.room},is_active=${data.active} WHERE location_id=${data.id}::uuid`,
          tx,
        );
      else
        await rows(
          sql`INSERT INTO locations(faculty_code,building_name,room_number,is_active) VALUES (${data.faculty},${data.building},${data.room},${data.active})`,
          tx,
        );
    }
    await audit(
      actor.user_id,
      "REFERENCE_UPDATED",
      null,
      `Updated ${data.kind} reference data.`,
      tx,
    );
  });
  return { ok: true };
}
