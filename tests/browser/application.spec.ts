import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

async function account(browser: Browser, alias: string) {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 1080 },
  });
  const response = await context.request.post("/api/auth/login", {
    data: { identifier: `${alias}@utech.edu.jm`, password: "CampusFix2026!" },
  });
  expect(response.status()).toBe(200);
  const cookie = (await context.cookies()).find(
    (c) => c.name === "campusfix_session",
  );
  expect(cookie).toBeDefined();
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.secure).toBe(
    (process.env.E2E_BASE_URL ?? "http://localhost:3000").startsWith("https:"),
  );
  return { context, page: await context.newPage() };
}
async function photo() {
  return sharp({
    create: { width: 640, height: 480, channels: 3, background: "#799b83" },
  })
    .png()
    .toBuffer();
}
async function fillReport(page: Page, title: string) {
  await page.goto("/app/report");
  await page
    .getByLabel("Issue category", { exact: true })
    .selectOption({ label: "Electrical" });
  await page.getByLabel("Report title", { exact: true }).fill(title);
  await page
    .getByLabel("What is happening?", { exact: true })
    .fill(
      "The classroom light is flickering. Please inspect the fitting and replace the damaged part.",
    );
  await page
    .getByLabel("Faculty or area", { exact: true })
    .selectOption("FENC");
  await page
    .getByLabel("Building", { exact: true })
    .selectOption({ label: "SCIT Building 2B" });
  const response = page.waitForResponse((response) =>
    response.url().includes("/api/tickets/duplicates"),
  );
  await page
    .getByLabel("Room or specific area", { exact: true })
    .selectOption({ label: "Computer Lab 3" });
  const matches = await (await response).json();
  if (matches.length) {
    await expect(
      page.getByLabel("This is a separate issue.", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("This is a separate issue.", { exact: true }).check();
  }
}
async function audit(page: Page, name: string, testInfo: TestInfo) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await testInfo.attach(`${name}-accessibility`, {
    body: JSON.stringify(result.violations, null, 2),
    contentType: "application/json",
  });
  expect(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
}
async function screenshot(page: Page, name: string, project: string) {
  if (project !== "chromium") return;
  const folder = process.env.E2E_BASE_URL
    ? "docs/screenshots/hosted"
    : "docs/screenshots";
  await mkdir(folder, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await page.screenshot({
    path: path.resolve(`${folder}/${name}.png`),
    fullPage: true,
  });
}

test("sign-in page supports the visible demo sign-in flow", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
  await audit(page, "login", testInfo);
  await screenshot(page, "01-sign-in", testInfo.project.name);
  await page.getByRole("button", { name: "Student", exact: true }).click();
  await expect(
    page.getByLabel("University email or ID", { exact: true }),
  ).toHaveValue("student@utech.edu.jm");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: "Hello, Avery." }),
  ).toBeVisible();
  await screenshot(page, "02-student-overview", testInfo.project.name);
});

