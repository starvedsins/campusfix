import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch();
const results: unknown[] = [];
try {
  for (const [alias, paths] of [
    [
      "admin",
      [
        "/app",
        "/app/users",
        "/app/reference",
        "/app/audit",
        "/app/deliveries",
        "/app/team",
        "/app/settings",
      ],
    ],
    ["student", ["/app/notifications", "/app/settings", "/app/tickets"]],
  ] as const) {
    const context = await browser.newContext({
      baseURL: "http://localhost:3000",
      viewport: { width: 1440, height: 1080 },
    });
    await context.request.post("/api/auth/login", {
      data: { identifier: `${alias}@utech.edu.jm`, password: "CampusFix2026!" },
    });
    const page = await context.newPage();
    for (const route of paths) {
      await page.goto(route);
      await page.locator("main h1").waitFor();
      await page
        .locator('[aria-busy="true"]')
        .waitFor({ state: "hidden" })
        .catch(() => {});
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      results.push({
        alias,
        route,
        heading: await page.locator("main h1").innerText(),
        violations: scan.violations,
      });
      await mkdir("docs/screenshots/management", { recursive: true });
      await page.screenshot({
        path: `docs/screenshots/management/${alias}-${route.split("/").at(-1)}.png`,
        fullPage: true,
      });
      console.log(alias, route, `${scan.violations.length} axe violations`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  "docs/evidence/ui-review.json",
  JSON.stringify(
    {
      runAt: new Date().toISOString(),
      scope:
        "Additional management, overview, list, and preferences screens on local production build. This is an automated scan, not full accessibility conformance.",
      results,
    },
    null,
    2,
  ),
);
if (results.some((r) => (r as { violations: unknown[] }).violations.length))
  process.exitCode = 1;
