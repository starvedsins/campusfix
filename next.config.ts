import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  /* config options here */
  poweredByHeader: false,
  serverExternalPackages: ["pg", "sharp"],
  outputFileTracingExcludes: {
    "/*": [
      "./.data/**/*",
      "./docs/**/*",
      "./.env*",
      "./tests/**/*",
      "./test-results/**/*",
      "./db/introspection/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withWorkflow(nextConfig);
