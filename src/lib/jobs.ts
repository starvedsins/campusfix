import { one, rows } from "@/db";
import { sql } from "drizzle-orm";
import { processTestDeliveries } from "./notifications";
import { autoCloseTicket } from "./tickets";

export async function executeBackgroundJob(id: string) {
  const job = await one<{
    job_id: string;
    kind: string;
    ticket_id: string;
    ticket_version: number;
    status: string;
    available_at: Date;
  }>(sql`SELECT * FROM background_jobs WHERE job_id=${id}::uuid`);
  if (!job || job.status === "DONE") return;
  if (new Date(job.available_at).getTime() > Date.now()) return;
  try {
    if (job.kind === "AUTO_CLOSE")
      await autoCloseTicket(job.ticket_id, job.ticket_version);
    else {
      let processed = 0;
      do {
        processed = await processTestDeliveries();
      } while (processed === 100);
    }
    await rows(
      sql`UPDATE background_jobs SET status='DONE',attempts=attempts+1,last_error=NULL WHERE job_id=${id}::uuid`,
    );
  } catch (error) {
    await rows(
      sql`UPDATE background_jobs SET status='PENDING',attempts=attempts+1,last_error=${error instanceof Error ? error.message : "Background task failed"} WHERE job_id=${id}::uuid`,
    );
    throw error;
  }
}
export async function runDueJobs() {
  const jobs = await rows<{ job_id: string }>(
    sql`SELECT job_id FROM background_jobs WHERE status IN ('PENDING','STARTED') AND available_at<=NOW() AND attempts<5 ORDER BY available_at LIMIT 100`,
  );
  for (const job of jobs) await executeBackgroundJob(job.job_id);
  return jobs.length;
}
export async function launchPendingWorkflows() {
  const { start } = await import("workflow/api");
  const { maintenanceJob } = await import("@/workflows/maintenance");
  // Claims survive a failed start. A later request or the daily recovery job can retry.
  const jobs = await rows<{ job_id: string; available_at: Date }>(
    sql`UPDATE background_jobs SET status='STARTED' WHERE job_id IN (SELECT job_id FROM background_jobs WHERE status='PENDING' AND attempts<5 ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING job_id,available_at`,
  );
  for (const job of jobs) {
    try {
      const run = await start(maintenanceJob, [
        job.job_id,
        new Date(job.available_at).toISOString(),
      ]);
      await rows(
        sql`UPDATE background_jobs SET workflow_run_id=${run.runId} WHERE job_id=${job.job_id}::uuid`,
      );
    } catch (error) {
      await rows(
        sql`UPDATE background_jobs SET status='PENDING',attempts=attempts+1,last_error=${error instanceof Error ? error.message : "Workflow could not start"} WHERE job_id=${job.job_id}::uuid`,
      );
      console.error("Workflow start failed", job.job_id);
    }
  }
}
