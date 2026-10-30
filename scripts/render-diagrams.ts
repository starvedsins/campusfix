import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
// Optional documentation tool: npm install --prefix .data/diagram-tools mermaid.
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 2000, height: 1600 },
    deviceScaleFactor: 2,
  });
  await page.setContent(
    '<html><body style="margin:24px;background:white"><div id="diagram"></div></body></html>',
  );
  await page.addScriptTag({
    path: path.resolve(
      ".data/diagram-tools/node_modules/mermaid/dist/mermaid.min.js",
    ),
  });
  await mkdir("docs/figures", { recursive: true });
  for (const file of [
    "CampusFix_Programme_Manual",
    "CampusFix_Software_Implementation_Report",
  ]) {
    const text = await readFile(`docs/${file}.md`, "utf8");
    for (const [index, match] of [
      ...text.matchAll(/```mermaid\n([\s\S]*?)```/g),
    ].entries()) {
      const source = match[1];
      const kind = source.includes("erDiagram")
        ? "erd"
        : source.includes("classDiagram")
          ? "class"
          : source.includes("subgraph Reporter")
            ? "swimlanes"
            : source.includes("Submit([Report fault])")
              ? "usecases"
              : "architecture";
      const svg = await page.evaluate(
        async ({ source, id }) => {
          const mermaid = (
            window as unknown as {
              mermaid: {
                initialize: (config: unknown) => void;
                render: (
                  id: string,
                  source: string,
                ) => Promise<{ svg: string }>;
              };
            }
          ).mermaid;
          mermaid.initialize({
            startOnLoad: false,
            theme: "neutral",
            securityLevel: "strict",
            themeVariables: {
              fontFamily: "Arial",
              fontSize: "18px",
              primaryColor: "#eef3ed",
              primaryTextColor: "#173b2e",
              lineColor: "#285b48",
            },
          });
          return (await mermaid.render(id, source)).svg;
        },
        { source, id: `figure-${file}-${index}` },
      );
      await writeFile(`docs/figures/${kind}-mermaid.svg`, svg);
      await page.locator("#diagram").evaluate((el, markup) => {
        el.innerHTML = markup;
      }, svg);
      await page
        .locator("#diagram svg")
        .screenshot({ path: `docs/figures/${kind}-mermaid.png` });
      console.log("Rendered", kind);
    }
  }
} finally {
  await browser.close();
}
