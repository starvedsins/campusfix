import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const { runDueJobs } = await import("../src/lib/jobs");
const { cleanOrphanPhotos } = await import("../src/lib/storage");
console.log(
  "CampusFix background worker is running. Email and SMS use the test transport.",
);
const run = async () => {
  try {
    await runDueJobs();
    await cleanOrphanPhotos();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
};
await run();
setInterval(run, 15_000);
