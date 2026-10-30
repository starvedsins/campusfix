import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const files: string[] = [];
async function scan(dir: string) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = `${dir}/${entry.name}`;
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) await scan(name);
    else if (
      /\.(tsx?|sql|css|json|js|html|ya?ml|py|ps1|webmanifest)$/.test(name)
    )
      files.push(name);
  }
}
for (const dir of ["src", "scripts", "tests", "db/migrations", "public"])
  await scan(dir);
files.push(
  "package.json",
  "next.config.ts",
  "tsconfig.json",
  "drizzle.config.ts",
  "vitest.config.ts",
  "playwright.config.ts",
  "eslint.config.mjs",
  "compose.yaml",
  "vercel.json",
  ".env.example",
  ".github/workflows/verify.yml",
);
const parts = [
  "# CampusFix programme source listing",
  "",
  "This file contains the application source, migrations, test code, and build settings. It excludes secrets, dependencies, generated Workflow files, and private data. Run `npm run docs:source` to make a new copy.",
  "",
];
const hashes: { file: string; sha256: string }[] = [];
for (const name of files.sort()) {
  const source = await readFile(name, "utf8");
  hashes.push({
    file: name,
    sha256: createHash("sha256").update(source).digest("hex"),
  });
  const lang = path.extname(name).slice(1);
  parts.push(`## ${name}`, "", `\`\`\`\`${lang}`, source.trimEnd(), "````", "");
}
await mkdir("docs/evidence", { recursive: true });
await writeFile("docs/Programme_Source_Listing.md", parts.join("\n"));
await writeFile(
  "docs/evidence/source-hashes.json",
  JSON.stringify(hashes, null, 2),
);
console.log(
  `Saved ${hashes.length} source files. No local environment secrets were read.`,
);
