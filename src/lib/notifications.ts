import { database, one, rows, type Executor } from "@/db";
import { sql } from "drizzle-orm";
import type { User } from "./domain";
import { deliveryChannels } from "./policies";

export async function notifyTicket(
  ticketId: string,
  event: string,
  title: string,
  body: string,
  tx: Executor,
  extraUserId?: string,
) {
  const recipients = await rows<{
    user_id: string;
    pref_email: boolean;
    pref_sms: boolean;
    pref_in_app: boolean;
  }>(
    sql`
    SELECT DISTINCT u.user_id,u.pref_email,u.pref_sms,u.pref_in_app FROM users u
    WHERE u.is_active AND (u.user_id IN (SELECT reporter_id FROM tickets WHERE ticket_id=${ticketId})
      OR u.user_id IN (SELECT user_id FROM ticket_subscribers WHERE ticket_id=${ticketId})
      OR u.user_id=${extraUserId ?? null}::uuid)`,
    tx,
  );
  for (const recipient of recipients) {
    const notification = await one<{ notification_id: string }>(
      sql`INSERT INTO notifications(user_id,ticket_id,event_code,title,body) VALUES (${recipient.user_id}::uuid,${ticketId},${event},${title},${body}) RETURNING notification_id`,
      tx,
    );
    for (const channel of deliveryChannels(
      recipient.pref_email,
      recipient.pref_sms,
    ))
      await rows(
        sql`INSERT INTO notification_deliveries(notification_id,channel) VALUES (${notification!.notification_id}::uuid,${channel})`,
        tx,
      );
  }
  await rows(
    sql`INSERT INTO background_jobs(kind,ticket_id) VALUES ('NOTIFICATIONS',${ticketId})`,
    tx,
  );
}
export async function processTestDeliveries(fail = false) {
  // The course build uses a test transport. No email or SMS is sent to a person.
  return database().transaction(async (tx) => {
    const deliveries = await rows<{ delivery_id: string }>(
      sql`SELECT delivery_id FROM notification_deliveries WHERE status='PENDING' AND attempts<3 ORDER BY delivery_id FOR UPDATE SKIP LOCKED LIMIT 100`,
      tx,
    );
    for (const item of deliveries) {
      if (fail)
        await rows(
          sql`UPDATE notification_deliveries SET attempts=attempts+1,last_error='Test transport failure',status=CASE WHEN attempts+1>=3 THEN 'FAILED' ELSE 'PENDING' END WHERE delivery_id=${item.delivery_id}::uuid`,
          tx,
        );
      else
        await rows(
          sql`UPDATE notification_deliveries SET status='TEST_RECORDED',attempts=attempts+1,processed_at=NOW(),last_error=NULL WHERE delivery_id=${item.delivery_id}::uuid`,
          tx,
        );
    }
    return deliveries.length;
  });
}
export async function getNotifications(user: User) {
  if (!user.pref_in_app) return [];
  return rows(
    sql`SELECT notification_id,ticket_id,event_code,title,body,read_at,created_at FROM notifications WHERE user_id=${user.user_id}::uuid ORDER BY created_at DESC LIMIT 100`,
  );
}
export async function markNotificationsRead(user: User) {
  await rows(
    sql`UPDATE notifications SET read_at=NOW() WHERE user_id=${user.user_id}::uuid AND read_at IS NULL`,
  );
}
