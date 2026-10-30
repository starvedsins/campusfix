import { hash } from "bcryptjs";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { closeDatabase, database, one, rows } from "../src/db";
import {
  slaDeadline,
  type Priority,
  type Role,
  type Trade,
} from "../src/lib/domain";
config({ path: ".env.local", quiet: true });

export async function seed() {
  const password = await hash(
    process.env.DEMO_PASSWORD ?? "CampusFix2026!",
    12,
  );
  await database().transaction(async (tx) => {
    if (
      (await one<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM users`,
        tx,
      ))!.count > 0
    ) {
      console.log("Seed skipped. Accounts already exist.");
      return;
    }
    const people: [string, string, string, Role, Trade?][] = [
      ["student", "Avery Campbell", "2601001", "STUDENT"],
      ["staff", "Jordan Reid", "STF1001", "STAFF"],
      ["technician", "Morgan Ellis", "TEC1001", "TECHNICIAN", "ELECTRICAL"],
      ["plumber", "Taylor Grant", "TEC1002", "TECHNICIAN", "PLUMBING"],
      [
        "hvac",
        "Casey Brooks",
        "TEC1003",
        "TECHNICIAN",
        "HVAC_AIR_CONDITIONING",
      ],
      ["carpenter", "Riley Clarke", "TEC1004", "TECHNICIAN", "CARPENTRY"],
      ["it", "Alex Bennett", "TEC1005", "TECHNICIAN", "IT_AUDIOVISUAL"],
      ["electrical2", "Sam Palmer", "TEC1006", "TECHNICIAN", "ELECTRICAL"],
      ["dispatcher", "Jamie Robinson", "FMD1001", "FMD_DISPATCHER"],
      ["admin", "Robin Williams", "ADM1001", "FMD_ADMIN"],
    ];
    const ids: Record<string, string> = {};
    for (const [alias, name, id, role, trade] of people) {
      ids[alias] = randomUUID();
      await rows(
        sql`INSERT INTO users(user_id,institutional_id,full_name,email,phone_number,password_hash,role,pref_sms) VALUES (${ids[alias]}::uuid,${id},${name},${alias + "@utech.edu.jm"},'',${password},${role},${role === "STUDENT"})`,
        tx,
      );
      if (trade)
        await rows(
          sql`INSERT INTO technicians(tech_id,trade_specialty) VALUES (${ids[alias]}::uuid,${trade})`,
          tx,
        );
    }
    const categories: [string, Trade][] = [
      ["Electrical", "ELECTRICAL"],
      ["Plumbing", "PLUMBING"],
      ["Air conditioning", "HVAC_AIR_CONDITIONING"],
      ["Furniture and fittings", "CARPENTRY"],
      ["Buildings and grounds", "MASONRY_STRUCTURAL"],
      ["IT and classroom equipment", "IT_AUDIOVISUAL"],
      ["Cleaning", "GENERAL_CLEANING"],
    ];
    const categoryIds: Record<string, string> = {};
    for (const [name, trade] of categories) {
      categoryIds[name] = randomUUID();
      await rows(
        sql`INSERT INTO categories(category_id,category_name,trade_specialty) VALUES (${categoryIds[name]}::uuid,${name},${trade})`,
        tx,
      );
    }
    const spaces: [string, string, string][] = [
      ["FENC", "SCIT Building 2B", "Computer Lab 3"],
      ["FENC", "SCIT Building 2B", "Lecture Room 2B-04"],
      ["FENC", "Engineering Workshop", "Workshop 1B"],
      ["FOBM", "Business School", "Lecture Room B-12"],
      ["CML", "Calvin McKain Library", "Study Area 2"],
      ["RES", "Hall A", "Common Room"],
      ["FOSS", "Science Block", "Lab S-03"],
      ["COHS", "Health Sciences Building", "Room H-05"],
      ["FENC", "SCIT Building 2B", "Ground Floor Restroom"],
      ["CML", "Calvin McKain Library", "Main Entrance"],
    ];
    const locationIds: string[] = [];
    for (const [faculty, building, room] of spaces) {
      const id = randomUUID();
      locationIds.push(id);
      await rows(
        sql`INSERT INTO locations(location_id,faculty_code,building_name,room_number) VALUES (${id}::uuid,${faculty},${building},${room})`,
        tx,
      );
    }
    const tickets: [
      string,
      string,
      number,
      Priority,
      string,
      string | null,
      number,
    ][] = [
      [
        "Flickering lights in Computer Lab 3",
        "Electrical",
        0,
        "P2_URGENT",
        "IN_PROGRESS",
        "technician",
        3,
      ],
      [
        "Water leak under the restroom sink",
        "Plumbing",
        8,
        "P2_URGENT",
        "ASSIGNED",
        "plumber",
        5,
      ],
      [
        "Projector has no display signal",
        "IT and classroom equipment",
        1,
        "P3_ROUTINE",
        "PENDING",
        null,
        1,
      ],
      [
        "Exposed cable near workshop entrance",
        "Electrical",
        2,
        "P1_CRITICAL",
        "PENDING",
        null,
        0.5,
      ],
      [
        "Air conditioner is not cooling",
        "Air conditioning",
        3,
        "P2_URGENT",
        "ASSIGNED",
        "hvac",
        8,
      ],
      [
        "Loose legs on a study table",
        "Furniture and fittings",
        4,
        "P3_ROUTINE",
        "IN_PROGRESS",
        "carpenter",
        28,
      ],
      [
        "Water tap will not turn off",
        "Plumbing",
        5,
        "P2_URGENT",
        "PENDING",
        null,
        26,
      ],
      [
        "Broken chair in the science lab",
        "Furniture and fittings",
        6,
        "P3_ROUTINE",
        "PENDING",
        null,
        4,
      ],
      [
        "Ceiling light has stopped working",
        "Electrical",
        7,
        "P3_ROUTINE",
        "ASSIGNED",
        "electrical2",
        20,
      ],
      [
        "Entrance step needs repair",
        "Buildings and grounds",
        9,
        "P3_ROUTINE",
        "PENDING",
        null,
        76,
      ],
      [
        "Classroom floor needs cleaning",
        "Cleaning",
        1,
        "P3_ROUTINE",
        "PENDING",
        null,
        2,
      ],
      [
        "Library outlet has a damaged cover",
        "Electrical",
        4,
        "P2_URGENT",
        "IN_PROGRESS",
        "technician",
        12,
      ],
    ];
    for (let i = 0; i < tickets.length; i++) {
      const [title, category, loc, priority, status, tech, hours] = tickets[i];
      const id = `CF-2026-${1041 + i}`;
      const created = new Date(Date.now() - hours * 3600000);
      await rows(
        sql`INSERT INTO tickets(ticket_id,reporter_id,category_id,location_id,title,description,priority,status,assigned_tech_id,reporter_urgency,created_at,assigned_at,sla_deadline) VALUES (${id},${i % 3 === 1 ? ids.staff : ids.student}::uuid,${categoryIds[category]}::uuid,${locationIds[loc]}::uuid,${title},${title + ". Please inspect this area and arrange a repair. This is a demonstration report."},${priority},${status},${tech ? ids[tech] : null}::uuid,${priority === "P1_CRITICAL" ? "HIGH" : priority === "P2_URGENT" ? "MEDIUM" : "LOW"},${created},${tech ? new Date(created.getTime() + 10 * 60000) : null},${slaDeadline(created, priority)})`,
        tx,
      );
      await rows(
        sql`INSERT INTO audit_logs(actor_id,event_code,ticket_id,details,created_at) VALUES (${i % 3 === 1 ? ids.staff : ids.student}::uuid,'TICKET_CREATED',${id},'Demonstration report received.',${created})`,
        tx,
      );
      if (tech)
        await rows(
          sql`INSERT INTO audit_logs(actor_id,event_code,ticket_id,details,created_at) VALUES (${ids.dispatcher}::uuid,'TICKET_ASSIGNED',${id},'Assigned to a qualified technician.',${new Date(created.getTime() + 10 * 60000)})`,
          tx,
        );
      if (status === "IN_PROGRESS")
        await rows(
          sql`INSERT INTO audit_logs(actor_id,event_code,ticket_id,details,created_at) VALUES (${ids[tech!]}::uuid,'WORK_STARTED',${id},'The technician started work on this repair.',${new Date(created.getTime() + 20 * 60000)})`,
          tx,
        );
    }
    await rows(sql`SELECT setval('ticket_number_seq',1052)`, tx);
    await rows(
      sql`UPDATE technicians p SET active_workload=(SELECT COUNT(*) FROM tickets t WHERE t.assigned_tech_id=p.tech_id AND t.status IN ('ASSIGNED','IN_PROGRESS'))`,
      tx,
    );
    await rows(
      sql`INSERT INTO notifications(user_id,ticket_id,event_code,title,body) VALUES (${ids.student}::uuid,'CF-2026-1041','WORK_STARTED','Work has started','Morgan Ellis is checking the lights in Computer Lab 3.')`,
      tx,
    );
    console.log(
      "Demo data created. See README.md for the demo sign-in details.",
    );
  });
}
if (process.argv[1]?.endsWith("seed.ts")) {
  await seed();
  await closeDatabase();
}
