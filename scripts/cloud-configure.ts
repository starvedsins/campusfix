import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const project = JSON.parse(await readFile(".vercel/project.json", "utf8"));
if (project.projectName !== "campusfix")
  throw new Error("Link the CampusFix project first.");
await mkdir(".data", { recursive: true });
let secret: string;
try {
  secret = await readFile(".data/cloud-cron.txt", "utf8");
} catch {
  secret = randomBytes(32).toString("hex");
  await writeFile(".data/cloud-cron.txt", secret, { mode: 0o600 });
}
for (const [key, value] of Object.entries({
  STORAGE_DRIVER: "vercel",
  DEMO_MODE: "true",
  DEMO_PASSWORD: "CampusFix2026!",
  CRON_SECRET: secret,
})) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/vercel/dist/vc.js",
        "env",
        "add",
        key,
        "production",
        "--force",
        "--scope",
        project.orgId,
      ],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    let output = "";
    child.stdout.on("data", (b) => {
      output += b.toString();
    });
    child.stderr.on("data", (b) => {
      output += b.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        console.log(`Set ${key} for production.`);
        resolve();
      } else
        reject(
          new Error(
            `Could not set ${key}: ${output.replaceAll(value, "[hidden]")}`,
          ),
        );
    });
    child.stdin.end(value);
  });
}
