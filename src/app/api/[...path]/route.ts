import { one, rows } from "@/db";
import {
  getUser,
  login,
  logout,
  requireUser,
  SESSION_COOKIE,
} from "@/lib/auth";
import {
  isManager,
  isReporter,
  MAX_PHOTO_BYTES,
  ticketInput,
} from "@/lib/domain";
import { AppError, assert } from "@/lib/errors";
import { launchPendingWorkflows, runDueJobs } from "@/lib/jobs";
import { getNotifications, markNotificationsRead } from "@/lib/notifications";
import {
  createUser,
  listUsers,
  referenceData,
  updateReference,
  updateUser,
} from "@/lib/reference";
import { dashboard, exportCsv, reports } from "@/lib/reports";
import {
  cleanOrphanPhotos,
  confirmCloudPhoto,
  isCloudStorage,
  photoBytes,
  prepareCloudPhoto,
  saveLocalPhoto,
} from "@/lib/storage";
import {
  audit,
  createTicket,
  duplicateSuggestions,
  listTickets,
  ticketAction,
  ticketDetail,
} from "@/lib/tickets";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { sql } from "drizzle-orm";
import { after, NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ path: string[] }> };
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin)
    assert(
      origin === req.nextUrl.origin || origin === process.env.APP_URL,
      "This request did not come from CampusFix.",
      403,
    );
  else
    assert(
      req.headers.get("sec-fetch-site") !== "cross-site",
      "This request did not come from CampusFix.",
      403,
    );
}
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
async function body(req: NextRequest) {
  assert(
    Number(req.headers.get("content-length") ?? 0) < 100_000,
    "This request is too large.",
    413,
  );
  try {
    return await req.json();
  } catch {
    throw new AppError("The request data is not valid JSON.");
  }
}
function scheduleJobs() {
  after(async () => {
    try {
      if (process.env.VERCEL) await launchPendingWorkflows();
      else await runDueJobs();
    } catch (error) {
      console.error(
        "Background work is pending",
        error instanceof Error ? error.message : "",
      );
    }
  });
}
async function handler(req: NextRequest, context: Context) {
  try {
    const { path } = await context.params;
    const route = path.join("/");
    const method = req.method;
    if (route === "health" && method === "GET") {
      await rows(sql`SELECT 1`);
      return json({
        status: "ok",
        application: "CampusFix",
        messageTransport: "test",
        storage: isCloudStorage()
          ? "private Vercel Blob"
          : "private local storage",
      });
    }
    if (route === "jobs/recover" && method === "GET") {
      assert(
        process.env.CRON_SECRET &&
          req.headers.get("authorization") ===
            `Bearer ${process.env.CRON_SECRET}`,
        "Not authorised.",
        401,
      );
      await runDueJobs();
      await cleanOrphanPhotos();
      await launchPendingWorkflows();
      return json({ ok: true });
    }
    if (method !== "GET") sameOrigin(req);
    if (route === "auth/login" && method === "POST") {
      const token = await login(await body(req), null);
      const response = json({ user: await getUser(token) });
      response.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production" &&
          (Boolean(process.env.VERCEL) ||
            !["localhost", "127.0.0.1", "[::1]"].includes(
              req.nextUrl.hostname,
            )),
        sameSite: "lax",
        path: "/",
        maxAge: 7200,
      });
      return response;
    }
    if (route === "auth/logout" && method === "POST") {
      await logout(req.cookies.get(SESSION_COOKIE)?.value);
      const response = json({ ok: true });
      response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    }
    // The Blob SDK authenticates upload callbacks. User sessions are checked in token generation.
    if (route === "uploads/blob" && method === "POST") {
      assert(isCloudStorage(), "Cloud uploads are not enabled.");
      const requestBody = (await body(req)) as HandleUploadBody;
      const result = await handleUpload({
        request: req,
        body: requestBody,
        onBeforeGenerateToken: async (pathname) => {
          const user = await requireUser(
            req.cookies.get(SESSION_COOKIE)?.value,
          );
          const item = await one<{
            attachment_id: string;
            content_type: string;
          }>(
            sql`SELECT attachment_id,content_type FROM attachments WHERE storage_key=${pathname} AND owner_id=${user.user_id}::uuid AND NOT verified AND ticket_id IS NULL AND created_at>NOW()-INTERVAL '15 minutes'`,
          );
          assert(item, "This photo upload is not authorised.", 403);
          return {
            allowedContentTypes: [item.content_type],
            maximumSizeInBytes: MAX_PHOTO_BYTES,
            addRandomSuffix: false,
            allowOverwrite: false,
            validUntil: Date.now() + 10 * 60_000,
            tokenPayload: JSON.stringify({ attachmentId: item.attachment_id }),
          };
        },
        onUploadCompleted: async () => {},
      });
      return json(result);
    }
    const user = await requireUser(req.cookies.get(SESSION_COOKIE)?.value);
    if (route === "session" && method === "GET") return json({ user });
    if (route === "reference" && method === "GET")
      return json(await referenceData(user));
    if (route === "dashboard" && method === "GET")
      return json(await dashboard(user));
    if (route === "tickets/duplicates" && method === "GET") {
      const categoryId = z
        .uuid()
        .parse(req.nextUrl.searchParams.get("categoryId"));
      const locationId = z
        .uuid()
        .parse(req.nextUrl.searchParams.get("locationId"));
      return json(await duplicateSuggestions(user, categoryId, locationId));
    }
    if (route === "tickets" && method === "GET")
      return json(await listTickets(user, req.nextUrl.searchParams));
    if (route === "tickets" && method === "POST") {
      const data = ticketInput.parse(await body(req));
      const result = await createTicket(user, data);
      scheduleJobs();
      return json(result, result.replayed ? 200 : 201);
    }
    if (path[0] === "tickets" && path.length === 2 && method === "GET")
      return json(await ticketDetail(user, path[1]));
    if (
      path[0] === "tickets" &&
      path[2] === "actions" &&
      path.length === 3 &&
      method === "POST"
    ) {
      const result = await ticketAction(user, path[1], await body(req));
      scheduleJobs();
      return json(result);
    }
    if (route === "uploads" && method === "POST") {
      assert(
        !isCloudStorage(),
        "Use the direct upload form for the hosted copy.",
      );
      assert(
        Number(req.headers.get("content-length") ?? 0) <=
          MAX_PHOTO_BYTES + 20_000,
        "The photo must be 4.5 MB or smaller.",
        413,
      );
      const form = await req.formData();
      const file = form.get("file");
      const phase = z.enum(["BEFORE", "AFTER"]).parse(form.get("phase"));
      assert(file instanceof File, "Choose a photo.");
      assert(
        phase === "BEFORE" ? isReporter(user.role) : user.role === "TECHNICIAN",
        "You cannot upload this type of photo.",
        403,
      );
      return json(await saveLocalPhoto(user, file, phase), 201);
    }
    if (route === "uploads/prepare" && method === "POST") {
      const data = z
        .object({
          name: z.string().min(1).max(200),
          size: z.number().int().positive().max(MAX_PHOTO_BYTES),
          contentType: z.enum(["image/jpeg", "image/png"]),
          phase: z.enum(["BEFORE", "AFTER"]),
        })
        .parse(await body(req));
      assert(
        data.phase === "BEFORE"
          ? isReporter(user.role)
          : user.role === "TECHNICIAN",
        "You cannot upload this type of photo.",
        403,
      );
      return json(await prepareCloudPhoto(user, data));
    }
    if (route === "uploads/confirm" && method === "POST") {
      const data = z.object({ attachmentId: z.uuid() }).parse(await body(req));
      return json(await confirmCloudPhoto(user, data.attachmentId));
    }
    if (path[0] === "attachments" && path.length === 2 && method === "GET") {
      const id = z.uuid().parse(path[1]);
      const item = await one<{
        owner_id: string;
        ticket_id: string | null;
        verified: boolean;
        storage_key: string;
        content_type: string;
      }>(sql`SELECT * FROM attachments WHERE attachment_id=${id}::uuid`);
      assert(item?.verified, "This photo was not found.", 404);
      if (item.ticket_id) await ticketDetail(user, item.ticket_id);
      else
        assert(
          item.owner_id === user.user_id,
          "You cannot view this photo.",
          403,
        );
      return new NextResponse(
        new Uint8Array(await photoBytes(item.storage_key)),
        {
          headers: {
            "Content-Type": item.content_type,
            "Cache-Control": "private, no-store",
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
    if (route === "notifications" && method === "GET")
      return json(await getNotifications(user));
    if (route === "notifications" && method === "PATCH") {
      await markNotificationsRead(user);
      return json({ ok: true });
    }
    if (route === "settings" && method === "PATCH") {
      const data = z
        .object({ email: z.boolean(), sms: z.boolean(), inApp: z.boolean() })
        .parse(await body(req));
      await rows(
        sql`UPDATE users SET pref_email=${data.email},pref_sms=${data.sms},pref_in_app=${data.inApp},updated_at=NOW() WHERE user_id=${user.user_id}::uuid`,
      );
      await audit(
        user.user_id,
        "PREFERENCES_UPDATED",
        null,
        "Notification preferences saved.",
      );
      return json({ ok: true });
    }
    if (route === "reports" && method === "GET")
      return json(await reports(user, req.nextUrl.searchParams));
    if (route === "reports/export" && method === "GET")
      return new NextResponse(await exportCsv(user, req.nextUrl.searchParams), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            "attachment; filename=campusfix-maintenance.csv",
          "Cache-Control": "private, no-store",
        },
      });
    if (route === "admin/users" && method === "GET")
      return json(await listUsers(user));
    if (route === "admin/users" && method === "POST")
      return json(await createUser(user, await body(req)), 201);
    if (route === "admin/users" && method === "PATCH")
      return json(await updateUser(user, await body(req)));
    if (route === "admin/reference" && method === "POST")
      return json(await updateReference(user, await body(req)));
    if (route === "admin/audit" && method === "GET") {
      assert(
        user.role === "FMD_ADMIN",
        "Only administrators can view the audit log.",
        403,
      );
      return json(
        await rows(
          sql`SELECT a.audit_id,a.event_code,a.details,a.ticket_id,a.created_at,u.full_name FROM audit_logs a LEFT JOIN users u ON u.user_id=a.actor_id ORDER BY a.created_at DESC LIMIT 200`,
        ),
      );
    }
    if (route === "admin/deliveries" && method === "GET") {
      assert(
        isManager(user.role),
        "Only facilities staff can view message delivery records.",
        403,
      );
      return json(
        await rows(
          sql`SELECT d.delivery_id,d.channel,d.status,d.attempts,d.last_error,d.processed_at,n.title,n.ticket_id,u.full_name FROM notification_deliveries d JOIN notifications n ON n.notification_id=d.notification_id JOIN users u ON u.user_id=n.user_id ORDER BY n.created_at DESC LIMIT 100`,
        ),
      );
    }
    throw new AppError("This page was not found.", 404);
  } catch (error) {
    if (error instanceof ZodError)
      return json(
        {
          error: error.issues[0]?.message ?? "Check your entries.",
          fields: Object.fromEntries(
            error.issues.map((issue) => [issue.path.join("."), issue.message]),
          ),
        },
        400,
      );
    if (error instanceof AppError)
      return json({ error: error.message, code: error.code }, error.status);
    const code = (error as { code?: string })?.code;
    if (code === "23505")
      return json(
        { error: "This record already exists. Check the ID, email, or name." },
        409,
      );
    if (code === "22P02" || code === "22007" || code === "22008")
      return json({ error: "One of the values is not valid." }, 400);
    if (code === "40P01")
      return json(
        { error: "Another update is in progress. Refresh and try again." },
        409,
      );
    console.error("CampusFix request failed", error);
    return json(
      {
        error:
          "CampusFix could not finish this request. Try again. Your previous data is safe.",
      },
      500,
    );
  }
}
export { handler as GET, handler as PATCH, handler as POST };