test("a report moves through dispatch, repair proof, and reporter closure", async ({
  browser,
}, testInfo) => {
  const student = await account(browser, "student");
  const dispatcher = await account(browser, "dispatcher");
  const technician = await account(browser, "technician");
  try {
    const title = `Browser repair ${testInfo.project.name} ${Date.now()}`;
    await fillReport(student.page, title);
    await student.page
      .getByLabel("Add a photo (optional)", { exact: true })
      .setInputFiles({
        name: "issue.png",
        mimeType: "image/png",
        buffer: await photo(),
      });
    await screenshot(student.page, "03-report-form", testInfo.project.name);
    await audit(student.page, "report-form", testInfo);
    await student.page
      .getByRole("button", { name: "Submit report", exact: true })
      .click();
    await student.page.waitForURL(/\/app\/tickets\/CF-/);
    const id = student.page.url().match(/CF-\d{4}-\d+/)![0];
    await expect(
      student.page.getByText(
        `Your report is recorded. Your ticket number is ${id}.`,
      ),
    ).toBeVisible();
    await screenshot(student.page, "04-report-received", testInfo.project.name);
    await dispatcher.page.goto(`/app/tickets/${id}`);
    await dispatcher.page
      .getByLabel("Priority", { exact: true })
      .selectOption("P2_URGENT");
    const option = await dispatcher.page
      .locator("#technician option")
      .allTextContents();
    await dispatcher.page
      .getByLabel("Technician", { exact: true })
      .selectOption({
        label: option.find((text) => text.startsWith("Morgan Ellis"))!,
      });
    await dispatcher.page
      .getByRole("button", { name: "Assign work order", exact: true })
      .click();
    await expect(
      dispatcher.page.getByText("The report was updated.", { exact: true }),
    ).toBeVisible();
    await expect(
      dispatcher.page.locator(".page-actions .badge.assigned"),
    ).toBeVisible();
    await screenshot(
      dispatcher.page,
      "05-dispatch-assignment",
      testInfo.project.name,
    );
    await audit(dispatcher.page, "dispatch", testInfo);
    await technician.page.goto(`/app/tickets/${id}`);
    await technician.page
      .getByRole("button", { name: "Start work", exact: true })
      .click();
    await expect(
      technician.page.getByLabel("Work notes", { exact: true }),
    ).toBeVisible();
    await technician.page
      .getByLabel("Work notes", { exact: true })
      .fill("Inspected the light and replaced the faulty fitting.");
    await technician.page
      .getByLabel("Parts used", { exact: true })
      .fill("One LED fitting");
    await technician.page
      .getByLabel("Labour time (minutes)", { exact: true })
      .fill("25");
    await technician.page
      .getByRole("button", { name: "Save work log", exact: true })
      .click();
    await expect(technician.page.locator(".work-logs")).toContainText(
      "One LED fitting",
    );
    await technician.page
      .getByLabel("Final repair notes", { exact: true })
      .fill("Replaced the fitting and tested the light. It is stable.");
    await technician.page
      .getByLabel("After-repair photo", { exact: true })
      .setInputFiles({
        name: "repair.png",
        mimeType: "image/png",
        buffer: await photo(),
      });
    await screenshot(
      technician.page,
      "06-technician-work",
      testInfo.project.name,
    );
    await technician.page
      .getByRole("button", { name: "Complete repair", exact: true })
      .click();
    await expect(
      technician.page.locator(".page-actions .badge.completed"),
    ).toBeVisible();
    await student.page.reload();
    await expect(
      student.page.getByRole("button", {
        name: "Confirm repair and close",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      student.page.getByAltText("Photo submitted as repair proof"),
    ).toBeVisible();
    await screenshot(
      student.page,
      "07-completed-repair",
      testInfo.project.name,
    );
    await student.page
      .getByRole("button", { name: "Confirm repair and close", exact: true })
      .click();
    await expect(
      student.page.locator(".page-actions .badge.closed"),
    ).toBeVisible();
    await audit(student.page, "closed-ticket", testInfo);
    await screenshot(student.page, "08-closed-ticket", testInfo.project.name);
    await dispatcher.page.goto("/app/reports");
    await expect(
      dispatcher.page.getByRole("heading", { name: "By faculty and area" }),
    ).toBeVisible();
    await screenshot(dispatcher.page, "09-reports", testInfo.project.name);
    await audit(dispatcher.page, "reports", testInfo);
    const csv = await dispatcher.context.request.get("/api/reports/export");
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain(id);
  } finally {
    await student.context.close();
    await dispatcher.context.close();
    await technician.context.close();
  }
});

test("server rejects forbidden actions and cross-site changes", async ({
  browser,
}) => {
  const { context } = await account(browser, "student");
  try {
    expect((await context.request.get("/api/admin/users")).status()).toBe(403);
    expect((await context.request.get("/api/reports")).status()).toBe(403);
    const response = await context.request.patch("/api/settings", {
      headers: { Origin: "https://untrusted.example" },
      data: { email: true, sms: true, inApp: true },
    });
    expect(response.status()).toBe(403);
    const references = await (
      await context.request.get("/api/reference")
    ).json();
    const staff = await account(browser, "staff");
    const created = await (
      await staff.context.request.post("/api/tickets", {
        data: {
          categoryId: references.categories[0].category_id,
          locationId: references.locations[0].location_id,
          title: "Private staff report",
          description: "This report is visible to its original reporter only.",
          urgency: "LOW",
          submissionKey: crypto.randomUUID(),
        },
      })
    ).json();
    expect(
      (await context.request.get(`/api/tickets/${created.ticketId}`)).status(),
    ).toBe(403);
    await staff.context.close();
  } finally {
    await context.close();
  }
});

test("phone navigation, field labels, and keyboard access remain usable", async ({
  browser,
}, testInfo) => {
  const { context, page } = await account(browser, "student");
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: "Hello, Avery." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open navigation", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link", { name: "Report an issue", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Report an issue", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".sidebar")).not.toHaveClass(/mobile-open/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Tab");
    await screenshot(page, "10-mobile-report", testInfo.project.name);
    await audit(page, "mobile-report", testInfo);
  } finally {
    await context.close();
  }
});

test("an offline report survives reload as a draft and sends once after reconnect", async ({
  browser,
}, testInfo) => {
  const { context, page } = await account(browser, "student");
  try {
    const title = `Offline report ${testInfo.project.name} ${Date.now()}`;
    await fillReport(page, title);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(
      page.getByText("Draft saved on this device.", { exact: true }),
    ).toBeVisible();
    const duplicateResponse = page.waitForResponse(
      (response) => response.url().includes("/api/tickets/duplicates"),
      { timeout: 15000 },
    );
    await page.reload();
    await expect(page.getByLabel("Report title", { exact: true })).toHaveValue(
      title,
    );
    const matches = await (await duplicateResponse).json();
    const separate = page.getByLabel("This is a separate issue.", {
      exact: true,
    });
    if (matches.length) {
      await expect(separate).toBeVisible();
      await separate.check();
    }
    await context.setOffline(true);
    await page
      .getByRole("button", { name: "Submit report", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your report is saved", exact: true }),
    ).toBeVisible();
    await context.setOffline(false);
    await expect(page.locator(".toast")).toContainText(
      /Report CF-.* was sent/,
      { timeout: 30000 },
    );
    const result = await (
      await context.request.get(
        `/api/tickets?search=${encodeURIComponent(title)}`,
      )
    ).json();
    expect(result.total).toBe(1);
    expect(result.tickets[0].title).toBe(title);
  } finally {
    await context.close();
  }
});
