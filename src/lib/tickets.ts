import { database, one, rows, type Executor } from "@/db";
import { sql, type SQL } from "drizzle-orm";
import {
  actionInput,
  ACTIVE_STATUSES,
  canReadTicket,
  isManager,
  isReporter,
  slaDeadline,
  ticketInput,
  type Priority,
  type Ticket,
  type TicketDetail,
  type User,
} from "./domain";
import { AppError, assert } from "./errors";
import { notifyTicket } from "./notifications";
import { completionDecision } from "./policies";

export const ticketSelect = sql`SELECT t.*,c.category_name,l.faculty_code,l.building_name,l.room_number,r.full_name AS reporter_name,u.full_name AS technician_name
 FROM tickets t JOIN categories c ON c.category_id=t.category_id JOIN locations l ON l.location_id=t.location_id JOIN users r ON r.user_id=t.reporter_id LEFT JOIN users u ON u.user_id=t.assigned_tech_id`;
export function accessWhere(user: User): SQL {
  if (isManager(user.role)) return sql`TRUE`;
  if (user.role === "TECHNICIAN")
    return sql`t.assigned_tech_id=${user.user_id}::uuid`;
  return sql`(t.reporter_id=${user.user_id}::uuid OR EXISTS(SELECT 1 FROM ticket_subscribers s WHERE s.ticket_id=t.ticket_id AND s.user_id=${user.user_id}::uuid))`;
}
export async function audit(
  userId: string | null,
  event: string,
  ticketId: string | null,
  details: string,
  tx: Executor = database(),
) {
  await rows(
    sql`INSERT INTO audit_logs(actor_id,event_code,ticket_id,details) VALUES (${userId}::uuid,${event},${ticketId},${details})`,
    tx,
  );
}
export async function listTickets(
  user: User,
  params: URLSearchParams = new URLSearchParams(),
) {
  const conditions: SQL[] = [accessWhere(user)];
  const search = params.get("search")?.trim().slice(0, 150);
  if (search)
    conditions.push(
      sql`(t.ticket_id ILIKE ${`%${search}%`} OR t.title ILIKE ${`%${search}%`} OR l.building_name ILIKE ${`%${search}%`})`,
    );
  if (params.get("status"))
    conditions.push(sql`t.status::text=${params.get("status")}`);
  if (params.get("priority"))
    conditions.push(sql`t.priority::text=${params.get("priority")}`);
  if (params.get("faculty"))
    conditions.push(sql`l.faculty_code=${params.get("faculty")}`);
  if (params.get("category"))
    conditions.push(sql`t.category_id::text=${params.get("category")}`);
  if (params.get("technician"))
    conditions.push(sql`t.assigned_tech_id::text=${params.get("technician")}`);
  if (params.get("from") && /^\d{4}-\d{2}-\d{2}$/.test(params.get("from")!))
    conditions.push(sql`t.created_at>=${params.get("from")}::date`);
  if (params.get("to") && /^\d{4}-\d{2}-\d{2}$/.test(params.get("to")!))
    conditions.push(
      sql`t.created_at<${params.get("to")}::date+INTERVAL '1 day'`,
    );
  if (params.get("overdue") === "true")
    conditions.push(
      sql`t.sla_deadline<NOW() AND t.status IN ('PENDING','ASSIGNED','IN_PROGRESS')`,
    );
  const where = sql.join(conditions, sql` AND `);
  const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
  const pageSize = 25;
  const tickets = await rows<Ticket>(
    sql`${ticketSelect} WHERE ${where} ORDER BY CASE t.priority WHEN 'P1_CRITICAL' THEN 1 WHEN 'P2_URGENT' THEN 2 ELSE 3 END,t.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  );
  const count = await one<{ total: number }>(
    sql`SELECT COUNT(*)::int AS total FROM tickets t JOIN locations l ON l.location_id=t.location_id WHERE ${where}`,
  );
  return { tickets, total: count?.total ?? 0, page, pageSize };
}
export async function ticketDetail(
  user: User,
  ticketId: string,
): Promise<TicketDetail> {
  const ticket = await one<Ticket>(
    sql`${ticketSelect} WHERE t.ticket_id=${ticketId}`,
  );
  assert(ticket, "This ticket was not found.", 404);
  const subscription = await one(
    sql`SELECT 1 FROM ticket_subscribers WHERE ticket_id=${ticketId} AND user_id=${user.user_id}::uuid`,
  );
  assert(
    canReadTicket(user, ticket, !!subscription),
    "You cannot view this ticket.",
    403,
  );
  const [comments, activity, logs, attachments] = await Promise.all([
    rows<TicketDetail["comments"][number]>(
      sql`SELECT c.comment_id,c.body,c.created_at,u.full_name FROM ticket_comments c JOIN users u ON u.user_id=c.author_id WHERE c.ticket_id=${ticketId} ORDER BY c.created_at`,
    ),
    rows<TicketDetail["activity"][number]>(
      sql`SELECT a.audit_id,a.event_code,a.details,a.created_at,u.full_name FROM audit_logs a LEFT JOIN users u ON u.user_id=a.actor_id WHERE a.ticket_id=${ticketId} ORDER BY a.created_at DESC`,
    ),
    rows<TicketDetail["logs"][number]>(
      sql`SELECT w.*,u.full_name FROM work_order_logs w JOIN users u ON u.user_id=w.tech_id WHERE w.ticket_id=${ticketId} ORDER BY w.logged_at DESC`,
    ),
    rows<TicketDetail["attachments"][number]>(
      sql`SELECT attachment_id,phase,original_name,content_type,byte_size FROM attachments WHERE ticket_id=${ticketId} AND verified ORDER BY phase DESC,created_at`,
    ),
  ]);
  return {
    ticket: { ...ticket, is_following: !!subscription },
    comments,
    activity,
    logs,
    attachments,
  };
}
export async function duplicateSuggestions(
  user: User,
  categoryId: string,
  locationId: string,
) {
  assert(
    isReporter(user.role) || isManager(user.role),
    "You cannot search for duplicate reports.",
    403,
  );
  // Return limited details until the reporter chooses to follow a matching report.
  return rows(
    sql`SELECT ticket_id,title,status,created_at FROM tickets WHERE category_id::text=${categoryId} AND location_id::text=${locationId} AND status IN ('PENDING','ASSIGNED','IN_PROGRESS') AND created_at>=NOW()-INTERVAL '12 hours' ORDER BY created_at DESC LIMIT 5`,
  );
}
export async function claimAttachment(
  id: string,
  user: User,
  ticketId: string,
  phase: "BEFORE" | "AFTER",
  tx: Executor,
) {
  const attachment = await one<{ storage_key: string }>(
    sql`UPDATE attachments SET ticket_id=${ticketId} WHERE attachment_id=${id}::uuid AND owner_id=${user.user_id}::uuid AND phase=${phase} AND verified AND ticket_id IS NULL RETURNING storage_key`,
    tx,
  );
  assert(
    attachment,
    "The photo is missing, was not checked, or is already attached.",
    409,
  );
  return attachment.storage_key;
}
export async function createTicket(user: User, input: unknown) {
  assert(
    isReporter(user.role),
    "Only students and staff can submit reports.",
    403,
  );
  const data = ticketInput.parse(input);
  return database().transaction(async (tx) => {
    // Lock a submission key before checking it. This also covers simultaneous offline retries.
    await rows(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${data.submissionKey},0))`,
      tx,
    );
    const existing = await one<{ ticket_id: string; reporter_id: string }>(
      sql`SELECT ticket_id,reporter_id FROM tickets WHERE submission_key=${data.submissionKey}::uuid`,
      tx,
    );
    if (existing) {
      assert(
        existing.reporter_id === user.user_id,
        "This submission key is already in use.",
        409,
      );
      return { ticketId: existing.ticket_id, replayed: true };
    }
    const category = await one<{ default_priority: Priority }>(
      sql`SELECT default_priority FROM categories WHERE category_id=${data.categoryId}::uuid AND is_active`,
      tx,
    );
    const location = await one(
      sql`SELECT 1 FROM locations WHERE location_id=${data.locationId}::uuid AND is_active`,
      tx,
    );
    assert(
      category && location,
      "Select an active category and campus location.",
    );
    const generated = await one<{ ticket_id: string; now: Date }>(
      sql`SELECT 'CF-'||TO_CHAR(NOW() AT TIME ZONE 'America/Jamaica','YYYY')||'-'||nextval('ticket_number_seq')::text AS ticket_id,NOW() AS now`,
      tx,
    );
    const id = generated!.ticket_id;
    await rows(
      sql`INSERT INTO tickets(ticket_id,reporter_id,category_id,location_id,title,description,priority,reporter_urgency,submission_key,created_at,sla_deadline)
      VALUES (${id},${user.user_id}::uuid,${data.categoryId}::uuid,${data.locationId}::uuid,${data.title},${data.description},${category.default_priority},${data.urgency},${data.submissionKey}::uuid,${generated!.now},${slaDeadline(generated!.now, category.default_priority)})`,
      tx,
    );
    if (data.attachmentId) {
      const key = await claimAttachment(
        data.attachmentId,
        user,
        id,
        "BEFORE",
        tx,
      );
      await rows(
        sql`UPDATE tickets SET before_photo_uri=${key} WHERE ticket_id=${id}`,
        tx,
      );
    }
    await audit(
      user.user_id,
      "TICKET_CREATED",
      id,
      "Report received. Awaiting facilities review.",
      tx,
    );
    await notifyTicket(
      id,
      "TICKET_CREATED",
      "Your report is recorded",
      `${id}: ${data.title}`,
      tx,
    );
    return { ticketId: id, replayed: false };
  });
}
async function recountWorkload(techId: string | null, tx: Executor) {
  if (techId) {
    await rows(
      sql`SELECT tech_id FROM technicians WHERE tech_id=${techId}::uuid FOR UPDATE`,
      tx,
    );
    await rows(
      sql`UPDATE technicians SET active_workload=(SELECT COUNT(*)::int FROM tickets WHERE assigned_tech_id=${techId}::uuid AND status IN ('ASSIGNED','IN_PROGRESS')) WHERE tech_id=${techId}::uuid`,
      tx,
    );
  }
}
export async function ticketAction(
  user: User,
  ticketId: string,
  input: unknown,
) {
  const data = actionInput.parse(input);
  return database().transaction(async (tx) => {
    if (data.action === "merge")
      await rows(sql`SELECT pg_advisory_xact_lock(8024002)`, tx);
    // Serialize all changes to one ticket and verify the version shown to the user.
    const ticket = await one<Ticket>(
      sql`SELECT * FROM tickets WHERE ticket_id=${ticketId} FOR UPDATE`,
      tx,
    );
    assert(ticket, "This ticket was not found.", 404);
    const follows = await one(
      sql`SELECT 1 FROM ticket_subscribers WHERE ticket_id=${ticketId} AND user_id=${user.user_id}::uuid`,
      tx,
    );
    if (data.action === "follow") {
      assert(isReporter(user.role), "Only reporters can follow a report.", 403);
      assert(
        ACTIVE_STATUSES.includes(ticket.status) &&
          new Date(ticket.created_at).getTime() >= Date.now() - 12 * 3600000,
        "This report is no longer available to follow.",
        409,
      );
      await rows(
        sql`INSERT INTO ticket_subscribers(ticket_id,user_id) VALUES (${ticketId},${user.user_id}::uuid) ON CONFLICT DO NOTHING`,
        tx,
      );
      await audit(
        user.user_id,
        "TICKET_FOLLOWED",
        ticketId,
        "Reporter chose to follow this active report.",
        tx,
      );
      return { ticketId };
    }
    assert(
      canReadTicket(user, ticket, !!follows),
      "You cannot change this ticket.",
      403,
    );
    if (data.action === "comment") {
      assert(
        !["CLOSED", "DUPLICATE", "REJECTED"].includes(ticket.status),
        "Comments are closed for this ticket.",
        409,
      );
      await rows(
        sql`INSERT INTO ticket_comments(ticket_id,author_id,body) VALUES (${ticketId},${user.user_id}::uuid,${data.body})`,
        tx,
      );
      await audit(
        user.user_id,
        "COMMENT_ADDED",
        ticketId,
        "A comment was added.",
        tx,
      );
      await notifyTicket(
        ticketId,
        "COMMENT_ADDED",
        "New ticket comment",
        `${user.full_name}: ${data.body}`,
        tx,
        ticket.assigned_tech_id ?? undefined,
      );
      return { ticketId };
    }
    assert(
      data.version === ticket.version,
      "This ticket has changed. Refresh it and try again.",
      409,
    );
    let message = "";
    let event = "TICKET_UPDATED";
    switch (data.action) {
      case "assign": {
        assert(
          isManager(user.role),
          "Only facilities staff can assign jobs.",
          403,
        );
        assert(
          ACTIVE_STATUSES.includes(ticket.status),
          "This ticket cannot be assigned in its current state.",
          409,
        );
        const category = await one<{ trade_specialty: string }>(
          sql`SELECT trade_specialty FROM categories WHERE category_id=${ticket.category_id}::uuid`,
          tx,
        );
        // One lock per trade prevents two concurrent dispatches choosing from stale workloads.
        await rows(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${category!.trade_specialty},1))`,
          tx,
        );
        let tech: { tech_id: string; full_name: string } | undefined;
        if (data.technicianId === "auto") {
          tech = await one(
            sql`SELECT p.tech_id,u.full_name FROM technicians p JOIN users u ON u.user_id=p.tech_id WHERE p.trade_specialty=${category!.trade_specialty} AND p.is_available AND u.is_active ORDER BY (SELECT COUNT(*) FROM tickets w WHERE w.assigned_tech_id=p.tech_id AND w.status IN ('ASSIGNED','IN_PROGRESS')),p.tech_id LIMIT 1 FOR UPDATE OF p`,
            tx,
          );
        } else {
          tech = await one(
            sql`SELECT p.tech_id,u.full_name FROM technicians p JOIN users u ON u.user_id=p.tech_id WHERE p.tech_id=${data.technicianId}::uuid AND p.trade_specialty=${category!.trade_specialty} AND p.is_available AND u.is_active FOR UPDATE OF p`,
            tx,
          );
          assert(
            tech,
            "Select an available technician with the correct trade.",
          );
        }
        const deadline = slaDeadline(ticket.created_at, data.priority);
        await rows(
          sql`UPDATE tickets SET priority=${data.priority},assigned_tech_id=${tech?.tech_id ?? null}::uuid,status=${tech ? "ASSIGNED" : "PENDING"},assigned_at=${tech ? new Date() : null},sla_deadline=${deadline},version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        await recountWorkload(ticket.assigned_tech_id, tx);
        await recountWorkload(tech?.tech_id ?? null, tx);
        event = tech ? "TICKET_ASSIGNED" : "TICKET_UNASSIGNED";
        message = tech
          ? `Assigned to ${tech.full_name}. The deadline is based on the original report time.`
          : "No qualified technician is available. The report remains pending.";
        await notifyTicket(
          ticketId,
          event,
          tech ? "A technician is assigned" : "Facilities review recorded",
          message,
          tx,
          tech?.tech_id,
        );
        break;
      }
      case "start":
        assert(
          user.role === "TECHNICIAN" &&
            ticket.assigned_tech_id === user.user_id,
          "Only the assigned technician can start this job.",
          403,
        );
        assert(
          ticket.status === "ASSIGNED",
          "This job must be assigned before work starts.",
          409,
        );
        await rows(
          sql`UPDATE tickets SET status='IN_PROGRESS',version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        event = "WORK_STARTED";
        message = "The technician started work on this repair.";
        await notifyTicket(ticketId, event, "Work has started", message, tx);
        break;
      case "log":
        assert(
          user.role === "TECHNICIAN" &&
            ticket.assigned_tech_id === user.user_id,
          "Only the assigned technician can record work.",
          403,
        );
        assert(
          ticket.status === "IN_PROGRESS",
          "Start this job before recording work.",
          409,
        );
        await rows(
          sql`INSERT INTO work_order_logs(ticket_id,tech_id,action_description,parts_consumed,labor_minutes) VALUES (${ticketId},${user.user_id}::uuid,${data.notes},${data.parts},${data.laborMinutes})`,
          tx,
        );
        await rows(
          sql`UPDATE tickets SET version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        event = "WORK_LOGGED";
        message = `Work recorded: ${data.notes}`;
        break;
      case "complete": {
        assert(
          user.role === "TECHNICIAN",
          "Only the assigned technician can complete this job.",
          403,
        );
        const proof = await one(
          sql`SELECT attachment_id FROM attachments WHERE attachment_id=${data.attachmentId}::uuid AND owner_id=${user.user_id}::uuid AND phase='AFTER' AND verified AND ticket_id IS NULL`,
          tx,
        );
        const decision = completionDecision(
          ticket.assigned_tech_id,
          user.user_id,
          ticket.status,
          !!proof,
        );
        assert(
          decision !== "FORBIDDEN",
          "Only the assigned technician can complete this job.",
          403,
        );
        assert(
          decision !== "NOT_STARTED",
          "Start this job before marking it complete.",
          409,
        );
        assert(
          decision !== "MISSING_PROOF",
          "The photo is missing, was not checked, or is already attached.",
          409,
        );
        const key = await claimAttachment(
          data.attachmentId,
          user,
          ticketId,
          "AFTER",
          tx,
        );
        await rows(
          sql`UPDATE tickets SET status='COMPLETED',resolution_notes=${data.notes},after_photo_uri=${key},resolved_at=NOW(),version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        await recountWorkload(ticket.assigned_tech_id, tx);
        await rows(
          sql`INSERT INTO background_jobs(kind,ticket_id,ticket_version,available_at) VALUES ('AUTO_CLOSE',${ticketId},${ticket.version + 1},NOW()+INTERVAL '72 hours')`,
          tx,
        );
        event = "WORK_COMPLETED";
        message =
          "Repair complete. The reporter can confirm the repair or report a problem.";
        await notifyTicket(
          ticketId,
          event,
          "Please check your repair",
          message,
          tx,
        );
        break;
      }
      case "close":
        assert(
          user.user_id === ticket.reporter_id || isManager(user.role),
          "Only the reporter or facilities staff can close this ticket.",
          403,
        );
        assert(
          ticket.status === "COMPLETED",
          "The repair must be complete before closure.",
          409,
        );
        await rows(
          sql`UPDATE tickets SET status='CLOSED',closed_at=NOW(),version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        event = "TICKET_CLOSED";
        message = "The repair was confirmed and the ticket was closed.";
        await notifyTicket(ticketId, event, "Ticket closed", message, tx);
        break;
      case "dispute":
        assert(
          user.user_id === ticket.reporter_id,
          "Only the original reporter can dispute this repair.",
          403,
        );
        assert(
          ticket.status === "COMPLETED" && ticket.assigned_tech_id,
          "Only a completed repair can be disputed.",
          409,
        );
        await rows(
          sql`UPDATE tickets SET status='IN_PROGRESS',resolved_at=NULL,closed_at=NULL,version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        await recountWorkload(ticket.assigned_tech_id, tx);
        event = "REPAIR_DISPUTED";
        message = `Repair reopened: ${data.reason}`;
        await rows(
          sql`INSERT INTO ticket_comments(ticket_id,author_id,body) VALUES (${ticketId},${user.user_id}::uuid,${message})`,
          tx,
        );
        await notifyTicket(
          ticketId,
          event,
          "Repair needs another check",
          message,
          tx,
          ticket.assigned_tech_id,
        );
        break;
      case "reject":
        assert(
          isManager(user.role),
          "Only facilities staff can reject a report.",
          403,
        );
        assert(
          ACTIVE_STATUSES.includes(ticket.status),
          "This report is already finished.",
          409,
        );
        await rows(
          sql`UPDATE tickets SET status='REJECTED',version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        await recountWorkload(ticket.assigned_tech_id, tx);
        event = "TICKET_REJECTED";
        message = `Report rejected: ${data.reason}`;
        await notifyTicket(ticketId, event, "Report reviewed", message, tx);
        break;
      case "merge": {
        assert(
          isManager(user.role),
          "Only facilities staff can merge reports.",
          403,
        );
        assert(
          data.masterId !== ticketId,
          "A report cannot be merged into itself.",
        );
        assert(
          ACTIVE_STATUSES.includes(ticket.status),
          "Only active reports can be merged.",
          409,
        );
        const master = await one<Ticket>(
          sql`SELECT * FROM tickets WHERE ticket_id=${data.masterId} FOR UPDATE`,
          tx,
        );
        assert(
          master &&
            ACTIVE_STATUSES.includes(master.status) &&
            !master.duplicate_of,
          "Select an active main report.",
        );
        assert(
          master.category_id === ticket.category_id &&
            master.location_id === ticket.location_id,
          "Merged reports must have the same location and category.",
        );
        await rows(
          sql`INSERT INTO ticket_subscribers(ticket_id,user_id) SELECT ${master.ticket_id},reporter_id FROM tickets WHERE ticket_id=${ticketId} UNION SELECT ${master.ticket_id},user_id FROM ticket_subscribers WHERE ticket_id=${ticketId} ON CONFLICT DO NOTHING`,
          tx,
        );
        await rows(
          sql`UPDATE tickets SET status='DUPLICATE',duplicate_of=${master.ticket_id},version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        await recountWorkload(ticket.assigned_tech_id, tx);
        event = "TICKET_MERGED";
        message = `Linked to ${master.ticket_id}: ${data.reason}`;
        await audit(
          user.user_id,
          event,
          master.ticket_id,
          `${ticketId} was linked to this report. ${data.reason}`,
          tx,
        );
        await notifyTicket(
          master.ticket_id,
          event,
          "Reports linked",
          message,
          tx,
        );
        break;
      }
      default:
        throw new AppError("This action is not supported.");
    }
    await audit(user.user_id, event, ticketId, message, tx);
    return { ticketId, message };
  });
}
export async function autoCloseTicket(
  ticketId: string,
  expectedVersion: number,
) {
  return database().transaction(async (tx) => {
    const ticket = await one<Ticket>(
      sql`SELECT * FROM tickets WHERE ticket_id=${ticketId} FOR UPDATE`,
      tx,
    );
    if (
      !ticket ||
      ticket.status !== "COMPLETED" ||
      ticket.version !== expectedVersion ||
      !ticket.resolved_at ||
      new Date(ticket.resolved_at).getTime() > Date.now() - 72 * 3600000
    )
      return false;
    await rows(
      sql`UPDATE tickets SET status='CLOSED',closed_at=NOW(),version=version+1 WHERE ticket_id=${ticketId}`,
      tx,
    );
    await audit(
      null,
      "TICKET_AUTO_CLOSED",
      ticketId,
      "No dispute was received within 72 hours of completion.",
      tx,
    );
    await notifyTicket(
      ticketId,
      "TICKET_CLOSED",
      "Ticket closed",
      "The repair was completed more than 72 hours ago. No dispute was received.",
      tx,
    );
    return true;
  });
}
