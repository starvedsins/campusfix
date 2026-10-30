import { one, rows } from "@/db";
import { sql } from "drizzle-orm";
import { type User, isManager } from "./domain";
import { assert } from "./errors";
import { accessWhere, ticketSelect } from "./tickets";

export async function dashboard(user: User) {
  const where = accessWhere(user);
  const counts = await one(
    sql`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE t.status IN ('PENDING','ASSIGNED','IN_PROGRESS'))::int AS active,COUNT(*) FILTER(WHERE t.status='PENDING')::int AS pending,COUNT(*) FILTER(WHERE t.status IN ('COMPLETED','CLOSED'))::int AS completed,COUNT(*) FILTER(WHERE t.status IN ('PENDING','ASSIGNED','IN_PROGRESS') AND t.sla_deadline<NOW())::int AS overdue,COUNT(*) FILTER(WHERE t.priority='P1_CRITICAL' AND t.status IN ('PENDING','ASSIGNED','IN_PROGRESS'))::int AS critical FROM tickets t WHERE ${where}`,
  );
  const recent = await rows(
    sql`${ticketSelect} WHERE ${where} ORDER BY t.created_at DESC LIMIT 5`,
  );
  const activity = await rows(
    sql`SELECT a.audit_id,a.event_code,a.details,a.ticket_id,a.created_at,u.full_name FROM audit_logs a JOIN tickets t ON t.ticket_id=a.ticket_id LEFT JOIN users u ON u.user_id=a.actor_id WHERE ${where} ORDER BY a.created_at DESC LIMIT 6`,
  );
  const categories = await rows(
    sql`SELECT c.category_name,COUNT(*)::int AS count FROM tickets t JOIN categories c ON c.category_id=t.category_id WHERE ${where} AND t.status IN ('PENDING','ASSIGNED','IN_PROGRESS') GROUP BY c.category_name ORDER BY count DESC`,
  );
  const unread = user.pref_in_app
    ? await one<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id=${user.user_id}::uuid AND read_at IS NULL`,
      )
    : { count: 0 };
  return { counts, recent, activity, categories, unread: unread?.count ?? 0 };
}
export async function reports(
  user: User,
  params: URLSearchParams = new URLSearchParams(),
) {
  assert(
    isManager(user.role),
    "Only facilities staff can view these reports.",
    403,
  );
  const conditions = [sql`t.status NOT IN ('DUPLICATE','REJECTED')`];
  if (params.get("faculty"))
    conditions.push(sql`l.faculty_code=${params.get("faculty")}`);
  for (const key of ["from", "to"])
    if (params.get(key)) {
      assert(
        /^\d{4}-\d{2}-\d{2}$/.test(params.get(key)!),
        "Use a valid report date.",
      );
      conditions.push(
        key === "from"
          ? sql`t.created_at>=(${params.get(key)}::date::timestamp AT TIME ZONE 'America/Jamaica')`
          : sql`t.created_at<((${params.get(key)}::date+1)::timestamp AT TIME ZONE 'America/Jamaica')`,
      );
    }
  const where = sql.join(conditions, sql` AND `);
  const summary = await one(
    sql`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE t.status IN ('PENDING','ASSIGNED','IN_PROGRESS'))::int AS active,COUNT(*) FILTER(WHERE t.status IN ('COMPLETED','CLOSED'))::int AS completed,ROUND(AVG(EXTRACT(EPOCH FROM(t.resolved_at-t.created_at))/3600) FILTER(WHERE t.status IN ('COMPLETED','CLOSED'))::numeric,1) AS mttr_hours,ROUND(100.0*COUNT(*) FILTER(WHERE t.status IN ('COMPLETED','CLOSED') AND t.resolved_at<=t.sla_deadline)/NULLIF(COUNT(*) FILTER(WHERE t.status IN ('COMPLETED','CLOSED')),0),1) AS sla_percent FROM tickets t JOIN locations l ON l.location_id=t.location_id WHERE ${where}`,
  );
  const faculties = await rows(
    sql`SELECT l.faculty_code,COUNT(*)::int AS total,COUNT(*) FILTER(WHERE t.status IN ('COMPLETED','CLOSED'))::int AS completed,COUNT(*) FILTER(WHERE t.status IN ('PENDING','ASSIGNED','IN_PROGRESS') AND t.sla_deadline<NOW())::int AS overdue,ROUND(AVG(EXTRACT(EPOCH FROM(t.resolved_at-t.created_at))/3600) FILTER(WHERE t.status IN ('COMPLETED','CLOSED'))::numeric,1) AS mttr_hours FROM tickets t JOIN locations l ON l.location_id=t.location_id WHERE ${where} GROUP BY l.faculty_code ORDER BY total DESC`,
  );
  const buildings = await rows(
    sql`SELECT l.building_name,c.category_name,COUNT(*)::int AS count FROM tickets t JOIN locations l ON l.location_id=t.location_id JOIN categories c ON c.category_id=t.category_id WHERE ${where} GROUP BY l.building_name,c.category_name ORDER BY count DESC LIMIT 10`,
  );
  const technicians = await rows(
    sql`SELECT u.full_name,COUNT(*)::int AS completed,ROUND(AVG(EXTRACT(EPOCH FROM(t.resolved_at-t.created_at))/3600)::numeric,1) AS mttr_hours FROM tickets t JOIN locations l ON l.location_id=t.location_id JOIN users u ON u.user_id=t.assigned_tech_id WHERE ${where} AND t.status IN ('COMPLETED','CLOSED') GROUP BY u.full_name ORDER BY completed DESC`,
  );
  return { summary, faculties, buildings, technicians };
}
export function csvCell(value: unknown) {
  let text = "";
  if (value != null) text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function exportCsv(user: User, params: URLSearchParams) {
  await reports(user, params);
  const conditions = [sql`TRUE`];
  if (params.get("faculty"))
    conditions.push(sql`l.faculty_code=${params.get("faculty")}`);
  if (params.get("from"))
    conditions.push(
      sql`t.created_at>=(${params.get("from")}::date::timestamp AT TIME ZONE 'America/Jamaica')`,
    );
  if (params.get("to"))
    conditions.push(
      sql`t.created_at<((${params.get("to")}::date+1)::timestamp AT TIME ZONE 'America/Jamaica')`,
    );
  const data = await rows(
    sql`${ticketSelect} WHERE ${sql.join(conditions, sql` AND `)} ORDER BY t.created_at DESC LIMIT 10000`,
  );
  const columns = [
    "ticket_id",
    "title",
    "category_name",
    "faculty_code",
    "building_name",
    "room_number",
    "priority",
    "status",
    "technician_name",
    "created_at",
    "sla_deadline",
    "resolved_at",
  ];
  return [
    columns.map(csvCell).join(","),
    ...data.map((row) =>
      columns
        .map((key) =>
          csvCell(
            row[key] instanceof Date
              ? (row[key] as Date).toISOString()
              : row[key],
          ),
        )
        .join(","),
    ),
  ].join("\r\n");
}
