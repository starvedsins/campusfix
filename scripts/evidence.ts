import { readFile, writeFile, mkdir } from "node:fs/promises";
async function json(file: string) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}
const unit = await json("docs/evidence/vitest-results.json");
const browser = await json("docs/evidence/playwright-results.json");
const hosted = await json("docs/evidence/playwright-hosted-results.json");
const performance = await json("docs/evidence/performance.json");
const coverage = await json("docs/evidence/coverage/coverage-summary.json");
const lines = [
  "# Recorded test results",
  "",
  `Generated: ${new Date().toISOString()}.`,
  "",
  "These are automated checks. They are not a user acceptance test or proof of live campus use.",
  "",
  "## Unit and database tests",
  "",
  unit
    ? `${unit.numPassedTests} passed, ${unit.numFailedTests} failed, ${unit.numPendingTests} pending. Source: vitest-results.json.`
    : "No result file exists.",
  "",
];
if (coverage) {
  lines.push(
    "Coverage scope: the service and policy files listed in vitest.config.ts. UI, API routes, jobs, and Workflow files are outside this coverage figure.",
    "",
    "| Measure | Result |",
    "|---|---|",
    ...Object.entries(coverage.total)
      .filter(([k]) => k !== "branchesTrue")
      .map(([k, v]) => `| ${k} | ${(v as { pct: number }).pct}% |`),
    "",
  );
}
lines.push(
  "## Browser checks",
  "",
  "| Engine | Passed | Failed | Skipped |",
  "|---|---|---|---|",
);
const engines: Record<
  string,
  { passed: number; failed: number; skipped: number }
> = {};
if (browser) {
  const visit = (s: {
    specs?: {
      tests: { projectName: string; results: { status: string }[] }[];
    }[];
    suites?: unknown[];
  }) => {
    for (const spec of s.specs ?? [])
      for (const t of spec.tests) {
        const row = (engines[t.projectName] ??= {
          passed: 0,
          failed: 0,
          skipped: 0,
        });
        const status = t.results.at(-1)?.status;
        if (status === "passed") row.passed++;
        else if (status === "skipped") row.skipped++;
        else row.failed++;
      }
    for (const child of s.suites ?? []) visit(child as typeof s);
  };
  for (const suite of browser.suites) visit(suite);
}
for (const [engine, n] of Object.entries(engines))
  lines.push(`| ${engine} | ${n.passed} | ${n.failed} | ${n.skipped} |`);
lines.push(
  "",
  "See playwright-results.json and browser-report/index.html for steps, errors, and accessibility attachments. Automated axe checks cover the named screens and rule tags in application.spec.ts. They do not establish full WCAG conformance. The keyboard and phone cases cover the tested controls and 390 px viewport.",
  "",
  "## Performance",
  "",
);
if (hosted)
  lines.splice(
    lines.indexOf("## Performance"),
    0,
    "## Hosted browser checks",
    "",
    `Chromium: ${hosted.stats.expected} passed, ${hosted.stats.unexpected} failed, ${hosted.stats.skipped} skipped. The suite used the public Vercel URL, Neon, and private Blob. Source: playwright-hosted-results.json.`,
    "",
    "Firefox could not start on this Windows host. Windows reported a missing side-by-side mozglue assembly. Reinstalling the current browser did not correct it. No Firefox application pass is claimed. See browser-environment.md.",
    "",
  );
if (performance)
  lines.push(
    `Environment: ${performance.environment.platform}, ${performance.environment.cpu}, ${performance.environment.logicalCpus} logical CPUs, ${performance.environment.totalMemoryGb} GB RAM, Node ${performance.environment.node}, PostgreSQL ${performance.environment.postgres}. Mode: ${performance.mode}.`,
    "",
    performance.scenario,
    "",
    "| Check | Samples | Median ms | 95th percentile ms | Target ms | Target met |",
    "|---|---|---|---|---|---|",
    ...["api", "database", "navigation"].map((k) => {
      const p = performance[k];
      return `| ${k} | ${p.samples} | ${p.p50Ms} | ${p.p95Ms} | ${p.targetP95Ms} | ${p.targetMet ? "Yes" : "No"} |`;
    }),
    "",
    `Failed dashboard requests: ${performance.api.failed}. This small seeded data set does not prove campus-scale capacity. Source: performance.json.`,
  );
else lines.push("No performance result file exists.");
lines.push(
  "",
  "## Human review",
  "",
  "User acceptance sessions: not performed. Training sessions: not performed. Campus pilot: not performed. Use Training_and_UAT.md to record real sessions. Deployment and persistence evidence are separate files.",
);
await mkdir("docs/evidence", { recursive: true });
await writeFile("docs/evidence/Test_Results.md", lines.join("\n"));
console.log("Updated the results summary from saved evidence.");
