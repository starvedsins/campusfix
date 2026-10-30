import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    reporters: ["default", "json"],
    outputFile: { json: "docs/evidence/vitest-results.json" },
    coverage: {
      provider: "v8",
      include: [
        "src/lib/policies.ts",
        "src/lib/domain.ts",
        "src/lib/auth.ts",
        "src/lib/tickets.ts",
        "src/lib/storage.ts",
        "src/lib/notifications.ts",
        "src/lib/reports.ts",
        "src/lib/reference.ts",
      ],
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "docs/evidence/coverage",
    },
  },
});
