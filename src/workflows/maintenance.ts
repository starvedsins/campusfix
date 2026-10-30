import { sleep } from "workflow";

export async function maintenanceJob(jobId: string, availableAt: string) {
  "use workflow";
  await sleep(new Date(availableAt));
  await executeJob(jobId);
}
async function executeJob(jobId: string) {
  "use step";
  const { executeBackgroundJob } = await import("@/lib/jobs");
  await executeBackgroundJob(jobId);
}
