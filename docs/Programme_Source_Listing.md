# CampusFix programme source listing

This file contains the application source, migrations, test code, and build settings. It excludes secrets, dependencies, generated Workflow files, and private data. Run `npm run docs:source` to make a new copy.

## .env.example

````example
DATABASE_URL=postgresql://campusfix:campusfix-local-only@127.0.0.1:55432/campusfix
TEST_DATABASE_URL=postgresql://campusfix:campusfix-local-only@127.0.0.1:55432/campusfix_test
APP_URL=http://localhost:3000
STORAGE_DRIVER=local
LOCAL_STORAGE_DIR=.data/uploads
DEMO_MODE=true
DEMO_PASSWORD=CampusFix2026!
# Set these through Vercel environment settings for the hosted copy.
# STORAGE_DRIVER=vercel
# BLOB_READ_WRITE_TOKEN=
# CRON_SECRET=
````

## .github/workflows/verify.yml

````yml
name: Verify CampusFix
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: campusfix
          POSTGRES_PASSWORD: campusfix-local-only
          POSTGRES_DB: campusfix
        ports: ["55432:5432"]
        options: >-
          --health-cmd "pg_isready -U campusfix -d campusfix"
          --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      DATABASE_URL: postgresql://campusfix:campusfix-local-only@127.0.0.1:55432/campusfix
      TEST_DATABASE_URL: postgresql://campusfix:campusfix-local-only@127.0.0.1:55432/campusfix_test
      STORAGE_DRIVER: local
      DEMO_MODE: "true"
      DEMO_PASSWORD: CampusFix2026!
      E2E_SERVER_COMMAND: npm start
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: psql "$DATABASE_URL" -c "CREATE DATABASE campusfix_test"
      - run: npm run db:prepare
      - run: npm run verify
      - run: npm run build
      - run: npx playwright install --with-deps chromium firefox webkit
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: campusfix-test-evidence
          path: docs/evidence
````

## compose.yaml

````yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: campusfix
      POSTGRES_PASSWORD: campusfix-local-only
      POSTGRES_DB: campusfix
    ports:
      - "127.0.0.1:${CAMPUSFIX_DB_PORT:-55432}:5432"
    volumes:
      - campusfix_pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U campusfix -d campusfix"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  campusfix_pg:
````

## db/migrations/0001_course_baseline.sql

````sql
-- =============================================================================
-- UNIVERSITY OF TECHNOLOGY, JAMAICA
-- SCHOOL OF COMPUTING AND INFORMATION TECHNOLOGY
-- MODULE: CIT4001 - SOFTWARE IMPLEMENTATION
-- PROGRAMME MANUAL: DATA DESIGN & DATABASE STRUCTURE [100 MARKS]
-- PROJECT: CAMPUSFIX (UNIVERSITY ISSUES & MAINTENANCE REPORTING SYSTEM)
-- DBMS TARGET: PostgreSQL 16 / Relational SQL Standard
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1.0 ENUM TYPES & DOMAIN CONSTRAINTS
-- -----------------------------------------------------------------------------

CREATE TYPE user_role_enum AS ENUM (
    'STUDENT',
    'STAFF',
    'TECHNICIAN',
    'FMD_DISPATCHER',
    'FMD_ADMIN'
);

CREATE TYPE ticket_priority_enum AS ENUM (
    'P1_CRITICAL',   -- Safety hazard / 4-hour SLA
    'P2_URGENT',     -- Disruptive fault / 24-hour SLA
    'P3_ROUTINE'     -- Standard maintenance / 72-hour SLA
);

CREATE TYPE ticket_status_enum AS ENUM (
    'PENDING',       -- Logged by reporter, awaiting triage
    'ASSIGNED',      -- Allocated to trade technician
    'IN_PROGRESS',   -- Tech on-site, work underway
    'COMPLETED',     -- Work done, awaiting user verification
    'CLOSED',        -- Sign-off confirmed, ticket closed
    'DUPLICATE',     -- Merged into existing master ticket
    'REJECTED'       -- Out of scope or invalid report
);

CREATE TYPE trade_specialty_enum AS ENUM (
    'ELECTRICAL',
    'PLUMBING',
    'HVAC_AIR_CONDITIONING',
    'CARPENTRY',
    'MASONRY_STRUCTURAL',
    'IT_AUDIOVISUAL',
    'GENERAL_CLEANING'
);

-- -----------------------------------------------------------------------------
-- 2.0 RELATIONAL TABLE STRUCTURES
-- -----------------------------------------------------------------------------

-- 2.1 USERS TABLE
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institutional_id VARCHAR(20) NOT NULL UNIQUE,       -- e.g. UTech ID '2401430'
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone_number VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,                -- bcrypt salted hash
    role user_role_enum NOT NULL DEFAULT 'STUDENT',
    failed_attempts INT NOT NULL DEFAULT 0,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    pref_email BOOLEAN NOT NULL DEFAULT TRUE,
    pref_sms BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_email_domain CHECK (email LIKE '%@utech.edu.jm' OR email LIKE '%@utechstudents.edu.jm')
);

-- 2.2 LOCATIONS TABLE (Hierarchical Campus Infrastructure)
CREATE TABLE locations (
    location_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_code VARCHAR(10) NOT NULL,                  -- FENC, FOBM, FOSS, COHS, CML, RES
    building_name VARCHAR(80) NOT NULL,                 -- e.g. 'SCIT Building 2B'
    room_number VARCHAR(30) NOT NULL,                   -- e.g. 'Room 2B-08 (Lab 3)'
    floor_level INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_location UNIQUE (faculty_code, building_name, room_number)
);

-- 2.3 MAINTENANCE CATEGORIES TABLE
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(60) NOT NULL UNIQUE,
    trade_specialty trade_specialty_enum NOT NULL,
    default_priority ticket_priority_enum NOT NULL DEFAULT 'P3_ROUTINE',
    default_sla_hours INT NOT NULL DEFAULT 72
);

-- 2.4 TECHNICIANS PROFILE TABLE
CREATE TABLE technicians (
    tech_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    trade_specialty trade_specialty_enum NOT NULL,
    active_workload INT NOT NULL DEFAULT 0,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    license_certification VARCHAR(100),
    CONSTRAINT chk_workload_non_negative CHECK (active_workload >= 0)
);

-- 2.5 TICKETS TABLE (Core Transactional Table)
CREATE TABLE tickets (
    ticket_id VARCHAR(15) PRIMARY KEY,                  -- e.g. 'CF-2026-1049'
    reporter_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES locations(location_id) ON DELETE RESTRICT,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    priority ticket_priority_enum NOT NULL DEFAULT 'P3_ROUTINE',
    status ticket_status_enum NOT NULL DEFAULT 'PENDING',
    assigned_tech_id UUID REFERENCES technicians(tech_id) ON DELETE SET NULL,
    before_photo_uri VARCHAR(500),                      -- Secure Storage path
    after_photo_uri VARCHAR(500),                       -- Proof of completion
    resolution_notes TEXT,
    sla_deadline TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_description_min_length CHECK (LENGTH(description) >= 15)
);

-- 2.6 TICKET SUBSCRIBERS TABLE (Duplicate Report Consolidation)
CREATE TABLE ticket_subscribers (
    ticket_id VARCHAR(15) NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id, user_id)
);

-- 2.7 WORK ORDER LABOR & PARTS LOG
CREATE TABLE work_order_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id VARCHAR(15) NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    tech_id UUID NOT NULL REFERENCES technicians(tech_id) ON DELETE RESTRICT,
    action_description TEXT NOT NULL,
    parts_consumed TEXT,
    labor_minutes INT NOT NULL DEFAULT 0,
    logged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.8 AUDIT LOGS TABLE (Regulatory & Security Compliance)
CREATE TABLE audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    event_code VARCHAR(50) NOT NULL,                    -- e.g. 'TICKET_DISPATCHED', 'LOGIN_FAILED'
    ticket_id VARCHAR(15),
    details TEXT NOT NULL,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3.0 INDEXES FOR QUERY OPTIMIZATION
-- -----------------------------------------------------------------------------

CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_location ON tickets(location_id);
CREATE INDEX idx_tickets_tech ON tickets(assigned_tech_id);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_locations_faculty ON locations(faculty_code);
CREATE INDEX idx_users_email ON users(email);

-- -----------------------------------------------------------------------------
-- 4.0 ANALYTICAL REPORTING VIEWS
-- -----------------------------------------------------------------------------

-- 4.1 ACTIVE DISPATCH QUEUE VIEW
CREATE OR REPLACE VIEW vw_active_dispatch_queue AS
SELECT 
    t.ticket_id,
    t.priority,
    t.status,
    c.category_name,
    l.faculty_code,
    l.building_name,
    l.room_number,
    u.full_name AS reporter_name,
    u.phone_number AS reporter_phone,
    tech_user.full_name AS assigned_technician,
    t.sla_deadline,
    CASE 
        WHEN CURRENT_TIMESTAMP > t.sla_deadline AND t.status NOT IN ('COMPLETED', 'CLOSED') 
        THEN TRUE ELSE FALSE 
    END AS is_sla_breached
FROM tickets t
JOIN categories c ON t.category_id = c.category_id
JOIN locations l ON t.location_id = l.location_id
JOIN users u ON t.reporter_id = u.user_id
LEFT JOIN users tech_user ON t.assigned_tech_id = tech_user.user_id
WHERE t.status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS');

-- 4.2 SLA COMPLIANCE SUMMARY BY FACULTY
CREATE OR REPLACE VIEW vw_faculty_sla_compliance AS
SELECT 
    l.faculty_code,
    COUNT(t.ticket_id) AS total_tickets,
    COUNT(CASE WHEN t.status IN ('COMPLETED', 'CLOSED') AND t.resolved_at <= t.sla_deadline THEN 1 END) AS on_time_resolutions,
    COUNT(CASE WHEN t.status IN ('COMPLETED', 'CLOSED') AND t.resolved_at > t.sla_deadline THEN 1 END) AS overdue_resolutions,
    ROUND(
        (COUNT(CASE WHEN t.status IN ('COMPLETED', 'CLOSED') AND t.resolved_at <= t.sla_deadline THEN 1 END)::NUMERIC / 
        NULLIF(COUNT(CASE WHEN t.status IN ('COMPLETED', 'CLOSED') THEN 1 END), 0)::NUMERIC) * 100, 2
    ) AS sla_compliance_percentage
FROM tickets t
JOIN locations l ON t.location_id = l.location_id
GROUP BY l.faculty_code;

-- =============================================================================
-- END OF DATABASE DATA DESIGN SPECIFICATION
-- =============================================================================
````

## db/migrations/0002_application.sql

````sql
ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN pref_in_app BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tickets ADD COLUMN reporter_urgency VARCHAR(10) NOT NULL DEFAULT 'LOW' CHECK (reporter_urgency IN ('LOW','MEDIUM','HIGH'));
ALTER TABLE tickets ADD COLUMN duplicate_of VARCHAR(15) REFERENCES tickets(ticket_id);
ALTER TABLE tickets ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE tickets ADD COLUMN submission_key UUID UNIQUE;
ALTER TABLE tickets ADD CONSTRAINT chk_description_length CHECK (char_length(description) BETWEEN 15 AND 500);
ALTER TABLE tickets ADD CONSTRAINT chk_title_length CHECK (char_length(title) BETWEEN 1 AND 150);
ALTER TABLE tickets ADD CONSTRAINT chk_not_self_duplicate CHECK (duplicate_of IS DISTINCT FROM ticket_id);
ALTER TABLE tickets ADD CONSTRAINT chk_assigned_state CHECK (status NOT IN ('ASSIGNED','IN_PROGRESS') OR assigned_tech_id IS NOT NULL);
ALTER TABLE tickets ADD CONSTRAINT chk_completion CHECK (status NOT IN ('COMPLETED','CLOSED') OR (resolved_at IS NOT NULL AND after_photo_uri IS NOT NULL AND char_length(resolution_notes) >= 10));
ALTER TABLE work_order_logs ADD CONSTRAINT chk_labor CHECK (labor_minutes BETWEEN 0 AND 1440);
ALTER TABLE categories ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE SEQUENCE ticket_number_seq START 1001;

CREATE TABLE sessions (
  session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE attachments (
  attachment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(user_id),
  ticket_id VARCHAR(15) REFERENCES tickets(ticket_id),
  phase VARCHAR(10) NOT NULL CHECK (phase IN ('BEFORE','AFTER')),
  storage_key TEXT NOT NULL UNIQUE,
  original_name VARCHAR(200) NOT NULL,
  content_type VARCHAR(30) NOT NULL CHECK (content_type IN ('image/jpeg','image/png')),
  byte_size INT NOT NULL CHECK (byte_size BETWEEN 1 AND 4500000),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_attachments_ticket ON attachments(ticket_id);
CREATE TABLE ticket_comments (
  comment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id VARCHAR(15) NOT NULL REFERENCES tickets(ticket_id),
  author_id UUID NOT NULL REFERENCES users(user_id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  ticket_id VARCHAR(15) REFERENCES tickets(ticket_id),
  event_code VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id,created_at DESC);
CREATE TABLE notification_deliveries (
  delivery_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID NOT NULL REFERENCES notifications(notification_id),
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('EMAIL','SMS')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','TEST_RECORDED','FAILED')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  UNIQUE(notification_id,channel)
);
CREATE TABLE background_jobs (
  job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind VARCHAR(30) NOT NULL CHECK (kind IN ('NOTIFICATIONS','AUTO_CLOSE')),
  ticket_id VARCHAR(15) REFERENCES tickets(ticket_id),
  ticket_version INT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(15) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','STARTED','DONE','FAILED')),
  workflow_run_id TEXT,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_background_jobs_pending ON background_jobs(status,available_at);
CREATE INDEX idx_tickets_duplicate_search ON tickets(location_id,category_id,created_at DESC) WHERE status IN ('PENDING','ASSIGNED','IN_PROGRESS');
CREATE INDEX idx_subscribers_user ON ticket_subscribers(user_id);
CREATE INDEX idx_audit_ticket ON audit_logs(ticket_id,created_at);
CREATE INDEX idx_audit_login_ip ON audit_logs(ip_address,created_at) WHERE event_code='LOGIN_FAILED';

CREATE OR REPLACE FUNCTION prevent_audit_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit records cannot be changed or removed'; END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_changes();
````

## drizzle.config.ts

````ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
config({ path: ".env.local", quiet: true });
export default defineConfig({
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  out: "./db/introspection",
  schema: "./src/db/schema.ts",
});
````

## eslint.config.mjs

````mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/app/.well-known/**",
    "docs/evidence/**",
    ".data/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
````

## next.config.ts

````ts
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
````

## package.json

````json
{
  "name": "campusfix",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "db:start": "tsx scripts/local-db.ts",
    "db:docker": "docker compose up -d",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:seed": "tsx scripts/seed.ts",
    "db:prepare": "tsx scripts/prepare.ts",
    "jobs": "tsx scripts/jobs.ts",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:load": "tsx scripts/load.ts",
    "typecheck": "tsc --noEmit",
    "verify": "npm run typecheck && npm run lint && npm test",
    "deploy": "vercel --prod",
    "local": "tsx scripts/local.ts",
    "docs:source": "tsx scripts/source-listing.ts",
    "docs:whitebox": "tsx scripts/whitebox.ts",
    "docs:evidence": "tsx scripts/evidence.ts"
  },
  "dependencies": {
    "@fontsource-variable/manrope": "5.3.0",
    "@fontsource-variable/public-sans": "5.3.0",
    "@vercel/blob": "2.8.2",
    "bcryptjs": "3.0.3",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "drizzle-orm": "0.45.4",
    "idb": "8.0.4",
    "lucide-react": "1.65.0",
    "next": "16.4.3",
    "pg": "8.23.1",
    "radix-ui": "1.8.1",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "sharp": "0.35.5",
    "tailwind-merge": "3.7.0",
    "workflow": "5.2.3",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.14.0",
    "@playwright/test": "1.64.1",
    "@tailwindcss/turbopack": "^4",
    "@types/node": "26.6.6",
    "@types/pg": "8.23.1",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitest/coverage-v8": "5.0.5",
    "dotenv": "18.0.9",
    "drizzle-kit": "0.31.11",
    "embedded-postgres": "16.15.0-beta.19",
    "eslint": "^9",
    "eslint-config-next": "16.4.3",
    "prettier": "3.9.10",
    "tailwindcss": "^4",
    "tsx": "4.23.15",
    "typescript": "^5",
    "vercel": "65.8.0",
    "vitest": "5.0.5"
  },
  "type": "module",
  "overrides": {
    "zod": "$zod",
    "@fastify/busboy": "3.2.4",
    "tar": "7.5.22",
    "smol-toml": "1.9.1",
    "ajv@^8": "8.20.0",
    "esbuild": "0.28.2",
    "js-yaml@^4": "4.3.2",
    "minimatch@^10": "10.2.6",
    "path-to-regexp@^6": "6.3.0",
    "path-to-regexp@^8": "8.4.2",
    "undici": "7.30.1"
  }
}
````

## playwright.config.ts

````ts
import { defineConfig, devices } from "@playwright/test";
const hosted = !!process.env.E2E_BASE_URL;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: hosted
          ? "docs/evidence/hosted-browser-report"
          : "docs/evidence/browser-report",
      },
    ],
    [
      "json",
      {
        outputFile: hosted
          ? "docs/evidence/playwright-hosted-results.json"
          : "docs/evidence/playwright-results.json",
      },
    ],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1080 },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1440, height: 1080 },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 1080 },
      },
    },
  ],
  webServer: hosted
    ? undefined
    : {
        command: process.env.E2E_SERVER_COMMAND ?? "npm run dev",
        url: "http://localhost:3000/login",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
````

## public/manifest.webmanifest

````webmanifest
{"name":"CampusFix campus maintenance","short_name":"CampusFix","description":"Report campus faults and follow repairs.","start_url":"/app","scope":"/","display":"standalone","background_color":"#f5f7f6","theme_color":"#173d33","icons":[{"src":"/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"},{"src":"/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]}
````

## public/offline.html

````html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#173d33"><title>Offline | CampusFix</title><style>body{font-family:system-ui,sans-serif;background:#f5f7f6;color:#182e27;margin:0;min-height:100dvh;display:grid;place-items:center}main{max-width:32rem;padding:2rem}h1{font-size:2rem}p{line-height:1.7}a{display:inline-block;background:#173d33;color:white;padding:.8rem 1.3rem;border-radius:.6rem;text-decoration:none}</style></head><body><main><img src="/icon.svg" width="56" height="56" alt=""><h1>Your connection needs a moment.</h1><p>CampusFix cannot load this page while you are offline. Your saved report drafts and queued reports remain on this device.</p><p>When your connection returns, sign in to send queued reports. A report form that is already open can still save a draft.</p><a href="/app">Try again</a></main></body></html>
````

## public/sw.js

````js
const CACHE = "campusfix-static-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          "/offline.html",
          "/icon.svg",
          "/icon-192.png",
          "/icon-512.png",
        ]),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
    return;
  }
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon")
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }),
    );
  }
});
````

## scripts/build-documents.py

````py
"""Build Word copies from the reviewed Markdown course deliverables.
Run with the bundled Codex document Python runtime.
"""
from pathlib import Path
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
FIGS = DOCS / 'figures'
FIGS.mkdir(exist_ok=True)
FONT = 'C:/Windows/Fonts/arial.ttf'
BOLD = 'C:/Windows/Fonts/arialbd.ttf'

def diagram(name, title, columns, links=None):
    width, height = 1600, 900
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)
    draw.text((45, 25), title, font=ImageFont.truetype(BOLD, 34), fill='#173b2e')
    count = len(columns)
    cell = (width-80)/count
    positions = {}
    for col, (heading, nodes) in enumerate(columns):
        x = int(40+col*cell)
        draw.rounded_rectangle((x, 95, x+cell-20, height-35), radius=18, fill='#f2f6f1', outline='#d5dfd5', width=2)
        draw.text((x+18, 116), heading, font=ImageFont.truetype(BOLD, 24), fill='#173b2e')
        for row, (key, label) in enumerate(nodes):
            y = 205+row*145
            cx = int(x+cell/2-10)
            positions[key] = (cx, y+42)
            draw.rounded_rectangle((x+20,y,x+cell-40,y+90), radius=12, fill='white', outline='#285b48', width=3)
            words = label.split(); lines=[]; line=''
            maxchars = max(15, int((cell-75)/13))
            for word in words:
                if len(line+' '+word)>maxchars and line: lines.append(line); line=word
                else: line=(line+' '+word).strip()
            lines.append(line)
            for i, text in enumerate(lines):
                box = draw.textbbox((0,0),text,font=ImageFont.truetype(FONT,23))
                draw.text((cx-(box[2]-box[0])/2,y+15+i*27),text,font=ImageFont.truetype(FONT,23),fill='#173b2e')
    # Actor and data figures use explicit relation lists below the figure in the source.
    if links:
        for a,b in links:
            ax,ay=positions[a]; bx,by=positions[b]
            if ax==bx:
                draw.line((ax,ay+48,bx,by-48), fill='#53755f',width=3)
                draw.polygon(((bx,by-48),(bx-7,by-61),(bx+7,by-61)),fill='#53755f')
    image.save(FIGS / (name+'.png'))

diagram('architecture','CampusFix system structure',[
 ('Client',[('browser','Browser or installed PWA'),('draft','Local drafts and queue')]),
 ('Application',[('next','Next.js pages and API'),('auth','Session and role checks'),('service','Ticket services and Drizzle')]),
 ('Data',[('pg','Neon PostgreSQL or local PostgreSQL'),('blob','Private Blob or private local files')]),
 ('Background work',[('job','Durable database jobs'),('workflow','Vercel Workflow or local worker')])], [('next','auth'),('auth','service'),('job','workflow')])
diagram('usecases','CampusFix users and tasks',[
 ('Reporter',[('r1','Report a fault'),('r2','Follow and comment'),('r3','Confirm or dispute')]),
 ('Dispatcher',[('d1','Set priority'),('d2','Assign technician'),('d3','Merge and report')]),
 ('Technician',[('t1','Start assigned work'),('t2','Record parts and time'),('t3','Submit repair proof')]),
 ('Administrator',[('a1','Manage accounts'),('a2','Set reference data'),('a3','Review audit history')])])
diagram('entities','CampusFix data relationships',[
 ('People',[('u','User and session'),('t','Technician profile'),('s','Ticket subscriber')]),
 ('Core records',[('c','Category and location'),('k','Ticket'),('p','Optional main ticket')]),
 ('Ticket detail',[('w','Work log and comment'),('f','Private attachment'),('a','Audit event')]),
 ('Deferred work',[('n','User notification'),('d','Test delivery'),('j','Background job')])], [('n','d')])
diagram('swimlanes','CampusFix repair responsibilities',[
 ('Reporter',[('r1','Submit report'),('r2','Track progress'),('r3','Review repair'),('r4','Confirm or dispute')]),
 ('Facilities',[('d1','Review priority'),('d2','Assign qualified technician')]),
 ('Technician',[('t1','Start work'),('t2','Record repair'),('t3','Upload proof'),('t4','Complete repair')]),
 ('System',[('s1','Store audit and notices'),('s2','Check ticket version'),('s3','Close after 72 hours if undisputed')])], [('r1','r2'),('r2','r3'),('r3','r4'),('d1','d2'),('t1','t2'),('t2','t3'),('t3','t4')])

def clean(s):
    s=re.sub(r'\[([^]]+)\]\(([^)]+)\)',r'\1 (\2)',s)
    return s.replace('**','').replace('`','')

def rich(p, text):
    for token in re.split(r'(\*\*.*?\*\*|`[^`]+`|\[[^]]+\]\([^)]+\))',text):
        if not token: continue
        r=p.add_run(clean(token))
        if token.startswith('**'): r.bold=True
        if token.startswith('`'): r.font.name='Consolas'; r.font.size=Pt(9)

def shade(cell, fill):
    prop=cell._tc.get_or_add_tcPr(); node=OxmlElement('w:shd'); node.set(qn('w:fill'),fill);prop.append(node)

def make_table(doc, raw):
    values=[[clean(x.strip()) for x in line.strip().strip('|').split('|')]for line in raw]
    values=[v for v in values if not all(re.fullmatch(r'[:\- ]+',x or '-')for x in v)]
    cols=max(map(len,values));table=doc.add_table(rows=0,cols=cols)
    table.style='Table Grid';table.autofit=True
    for index, vals in enumerate(values):
        cells=table.add_row().cells
        prop=table.rows[-1]._tr.get_or_add_trPr(); prop.append(OxmlElement('w:cantSplit'))
        if index==0:
            prop.append(OxmlElement('w:tblHeader'))
        for i,cell in enumerate(cells):
            cell.text=vals[i] if i<len(vals) else ''
            for p in cell.paragraphs:
                p.paragraph_format.space_after=Pt(5);p.paragraph_format.space_before=Pt(5)
                for r in p.runs:
                    r.font.size=Pt(9)
                    if index==0:r.bold=True;r.font.color.rgb=RGBColor(255,255,255)
            shade(cell,'173B2E' if index==0 else ('F0F4EF' if index%2==0 else 'FFFFFF'))
    doc.add_paragraph().paragraph_format.space_after=Pt(0)

def picture(doc, file, alt):
    if not file.exists(): return
    w,h=Image.open(file).size
    width=min(6.75,6.5*w/h)
    p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next=True
    p.add_run().add_picture(str(file),width=Inches(width))
    cap=doc.add_paragraph(alt,style='Caption');cap.alignment=WD_ALIGN_PARAGRAPH.CENTER

def build(stem):
    doc=Document();section=doc.sections[0]
    section.top_margin=section.bottom_margin=Inches(.75)
    section.left_margin=section.right_margin=Inches(.75)
    section.page_width=Inches(8.5);section.page_height=Inches(11)
    normal=doc.styles['Normal'];normal.font.name='Arial';normal.font.size=Pt(10.5)
    normal.paragraph_format.space_after=Pt(7);normal.paragraph_format.line_spacing=1.08
    for name,size in [('Title',27),('Heading 1',16),('Heading 2',13),('Heading 3',11)]:
        st=doc.styles[name];st.font.name='Arial';st.font.size=Pt(size);st.font.color.rgb=RGBColor(0,0,0)
        st.paragraph_format.keep_with_next=True
    for style in doc.styles:
        for border in list(style.element.iter(qn('w:pBdr'))):
            border.getparent().remove(border)
    caption=doc.styles['Caption'];caption.font.color.rgb=RGBColor.from_string('41614B');caption.font.size=Pt(9);caption.font.bold=False
    header=section.header.paragraphs[0];header.text='CAMPUSFIX  |  CIT4001 COURSE DEMONSTRATION'
    for r in header.runs:r.font.size=Pt(8);r.font.color.rgb=RGBColor.from_string('41614B')
    foot=section.footer.paragraphs[0];foot.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    foot.add_run('CampusFix  |  ')
    field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');foot._p.append(field)
    lines=(DOCS/(stem+'.md')).read_text(encoding='utf8').splitlines()
    i=0;fig=0
    while i<len(lines):
        line=lines[i].strip()
        if not line:i+=1;continue
        if line.startswith('```'):
            lang=line[3:];code=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):code.append(lines[i]);i+=1
            if lang=='mermaid':
                joined='\n'.join(code)
                kind='erd' if 'erDiagram' in joined else ('class' if 'classDiagram' in joined else ('swimlanes' if 'subgraph Reporter' in joined else ('usecases' if 'Submit([Report fault])' in joined else 'architecture')))
                file=FIGS/(kind+'-mermaid.png')
                if not file.exists():file=FIGS/(('entities' if kind in ['erd','class'] else kind)+'.png')
                picture(doc,file,f'Figure {fig+1} {kind.replace("usecases","users and tasks")}')
                fig+=1
                doc.add_paragraph('The companion Markdown file contains the editable diagram and exact relationships.')
            else:
                for x in code:
                    p=doc.add_paragraph();p.paragraph_format.space_after=Pt(1)
                    r=p.add_run(x);r.font.name='Consolas';r.font.size=Pt(8)
            i+=1;continue
        if line.startswith('|'):
            raw=[]
            while i<len(lines) and lines[i].strip().startswith('|'):raw.append(lines[i]);i+=1
            make_table(doc,raw);continue
        match=re.fullmatch(r'!\[([^]]*)\]\(([^)]+)\)',line)
        if match:
            picture(doc,DOCS/match[2],match[1]);i+=1;continue
        if line.startswith('#'):
            level=len(line)-len(line.lstrip('#'));title=re.sub(r'[^\w ]','',line.lstrip('#').strip())
            doc.add_paragraph(title,style='Title' if level==1 else f'Heading {min(level-1,3)}')
            i+=1;continue
        if line.startswith('- ') or re.match(r'^\d+\. ',line):
            numbered=bool(re.match(r'^\d+\. ',line))
            p=doc.add_paragraph(style='Normal' if numbered else 'List Bullet')
            if numbered:
                p.paragraph_format.left_indent=Inches(.2);p.paragraph_format.first_line_indent=Inches(-.2)
                p.paragraph_format.space_after=Pt(0);p.paragraph_format.space_before=Pt(0)
            rich(p,line if numbered else line[2:]);i+=1;continue
        paragraph=[line];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||```|!\[|- |\d+\. )',lines[i]):paragraph.append(lines[i].strip());i+=1
        rich(doc.add_paragraph(),' '.join(paragraph))
    doc.core_properties.title=lines[0].lstrip('# ').strip()
    doc.core_properties.subject='CIT4001 implementation and testing evidence'
    doc.core_properties.author='CampusFix project group'
    out=DOCS/'word';out.mkdir(exist_ok=True)
    doc.save(out/(stem+'.docx'))
    print('Created',stem+'.docx')

for stem in ['CampusFix_Software_Implementation_Report','CampusFix_Programme_Manual','CampusFix_User_Manual']:
    build(stem)
````

## scripts/cloud-configure.ts

````ts
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
````

## scripts/cloud-prepare.ts

````ts
import { config } from "dotenv";
config({ path: ".env.vercel.local", override: true, quiet: true });
const url = new URL(process.env.DATABASE_URL ?? "");
if (!url.hostname.endsWith(".neon.tech"))
  throw new Error("The cloud setup requires the linked Neon database.");
const { migrate } = await import("./migrate");
const { seed } = await import("./seed");
const { closeDatabase } = await import("../src/db");
await migrate();
await seed();
await closeDatabase();
console.log("The linked Neon database is ready. No credentials were printed.");
````

## scripts/deployment-evidence.ts

````ts
import { config } from "dotenv";
import assert from "node:assert/strict";
import pg from "pg";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
config({ path: ".env.vercel.local", quiet: true });
const base = "https://campusfix-seven-iota.vercel.app";
const health = await fetch(base + "/api/health");
const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify({
    identifier: "student@utech.edu.jm",
    password: "CampusFix2026!",
  }),
});
const rawCookie =
  login.headers
    .getSetCookie()
    .find((c) => c.startsWith("campusfix_session=")) ?? "";
const cookie = rawCookie.split(";")[0];
assert.equal(health.status, 200);
assert.equal(login.status, 200);
assert.match(rawCookie, /;\s*Secure/i);
assert.match(rawCookie, /;\s*HttpOnly/i);
assert.match(rawCookie, /SameSite=lax/i);
const session = await fetch(base + "/api/session", {
  headers: { Cookie: cookie },
});
await fetch(base + "/api/auth/logout", {
  method: "POST",
  headers: { Cookie: cookie, Origin: base },
});
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const jobs = (
  await c.query(
    "SELECT kind,status,count(*)::int AS count,count(workflow_run_id)::int AS linked_workflows FROM background_jobs GROUP BY kind,status ORDER BY kind,status",
  )
).rows;
const delivery = (
  await c.query(
    "SELECT status,count(*)::int AS count FROM notification_deliveries GROUP BY status ORDER BY status",
  )
).rows;
const schema = (
  await c.query(
    "SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
  )
).rows[0];
await c.end();
const original = await readFile(
  "../CampusFix_Programme_Manual_Data_Design.sql",
);
const baseline = await readFile("db/migrations/0001_course_baseline.sql");
await writeFile(
  "docs/evidence/deployment.json",
  JSON.stringify(
    {
      runAt: new Date().toISOString(),
      url: base,
      team: "campusfix7",
      selectedPlans: {
        vercel: "Hobby",
        neon: "Free free_v3",
        blob: "Private store in iad1",
      },
      healthStatus: health.status,
      health: await health.json(),
      loginStatus: login.status,
      sessionStatus: session.status,
      sessionCookie: {
        secure: /;\s*Secure/i.test(rawCookie),
        httpOnly: /;\s*HttpOnly/i.test(rawCookie),
        sameSiteLax: /SameSite=lax/i.test(rawCookie),
      },
      schema,
      jobs,
      delivery,
      live72HourWaitObserved: false,
    },
    null,
    2,
  ),
);
await writeFile(
  "docs/evidence/course-sql-integrity.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      unchangedCopy: original.equals(baseline),
      sha256: createHash("sha256").update(original).digest("hex"),
      original: "../CampusFix_Programme_Manual_Data_Design.sql",
      copy: "db/migrations/0001_course_baseline.sql",
    },
    null,
    2,
  ),
);
console.log(
  "Saved hosted checks, Workflow totals, cookie flags, and baseline integrity. No secrets were saved.",
);
````

## scripts/docker-check.ts

````ts
import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import sharp from "sharp";
import { sql } from "drizzle-orm";
const run = promisify(execFile);
// Use only the isolated check container, never the main presentation database.
process.env.DATABASE_URL =
  "postgresql://campusfix:campusfix-local-only@127.0.0.1:55433/campusfix";
process.env.STORAGE_DRIVER = "local";
const { migrate } = await import("./migrate");
const { seed } = await import("./seed");
const { one, closeDatabase } = await import("../src/db");
const { createTicket } = await import("../src/lib/tickets");
const { saveLocalPhoto } = await import("../src/lib/storage");
const { login } = await import("../src/lib/auth");
type User = import("../src/lib/domain").User;
await migrate();
await seed();
const user = (await one<User>(
  sql`SELECT * FROM users WHERE email='student@utech.edu.jm'`,
))!;
const category = (await one<{ category_id: string }>(
  sql`SELECT category_id FROM categories WHERE category_name='Electrical'`,
))!;
const location = (await one<{ location_id: string }>(
  sql`SELECT location_id FROM locations ORDER BY location_id LIMIT 1`,
))!;
const photo = await sharp({
  create: { width: 32, height: 32, channels: 3, background: "#557b60" },
})
  .png()
  .toBuffer();
const attachment = await saveLocalPhoto(
  user,
  new File([new Uint8Array(photo)], "restart-proof.png", { type: "image/png" }),
  "BEFORE",
);
const report = await createTicket(user, {
  categoryId: category.category_id,
  locationId: location.location_id,
  title: `Restart check ${randomUUID().slice(0, 8)}`,
  description: "This is a controlled restart check for the course application.",
  urgency: "LOW",
  submissionKey: randomUUID(),
  attachmentId: attachment!.attachment_id as string,
});
const token = await login({
  identifier: user.email,
  password: "CampusFix2026!",
});
await closeDatabase();
const url = "http://localhost:3002";
let server: ChildProcess | undefined;
async function start() {
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", "3002"],
    {
      env: { ...process.env, APP_URL: url },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error("The restart check server exited.");
    try {
      if ((await fetch(url + "/api/health")).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("The restart check server did not start.");
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const stopped = new Promise<void>((resolve) =>
    server!.once("exit", () => resolve()),
  );
  server.kill("SIGTERM");
  await stopped;
}
const headers = { Cookie: `campusfix_session=${token}` };
async function read() {
  const response = await fetch(`${url}/api/tickets/${report.ticketId}`, {
    headers,
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  const image = await fetch(
    `${url}/api/attachments/${attachment!.attachment_id}`,
    { headers },
  );
  assert.equal(image.status, 200);
  return {
    ticket: data.ticket,
    attachments: data.attachments,
    photoHash: createHash("sha256")
      .update(Buffer.from(await image.arrayBuffer()))
      .digest("hex"),
  };
}
try {
  await start();
  const before = await read();
  await stop();
  await run("docker", ["compose", "-p", "campusfix-check", "restart", "db"], {
    env: { ...process.env, CAMPUSFIX_DB_PORT: "55433" },
    timeout: 60000,
  });
  await start();
  const after = await read();
  assert.deepEqual(after, before);
  await mkdir("docs/evidence", { recursive: true });
  await writeFile(
    "docs/evidence/persistence.json",
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        passed: true,
        database:
          "PostgreSQL 16 in isolated Docker container campusfix-check-db-1",
        application: "Next.js production server on local port 3002",
        operations: [
          "Create a ticket with a validated PNG",
          "Read its private photo and ticket using the real HTTP API",
          "Stop the application server",
          "Restart the PostgreSQL container",
          "Start a new application process",
          "Read using the persisted session and compare the ticket, attachment metadata, and photo hash",
        ],
        ticketId: report.ticketId,
        photoSha256: after.photoHash,
      },
      null,
      2,
    ),
  );
  console.log(
    "Application and Docker database restart check passed. Ticket, session, and private photo survived.",
  );
} finally {
  await stop();
  await closeDatabase();
}
````

## scripts/document-qa.py

````py
"""Rasterise Word-exported PDFs for page-by-page visual review."""
from pathlib import Path
import json
import pypdfium2 as pdfium
from PIL import Image, ImageOps, ImageDraw
root=Path(__file__).resolve().parents[1]/'.data'/'document-qa'
evidence=[]
for file in root.glob('*.pdf'):
    pdf=pdfium.PdfDocument(file)
    folder=root/file.stem;folder.mkdir(exist_ok=True)
    thumbs=[]
    for i,page in enumerate(pdf):
        image=page.render(scale=1.5).to_pil().convert('RGB')
        image.save(folder/f'page-{i+1}.png')
        thumb=ImageOps.contain(image,(306,396))
        tile=Image.new('RGB',(326,426),'#e6eae6');tile.paste(thumb,((326-thumb.width)//2,15))
        ImageDraw.Draw(tile).text((12,410),f'Page {i+1}',fill='black')
        thumbs.append(tile)
    for start in range(0,len(thumbs),12):
        subset=thumbs[start:start+12];rows=(len(subset)+2)//3
        sheet=Image.new('RGB',(978,426*rows),'white')
        for j,tile in enumerate(subset):sheet.paste(tile,((j%3)*326,(j//3)*426))
        sheet.save(folder/f'montage-{start//12+1}.png')
    evidence.append({'document':file.stem+'.docx','pages':len(pdf),'renderer':'Microsoft Word PDF export and pypdfium2','review':'Page PNGs created for visual review'})
    print(file.stem,len(pdf),'pages')
(root/'manifest.json').write_text(json.dumps(evidence,indent=2))
````

## scripts/evidence.ts

````ts
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
````

## scripts/jobs.ts

````ts
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
````

## scripts/load.ts

````ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import pg from "pg";
import { chromium } from "@playwright/test";
const base = process.env.LOAD_BASE_URL ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error(
    "Run the 500-client load test against the local presentation copy only.",
  );
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.ceil(values.length * p) - 1)
  ];
const summarize = (values: number[]) => ({
  samples: values.length,
  minMs: Math.round(Math.min(...values)),
  p50Ms: Math.round(percentile(values, 0.5)),
  p95Ms: Math.round(percentile(values, 0.95)),
  maxMs: Math.round(Math.max(...values)),
});
const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify({
    identifier: "student@utech.edu.jm",
    password: process.env.DEMO_PASSWORD ?? "CampusFix2026!",
  }),
});
if (!login.ok) throw new Error("The demo account could not sign in.");
const cookie = login.headers
  .getSetCookie()
  .find((value) => value.startsWith("campusfix_session="))!
  .split(";")[0];
await fetch(base + "/api/dashboard", { headers: { Cookie: cookie } });
const durations: number[] = [];
let failed = 0;
const begin = performance.now();
await Promise.all(
  Array.from({ length: 500 }, async () => {
    const start = performance.now();
    try {
      const response = await fetch(base + "/api/dashboard", {
        headers: { Cookie: cookie },
      });
      await response.arrayBuffer();
      if (!response.ok) failed++;
    } catch {
      failed++;
    }
    durations.push(performance.now() - start);
  }),
);
const elapsed = performance.now() - begin;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const queryTimes: number[] = [];
for (let i = 0; i < 100; i++) {
  const start = performance.now();
  await client.query(
    "SELECT t.ticket_id,t.status,l.building_name,c.category_name FROM tickets t JOIN locations l USING(location_id) JOIN categories c USING(category_id) ORDER BY t.created_at DESC LIMIT 25",
  );
  queryTimes.push(performance.now() - start);
}
const version = (await client.query("SHOW server_version")).rows[0]
  .server_version;
await client.end();
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies([
  { name: "campusfix_session", value: cookie.split("=")[1], url: base },
]);
const page = await context.newPage();
const navigationTimes: number[] = [];
for (let i = 0; i < 5; i++) {
  const start = performance.now();
  await page.goto(base + "/app");
  await page.getByRole("heading", { name: "Hello, Avery." }).waitFor();
  await page.locator(".stats-row").waitFor();
  navigationTimes.push(performance.now() - start);
}
await browser.close();
await fetch(base + "/api/auth/logout", {
  method: "POST",
  headers: { Cookie: cookie, Origin: base },
});
const evidence = {
  runAt: new Date().toISOString(),
  mode: process.env.LOAD_MODE ?? "local development",
  environment: {
    platform: os.platform(),
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    totalMemoryGb: Math.round(os.totalmem() / 1024 ** 3),
    node: process.version,
    postgres: version,
  },
  scenario:
    "500 simultaneous authenticated dashboard requests. Clients share one demo account. No login load or hosted load was tested.",
  api: {
    ...summarize(durations),
    failed,
    elapsedMs: Math.round(elapsed),
    targetP95Ms: 2000,
    targetMet: failed === 0 && percentile(durations, 0.95) <= 2000,
  },
  database: {
    ...summarize(queryTimes),
    query: "Latest 25 reports with category and location joins",
    targetP95Ms: 500,
    targetMet: percentile(queryTimes, 0.95) <= 500,
  },
  navigation: {
    ...summarize(navigationTimes),
    targetP95Ms: 2000,
    targetMet: percentile(navigationTimes, 0.95) <= 2000,
  },
};
await mkdir("docs/evidence", { recursive: true });
await writeFile(
  "docs/evidence/performance.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(JSON.stringify(evidence, null, 2));
````

## scripts/local-db.ts

````ts
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const databaseDir = path.resolve(".data/postgres");
const server = new EmbeddedPostgres({
  databaseDir,
  user: "campusfix",
  password: "campusfix-local-only",
  port: 55432,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  autoRehydrateSymlinks: true,
  onLog: (message) => {
    if (
      /ready to accept connections|database system is shut down/.test(message)
    )
      console.log(message);
  },
});
if (!existsSync(path.join(databaseDir, "PG_VERSION")))
  await server.initialise();
await server.start();
const client = new pg.Client({
  connectionString:
    "postgresql://campusfix:campusfix-local-only@127.0.0.1:55432/postgres",
});
await client.connect();
for (const name of ["campusfix", "campusfix_test"])
  if (
    !(await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]))
      .rowCount
  )
    await client.query(`CREATE DATABASE ${name}`);
await client.end();
console.log(
  "CampusFix PostgreSQL is ready on 127.0.0.1:55432. Keep this terminal running.",
);
const stop = async () => {
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("message", (message) => {
  if (message === "shutdown") void stop();
});
setInterval(() => {}, 60_000);
````

## scripts/local.ts

````ts
import { config } from "dotenv";
import { existsSync, copyFileSync } from "node:fs";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import pg from "pg";
if (!existsSync(".env.local")) copyFileSync(".env.example", ".env.local");
config({ path: ".env.local", quiet: true });
const children: ChildProcess[] = [];
let managedDatabase: ChildProcess | undefined;
const run = (args: string[], ipc = false) => {
  const child = spawn(process.execPath, args, {
    stdio: ipc ? ["inherit", "inherit", "inherit", "ipc"] : "inherit",
    windowsHide: true,
  });
  children.push(child);
  return child;
};
async function reachable() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 1000,
  });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}
if (!(await reachable())) {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "55432"
  )
    throw new Error(
      "The configured database is not reachable. Check DATABASE_URL.",
    );
  managedDatabase = run(
    ["node_modules/tsx/dist/cli.mjs", "scripts/local-db.ts"],
    true,
  );
  const deadline = Date.now() + 60_000;
  while (!(await reachable())) {
    if (Date.now() > deadline)
      throw new Error(
        "PostgreSQL did not start. Run npm run db:start to inspect its log.",
      );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
const { migrate } = await import("./migrate");
const { seed } = await import("./seed");
const { closeDatabase } = await import("../src/db");
await migrate();
await seed();
await closeDatabase();
run(["node_modules/tsx/dist/cli.mjs", "scripts/jobs.ts"]);
const web = run(["node_modules/next/dist/bin/next", "dev"]);
console.log("Open http://localhost:3000. Use Ctrl+C to stop CampusFix.");
const stop = () => {
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (child === managedDatabase && child.connected) {
      child.send("shutdown");
      continue;
    }
    if (process.platform === "win32")
      execFile(
        "taskkill",
        ["/pid", String(child.pid), "/t", "/f"],
        { windowsHide: true },
        () => {},
      );
    else child.kill("SIGTERM");
  }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
web.on("exit", (code) => {
  stop();
  process.exitCode = code ?? 0;
});
````

## scripts/migrate.ts

````ts
import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export async function migrate(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("Set DATABASE_URL in .env.local first.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(8024001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS campusfix_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    for (const name of (await readdir("db/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (
          await client.query(
            "SELECT 1 FROM campusfix_migrations WHERE name=$1",
            [name],
          )
        ).rowCount
      )
        continue;
      await client.query("BEGIN");
      try {
        await client.query(
          await readFile(path.join("db/migrations", name), "utf8"),
        );
        await client.query(
          "INSERT INTO campusfix_migrations(name) VALUES ($1)",
          [name],
        );
        await client.query("COMMIT");
        console.log(`Applied ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}
if (process.argv[1]?.endsWith("migrate.ts")) await migrate();
````

## scripts/organize-imports.ts

````ts
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const configPath = ts.findConfigFile(".", ts.sys.fileExists)!;
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  path.dirname(configPath),
);
const files = config.fileNames.filter(
  (file) => !file.includes(".well-known") && !file.includes(".next"),
);
const host: ts.LanguageServiceHost = {
  getScriptFileNames: () => files,
  getScriptVersion: () => "0",
  getScriptSnapshot: (file) =>
    ts.sys.fileExists(file)
      ? ts.ScriptSnapshot.fromString(ts.sys.readFile(file)!)
      : undefined,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getCompilationSettings: () => config.options,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
};
const service = ts.createLanguageService(host);
for (const file of files) {
  for (const change of service.organizeImports(
    { type: "file", fileName: file },
    {},
    {},
  )) {
    let content = fs.readFileSync(change.fileName, "utf8");
    for (const edit of [...change.textChanges].sort(
      (a, b) => b.span.start - a.span.start,
    ))
      content =
        content.slice(0, edit.span.start) +
        edit.newText +
        content.slice(edit.span.start + edit.span.length);
    fs.writeFileSync(change.fileName, content);
  }
}
service.dispose();
````

## scripts/package-submission.py

````py
"""Create a portable source and evidence package without local data or secrets."""
from pathlib import Path
import os
import zipfile
import hashlib
import json
root=Path(__file__).resolve().parents[1]
output=root.parent/'CampusFix_Course_Submission_2026-10-30.zip'
skip_dirs={'node_modules','.data','.git','.next','.vercel','.workflow-data','.agents','.playwright-mcp','test-results','playwright-report','introspection','__pycache__'}
files=[]
for current,dirs,names in os.walk(root):
    dirs[:]=[x for x in dirs if x not in skip_dirs and not (x=='.well-known' and Path(current).name=='app')]
    for name in names:
        if name.startswith('.env') and name!='.env.example':continue
        if name.endswith('.tsbuildinfo') or name.endswith('.log') or name=='skills-lock.json':continue
        file=Path(current)/name
        if file.relative_to(root).as_posix()=='docs/evidence/submission-package.json':continue
        files.append(file)
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6)as archive:
    for file in files:archive.write(file,Path('campusfix')/file.relative_to(root))
with zipfile.ZipFile(output)as archive:
    bad=[x for x in archive.namelist()if '/.data/'in x or '/node_modules/'in x or (Path(x).name.startswith('.env')and Path(x).name!='.env.example')]
    if bad:raise RuntimeError('Private files were found in the package')
    if archive.testzip():raise RuntimeError('The package failed its CRC check')
manifest={'createdAt':'2026-10-30','archive':output.name,'files':len(files),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'privateDataIncluded':False,'dependenciesIncluded':False,'setup':'Extract campusfix, run npm ci, then npm run local. See README.md.'}
(root/'docs'/'evidence'/'submission-package.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest,indent=2))
````

## scripts/prepare.ts

````ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const { migrate } = await import("./migrate");
const { seed } = await import("./seed");
const { closeDatabase } = await import("../src/db");
await migrate();
await seed();
await closeDatabase();
````

## scripts/render-diagrams.ts

````ts
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
````

## scripts/render-documents.ps1

````ps1
# Native Word fallback for a Windows host without LibreOffice.
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$wordRoot = Join-Path $taskRoot 'docs\word'
$qaRoot = Join-Path $taskRoot '.data\document-qa'
New-Item -ItemType Directory -Force -Path $qaRoot | Out-Null
$wordApp = New-Object -ComObject Word.Application
$wordApp.Visible = $false
$wordApp.DisplayAlerts = 0
$wordApp.AutomationSecurity = 3
try {
  Get-ChildItem -LiteralPath $wordRoot -Filter '*.docx' | ForEach-Object {
    $document = $wordApp.Documents.Open($_.FullName, $false, $true)
    try {
      $pdfPath = Join-Path $qaRoot ($_.BaseName + '.pdf')
      $document.ExportAsFixedFormat($pdfPath, 17)
      Write-Output ('Rendered ' + $_.Name)
    } finally { $document.Close(0) }
  }
} finally { $wordApp.Quit(); [Runtime.InteropServices.Marshal]::ReleaseComObject($wordApp) | Out-Null }
````

## scripts/seed.ts

````ts
import { hash } from "bcryptjs";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { closeDatabase, database, one, rows } from "../src/db";
import {
  slaDeadline,
  type Priority,
  type Role,
  type Trade,
} from "../src/lib/domain";
config({ path: ".env.local", quiet: true });

export async function seed() {
  const password = await hash(
    process.env.DEMO_PASSWORD ?? "CampusFix2026!",
    12,
  );
  await database().transaction(async (tx) => {
    if (
      (await one<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM users`,
        tx,
      ))!.count > 0
    ) {
      console.log("Seed skipped. Accounts already exist.");
      return;
    }
    const people: [string, string, string, Role, Trade?][] = [
      ["student", "Avery Campbell", "2601001", "STUDENT"],
      ["staff", "Jordan Reid", "STF1001", "STAFF"],
      ["technician", "Morgan Ellis", "TEC1001", "TECHNICIAN", "ELECTRICAL"],
      ["plumber", "Taylor Grant", "TEC1002", "TECHNICIAN", "PLUMBING"],
      [
        "hvac",
        "Casey Brooks",
        "TEC1003",
        "TECHNICIAN",
        "HVAC_AIR_CONDITIONING",
      ],
      ["carpenter", "Riley Clarke", "TEC1004", "TECHNICIAN", "CARPENTRY"],
      ["it", "Alex Bennett", "TEC1005", "TECHNICIAN", "IT_AUDIOVISUAL"],
      ["electrical2", "Sam Palmer", "TEC1006", "TECHNICIAN", "ELECTRICAL"],
      ["dispatcher", "Jamie Robinson", "FMD1001", "FMD_DISPATCHER"],
      ["admin", "Robin Williams", "ADM1001", "FMD_ADMIN"],
    ];
    const ids: Record<string, string> = {};
    for (const [alias, name, id, role, trade] of people) {
      ids[alias] = randomUUID();
      await rows(
        sql`INSERT INTO users(user_id,institutional_id,full_name,email,phone_number,password_hash,role,pref_sms) VALUES (${ids[alias]}::uuid,${id},${name},${alias + "@utech.edu.jm"},'',${password},${role},${role === "STUDENT"})`,
        tx,
      );
      if (trade)
        await rows(
          sql`INSERT INTO technicians(tech_id,trade_specialty) VALUES (${ids[alias]}::uuid,${trade})`,
          tx,
        );
    }
    const categories: [string, Trade][] = [
      ["Electrical", "ELECTRICAL"],
      ["Plumbing", "PLUMBING"],
      ["Air conditioning", "HVAC_AIR_CONDITIONING"],
      ["Furniture and fittings", "CARPENTRY"],
      ["Buildings and grounds", "MASONRY_STRUCTURAL"],
      ["IT and classroom equipment", "IT_AUDIOVISUAL"],
      ["Cleaning", "GENERAL_CLEANING"],
    ];
    const categoryIds: Record<string, string> = {};
    for (const [name, trade] of categories) {
      categoryIds[name] = randomUUID();
      await rows(
        sql`INSERT INTO categories(category_id,category_name,trade_specialty) VALUES (${categoryIds[name]}::uuid,${name},${trade})`,
        tx,
      );
    }
    const spaces: [string, string, string][] = [
      ["FENC", "SCIT Building 2B", "Computer Lab 3"],
      ["FENC", "SCIT Building 2B", "Lecture Room 2B-04"],
      ["FENC", "Engineering Workshop", "Workshop 1B"],
      ["FOBM", "Business School", "Lecture Room B-12"],
      ["CML", "Calvin McKain Library", "Study Area 2"],
      ["RES", "Hall A", "Common Room"],
      ["FOSS", "Science Block", "Lab S-03"],
      ["COHS", "Health Sciences Building", "Room H-05"],
      ["FENC", "SCIT Building 2B", "Ground Floor Restroom"],
      ["CML", "Calvin McKain Library", "Main Entrance"],
    ];
    const locationIds: string[] = [];
    for (const [faculty, building, room] of spaces) {
      const id = randomUUID();
      locationIds.push(id);
      await rows(
        sql`INSERT INTO locations(location_id,faculty_code,building_name,room_number) VALUES (${id}::uuid,${faculty},${building},${room})`,
        tx,
      );
    }
    const tickets: [
      string,
      string,
      number,
      Priority,
      string,
      string | null,
      number,
    ][] = [
      [
        "Flickering lights in Computer Lab 3",
        "Electrical",
        0,
        "P2_URGENT",
        "IN_PROGRESS",
        "technician",
        3,
      ],
      [
        "Water leak under the restroom sink",
        "Plumbing",
        8,
        "P2_URGENT",
        "ASSIGNED",
        "plumber",
        5,
      ],
      [
        "Projector has no display signal",
        "IT and classroom equipment",
        1,
        "P3_ROUTINE",
        "PENDING",
        null,
        1,
      ],
      [
        "Exposed cable near workshop entrance",
        "Electrical",
        2,
        "P1_CRITICAL",
        "PENDING",
        null,
        0.5,
      ],
      [
        "Air conditioner is not cooling",
        "Air conditioning",
        3,
        "P2_URGENT",
        "ASSIGNED",
        "hvac",
        8,
      ],
      [
        "Loose legs on a study table",
        "Furniture and fittings",
        4,
        "P3_ROUTINE",
        "IN_PROGRESS",
        "carpenter",
        28,
      ],
      [
        "Water tap will not turn off",
        "Plumbing",
        5,
        "P2_URGENT",
        "PENDING",
        null,
        26,
      ],
      [
        "Broken chair in the science lab",
        "Furniture and fittings",
        6,
        "P3_ROUTINE",
        "PENDING",
        null,
        4,
      ],
      [
        "Ceiling light has stopped working",
        "Electrical",
        7,
        "P3_ROUTINE",
        "ASSIGNED",
        "electrical2",
        20,
      ],
      [
        "Entrance step needs repair",
        "Buildings and grounds",
        9,
        "P3_ROUTINE",
        "PENDING",
        null,
        76,
      ],
      [
        "Classroom floor needs cleaning",
        "Cleaning",
        1,
        "P3_ROUTINE",
        "PENDING",
        null,
        2,
      ],
      [
        "Library outlet has a damaged cover",
        "Electrical",
        4,
        "P2_URGENT",
        "IN_PROGRESS",
        "technician",
        12,
      ],
    ];
    for (let i = 0; i < tickets.length; i++) {
      const [title, category, loc, priority, status, tech, hours] = tickets[i];
      const id = `CF-2026-${1041 + i}`;
      const created = new Date(Date.now() - hours * 3600000);
      await rows(
        sql`INSERT INTO tickets(ticket_id,reporter_id,category_id,location_id,title,description,priority,status,assigned_tech_id,reporter_urgency,created_at,assigned_at,sla_deadline) VALUES (${id},${i % 3 === 1 ? ids.staff : ids.student}::uuid,${categoryIds[category]}::uuid,${locationIds[loc]}::uuid,${title},${title + ". Please inspect this area and arrange a repair. This is a demonstration report."},${priority},${status},${tech ? ids[tech] : null}::uuid,${priority === "P1_CRITICAL" ? "HIGH" : priority === "P2_URGENT" ? "MEDIUM" : "LOW"},${created},${tech ? new Date(created.getTime() + 10 * 60000) : null},${slaDeadline(created, priority)})`,
        tx,
      );
      await rows(
        sql`INSERT INTO audit_logs(actor_id,event_code,ticket_id,details,created_at) VALUES (${i % 3 === 1 ? ids.staff : ids.student}::uuid,'TICKET_CREATED',${id},'Demonstration report received.',${created})`,
        tx,
      );
      if (tech)
        await rows(
          sql`INSERT INTO audit_logs(actor_id,event_code,ticket_id,details,created_at) VALUES (${ids.dispatcher}::uuid,'TICKET_ASSIGNED',${id},'Assigned to a qualified technician.',${new Date(created.getTime() + 10 * 60000)})`,
          tx,
        );
      if (status === "IN_PROGRESS")
        await rows(
          sql`INSERT INTO audit_logs(actor_id,event_code,ticket_id,details,created_at) VALUES (${ids[tech!]}::uuid,'WORK_STARTED',${id},'The technician started work on this repair.',${new Date(created.getTime() + 20 * 60000)})`,
          tx,
        );
    }
    await rows(sql`SELECT setval('ticket_number_seq',1052)`, tx);
    await rows(
      sql`UPDATE technicians p SET active_workload=(SELECT COUNT(*) FROM tickets t WHERE t.assigned_tech_id=p.tech_id AND t.status IN ('ASSIGNED','IN_PROGRESS'))`,
      tx,
    );
    await rows(
      sql`INSERT INTO notifications(user_id,ticket_id,event_code,title,body) VALUES (${ids.student}::uuid,'CF-2026-1041','WORK_STARTED','Work has started','Morgan Ellis is checking the lights in Computer Lab 3.')`,
      tx,
    );
    console.log(
      "Demo data created. See README.md for the demo sign-in details.",
    );
  });
}
if (process.argv[1]?.endsWith("seed.ts")) {
  await seed();
  await closeDatabase();
}
````

## scripts/source-listing.ts

````ts
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
````

## scripts/ui-review.ts

````ts
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
````

## scripts/whitebox.ts

````ts
import ts from "typescript";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
const modules = [
  {
    id: "AUTH",
    name: "accountAccess",
    file: "src/lib/policies.ts",
    labels: ["Inactive?", "No lock?", "Lock is in future?"],
    outcomes: ["INACTIVE", "OPEN", "LOCKED", "OPEN"],
    cases: [
      "Inactive account",
      "Active, no lock",
      "Active, future lock",
      "Active, expired lock",
    ],
    predicates: 3,
    sequential: false,
  },
  {
    id: "PHOTO",
    name: "validatePhotoSize",
    file: "src/lib/domain.ts",
    labels: ["Size is not an integer?", "Size below 1?", "Size above 4500000?"],
    outcomes: ["Reject", "Reject", "Reject", "Accept size"],
    cases: ["1.5 bytes", "0 bytes", "4500001 bytes", "4500000 bytes"],
    predicates: 3,
    sequential: false,
  },
  {
    id: "DISPATCH",
    name: "priorityHours",
    file: "src/lib/policies.ts",
    labels: ["Priority P1?", "Priority P2?"],
    outcomes: ["4 hours", "24 hours", "72 hours"],
    cases: ["P1_CRITICAL", "P2_URGENT", "P3_ROUTINE"],
    predicates: 2,
    sequential: false,
  },
  {
    id: "REPAIR",
    name: "completionDecision",
    file: "src/lib/policies.ts",
    labels: ["Another technician?", "Work not started?", "No verified proof?"],
    outcomes: ["FORBIDDEN", "NOT_STARTED", "MISSING_PROOF", "READY"],
    cases: [
      "Other technician",
      "Assigned state",
      "In progress, no proof",
      "In progress, proof present",
    ],
    predicates: 3,
    sequential: false,
  },
  {
    id: "NOTIFY",
    name: "deliveryChannels",
    file: "src/lib/policies.ts",
    labels: ["Email enabled?", "SMS enabled?"],
    outcomes: ["Append EMAIL", "Append SMS", "Return channels"],
    cases: ["false, false => []", "true, false => EMAIL", "false, true => SMS"],
    predicates: 2,
    sequential: true,
  },
  {
    id: "CSV",
    name: "csvCell",
    file: "src/lib/reports.ts",
    labels: ["Value present?", "Formula prefix?"],
    outcomes: ["Convert to text", "Add apostrophe", "Quote and escape"],
    cases: [
      "null => empty quoted cell",
      "Plain text => quoted text",
      "=HYPERLINK(1) => escaped formula",
    ],
    predicates: 2,
    sequential: true,
  },
];
await mkdir("docs/graphs", { recursive: true });
const out = [
  "# White-box test evidence",
  "",
  "Scope: one production decision routine from each assessed module. These graphs do not describe the complexity of the whole application. The routines are called by the production services. The tests also exercise the full services with PostgreSQL.",
  "",
  "Method 1: V(G) = E - N + 2. Method 2: V(G) = P + 1, where P is the count of binary decision nodes. Method 3: V(G) is the number of graph regions, including the outside region. Each graph below is connected and has one exit. Throw and return edges both lead to that exit.",
  "",
];
for (const m of modules) {
  const source = await readFile(m.file, "utf8");
  const ast = ts.createSourceFile(m.file, source, ts.ScriptTarget.Latest, true);
  let fn: ts.FunctionDeclaration | undefined;
  ast.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === m.name) fn = n;
  });
  if (!fn?.body) throw new Error(`Routine missing: ${m.name}`);
  let decisions = 0;
  const visit = (n: ts.Node) => {
    if (ts.isIfStatement(n)) decisions++;
    n.forEachChild(visit);
  };
  visit(fn.body);
  if (decisions !== m.predicates)
    throw new Error(
      `Update the graph for ${m.name}. Its decision count changed.`,
    );
  const nodes = m.sequential ? 7 : m.predicates * 2 + 3;
  const edges = nodes + decisions - 1;
  const exit = nodes;
  const code = ["flowchart TD", "  n1([1 Start])"];
  const graphEdges: [number, number, string?][] = [[1, 2]];
  for (let i = 0; i < decisions; i++) {
    const d = 2 + i * 2,
      b = d + 1;
    code.push(`  n${d}{${d} ${m.labels[i]}}`, `  n${b}[${b} ${m.outcomes[i]}]`);
    graphEdges.push([d, b, "Yes"]);
    if (m.sequential) {
      graphEdges.push([d, d + 2, "No"], [b, d + 2]);
    } else graphEdges.push([d, d + 2, "No"], [b, exit]);
  }
  const last = nodes - 1;
  code.push(
    `  n${last}[${last} ${m.outcomes.at(-1)}]`,
    `  n${exit}([${exit} Exit])`,
  );
  graphEdges.push([last, exit]);
  for (const [a, b, label] of graphEdges)
    code.push(`  n${a} -->${label ? `|${label}|` : ""} n${b}`);
  if (graphEdges.length !== edges)
    throw new Error(`Edge count mismatch: ${m.name}`);
  const paths = m.sequential
    ? [
        "1,2,4,6,7",
        "1,2,3,4,6,7",
        m.id === "CSV" ? "1,2,3,4,5,6,7" : "1,2,4,5,6,7",
      ]
    : Array.from({ length: decisions + 1 }, (_, i) =>
        [
          1,
          ...Array.from({ length: i + 1 }, (_, j) => 2 + j * 2).filter(
            (n) => n <= last,
          ),
          ...(i < decisions ? [3 + i * 2] : []),
          exit,
        ].join(","),
      );
  const line = ast.getLineAndCharacterOfPosition(fn.getStart()).line + 1;
  const pseudocode = m.sequential
    ? [
        m.id === "CSV"
          ? "SET text to an empty string"
          : "SET channels to an empty list",
        ...m.labels.map(
          (condition, i) => `IF ${condition} THEN ${m.outcomes[i]}`,
        ),
        m.outcomes.at(-1)!,
        "END",
      ]
    : [
        "START",
        ...m.labels.map(
          (condition, i) =>
            `IF ${condition} THEN ${m.id === "PHOTO" ? "REJECT input and exit" : "RETURN " + m.outcomes[i]}`,
        ),
        m.id === "PHOTO" ? "ACCEPT the size" : `RETURN ${m.outcomes.at(-1)}`,
        "END",
      ];
  const escape = (s: string) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const shapes: string[] = [];
  const box = (x: number, y: number, text: string, decision = false) => {
    shapes.push(
      decision
        ? `<polygon points="${x},${y - 44} ${x + 150},${y} ${x},${y + 44} ${x - 150},${y}" fill="#eef3ed" stroke="#285b48" stroke-width="2"/>`
        : `<rect x="${x - 125}" y="${y - 30}" width="250" height="60" rx="12" fill="#f7f9f7" stroke="#285b48" stroke-width="2"/>`,
    );
    shapes.push(
      `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15">${escape(text)}</text>`,
    );
  };
  const arrow = (points: string, text?: string, x = 0, y = 0) => {
    shapes.push(
      `<path d="${points}" fill="none" stroke="#476354" stroke-width="2" marker-end="url(#arrow)"/>`,
    );
    if (text)
      shapes.push(`<text x="${x}" y="${y}" font-size="14">${text}</text>`);
  };
  box(300, 80, "1 Start");
  arrow("M300 110 L300 146");
  for (let i = 0; i < decisions; i++) {
    const y = 190 + i * 160,
      n = 2 + i * 2;
    box(300, y, `${n} ${m.labels[i]}`, true);
    box(650, y, `${n + 1} ${m.outcomes[i]}`);
    arrow(`M450 ${y} L525 ${y}`, "Yes", 473, y - 10);
    const nextY =
      i === decisions - 1
        ? m.sequential
          ? 570
          : 190 + decisions * 160
        : y + 160;
    arrow(
      `M300 ${y + 44} L300 ${nextY - (i === decisions - 1 ? 30 : 44)}`,
      "No",
      312,
      y + 85,
    );
    if (m.sequential)
      arrow(`M650 ${y + 30} L650 ${nextY - 65} L390 ${nextY - 15}`);
    else {
      const lane = 970 - i * 65;
      arrow(`M775 ${y} L${lane} ${y} L${lane} 790 L775 790`);
    }
  }
  if (m.sequential) {
    box(300, 570, `${last} ${m.outcomes.at(-1)}`);
    box(300, 730, `${exit} Exit`);
    arrow("M300 600 L300 700");
  } else {
    const y = 190 + decisions * 160;
    box(300, y, `${last} ${m.outcomes.at(-1)}`);
    box(650, 790, `${exit} Exit`);
    arrow(`M300 ${y + 30} L300 790 L525 790`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="900"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#476354"/></marker></defs><rect width="1040" height="900" fill="white"/><g font-family="Arial" fill="#173b2e"><text x="40" y="35" font-size="23" font-weight="bold">${m.id}: ${m.name}</text>${shapes.join("")}<text x="40" y="870" font-size="18">N=${nodes}, E=${edges}, P=${decisions}, V(G)=${decisions + 1}. Count the outside region.</text></g></svg>`;
  await writeFile(`docs/graphs/${m.id.toLowerCase()}.svg`, svg);
  await sharp(Buffer.from(svg))
    .png()
    .toFile(`docs/graphs/${m.id.toLowerCase()}.png`);
  out.push(
    `## ${m.id}: ${m.name}`,
    "",
    `Source: [${m.file}:${line}](../${m.file}).`,
    "",
    `![${m.id} control flow graph](graphs/${m.id.toLowerCase()}.png)`,
    "",
    "```mermaid",
    ...code,
    "```",
    "",
    `N = ${nodes}, E = ${edges}, P = ${decisions}.`,
    "",
    `1. Edges and nodes: ${edges} - ${nodes} + 2 = **${decisions + 1}**.`,
    `2. Predicate nodes: ${decisions} + 1 = **${decisions + 1}**.`,
    `3. Regions: ${decisions} bounded regions + 1 outside region = **${decisions + 1}**.`,
    "",
    "| Path | Nodes | Test input and expected result |",
    "|---|---|---|",
    ...paths.map((p, i) => `| ${m.id} P${i + 1} | ${p} | ${m.cases[i]} |`),
    "",
    "Pseudocode:",
    "",
    "```text",
    ...pseudocode,
    "```",
    "",
    "Production routine:",
    "",
    "```typescript",
    source.slice(fn.getStart(), fn.end),
    "```",
    "",
  );
  await writeFile(`docs/graphs/${m.id.toLowerCase()}.mmd`, code.join("\n"));
}
out.push(
  "The NOTIFY suite also tests both channels together. The CSV formula path passes through the value conversion node before the formula guard. The empty-value path cannot reach the formula branch because its text is empty. The tests include exact lock expiry and the full description and image boundaries.",
  "",
  "Run `npm run docs:whitebox`, then `npm run test:coverage`. See [test results](evidence/Test_Results.md). A failed test or changed decision count requires a new review.",
);
await writeFile("docs/White_Box_Tests.md", out.join("\n"));
console.log("Saved six source-checked control flow graphs and path tables.");
````

## src/app/api/[...path]/route.ts

````ts
import { one, rows } from "@/db";
import {
  getUser,
  login,
  logout,
  requireUser,
  SESSION_COOKIE,
} from "@/lib/auth";
import {
  isManager,
  isReporter,
  MAX_PHOTO_BYTES,
  ticketInput,
} from "@/lib/domain";
import { AppError, assert } from "@/lib/errors";
import { launchPendingWorkflows, runDueJobs } from "@/lib/jobs";
import { getNotifications, markNotificationsRead } from "@/lib/notifications";
import {
  createUser,
  listUsers,
  referenceData,
  updateReference,
  updateUser,
} from "@/lib/reference";
import { dashboard, exportCsv, reports } from "@/lib/reports";
import {
  cleanOrphanPhotos,
  confirmCloudPhoto,
  isCloudStorage,
  photoBytes,
  prepareCloudPhoto,
  saveLocalPhoto,
} from "@/lib/storage";
import {
  audit,
  createTicket,
  duplicateSuggestions,
  listTickets,
  ticketAction,
  ticketDetail,
} from "@/lib/tickets";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { sql } from "drizzle-orm";
import { after, NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ path: string[] }> };
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin)
    assert(
      origin === req.nextUrl.origin || origin === process.env.APP_URL,
      "This request did not come from CampusFix.",
      403,
    );
  else
    assert(
      req.headers.get("sec-fetch-site") !== "cross-site",
      "This request did not come from CampusFix.",
      403,
    );
}
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
async function body(req: NextRequest) {
  assert(
    Number(req.headers.get("content-length") ?? 0) < 100_000,
    "This request is too large.",
    413,
  );
  try {
    return await req.json();
  } catch {
    throw new AppError("The request data is not valid JSON.");
  }
}
function scheduleJobs() {
  after(async () => {
    try {
      if (process.env.VERCEL) await launchPendingWorkflows();
      else await runDueJobs();
    } catch (error) {
      console.error(
        "Background work is pending",
        error instanceof Error ? error.message : "",
      );
    }
  });
}
async function handler(req: NextRequest, context: Context) {
  try {
    const { path } = await context.params;
    const route = path.join("/");
    const method = req.method;
    if (route === "health" && method === "GET") {
      await rows(sql`SELECT 1`);
      return json({
        status: "ok",
        application: "CampusFix",
        messageTransport: "test",
        storage: isCloudStorage()
          ? "private Vercel Blob"
          : "private local storage",
      });
    }
    if (route === "jobs/recover" && method === "GET") {
      assert(
        process.env.CRON_SECRET &&
          req.headers.get("authorization") ===
            `Bearer ${process.env.CRON_SECRET}`,
        "Not authorised.",
        401,
      );
      await runDueJobs();
      await cleanOrphanPhotos();
      await launchPendingWorkflows();
      return json({ ok: true });
    }
    if (method !== "GET") sameOrigin(req);
    if (route === "auth/login" && method === "POST") {
      const token = await login(await body(req), null);
      const response = json({ user: await getUser(token) });
      response.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production" &&
          (Boolean(process.env.VERCEL) ||
            !["localhost", "127.0.0.1", "[::1]"].includes(
              req.nextUrl.hostname,
            )),
        sameSite: "lax",
        path: "/",
        maxAge: 7200,
      });
      return response;
    }
    if (route === "auth/logout" && method === "POST") {
      await logout(req.cookies.get(SESSION_COOKIE)?.value);
      const response = json({ ok: true });
      response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    }
    // The Blob SDK authenticates upload callbacks. User sessions are checked in token generation.
    if (route === "uploads/blob" && method === "POST") {
      assert(isCloudStorage(), "Cloud uploads are not enabled.");
      const requestBody = (await body(req)) as HandleUploadBody;
      const result = await handleUpload({
        request: req,
        body: requestBody,
        onBeforeGenerateToken: async (pathname) => {
          const user = await requireUser(
            req.cookies.get(SESSION_COOKIE)?.value,
          );
          const item = await one<{
            attachment_id: string;
            content_type: string;
          }>(
            sql`SELECT attachment_id,content_type FROM attachments WHERE storage_key=${pathname} AND owner_id=${user.user_id}::uuid AND NOT verified AND ticket_id IS NULL AND created_at>NOW()-INTERVAL '15 minutes'`,
          );
          assert(item, "This photo upload is not authorised.", 403);
          return {
            allowedContentTypes: [item.content_type],
            maximumSizeInBytes: MAX_PHOTO_BYTES,
            addRandomSuffix: false,
            allowOverwrite: false,
            validUntil: Date.now() + 10 * 60_000,
            tokenPayload: JSON.stringify({ attachmentId: item.attachment_id }),
          };
        },
        onUploadCompleted: async () => {},
      });
      return json(result);
    }
    const user = await requireUser(req.cookies.get(SESSION_COOKIE)?.value);
    if (route === "session" && method === "GET") return json({ user });
    if (route === "reference" && method === "GET")
      return json(await referenceData(user));
    if (route === "dashboard" && method === "GET")
      return json(await dashboard(user));
    if (route === "tickets/duplicates" && method === "GET") {
      const categoryId = z
        .uuid()
        .parse(req.nextUrl.searchParams.get("categoryId"));
      const locationId = z
        .uuid()
        .parse(req.nextUrl.searchParams.get("locationId"));
      return json(await duplicateSuggestions(user, categoryId, locationId));
    }
    if (route === "tickets" && method === "GET")
      return json(await listTickets(user, req.nextUrl.searchParams));
    if (route === "tickets" && method === "POST") {
      const data = ticketInput.parse(await body(req));
      const result = await createTicket(user, data);
      scheduleJobs();
      return json(result, result.replayed ? 200 : 201);
    }
    if (path[0] === "tickets" && path.length === 2 && method === "GET")
      return json(await ticketDetail(user, path[1]));
    if (
      path[0] === "tickets" &&
      path[2] === "actions" &&
      path.length === 3 &&
      method === "POST"
    ) {
      const result = await ticketAction(user, path[1], await body(req));
      scheduleJobs();
      return json(result);
    }
    if (route === "uploads" && method === "POST") {
      assert(
        !isCloudStorage(),
        "Use the direct upload form for the hosted copy.",
      );
      assert(
        Number(req.headers.get("content-length") ?? 0) <=
          MAX_PHOTO_BYTES + 20_000,
        "The photo must be 4.5 MB or smaller.",
        413,
      );
      const form = await req.formData();
      const file = form.get("file");
      const phase = z.enum(["BEFORE", "AFTER"]).parse(form.get("phase"));
      assert(file instanceof File, "Choose a photo.");
      assert(
        phase === "BEFORE" ? isReporter(user.role) : user.role === "TECHNICIAN",
        "You cannot upload this type of photo.",
        403,
      );
      return json(await saveLocalPhoto(user, file, phase), 201);
    }
    if (route === "uploads/prepare" && method === "POST") {
      const data = z
        .object({
          name: z.string().min(1).max(200),
          size: z.number().int().positive().max(MAX_PHOTO_BYTES),
          contentType: z.enum(["image/jpeg", "image/png"]),
          phase: z.enum(["BEFORE", "AFTER"]),
        })
        .parse(await body(req));
      assert(
        data.phase === "BEFORE"
          ? isReporter(user.role)
          : user.role === "TECHNICIAN",
        "You cannot upload this type of photo.",
        403,
      );
      return json(await prepareCloudPhoto(user, data));
    }
    if (route === "uploads/confirm" && method === "POST") {
      const data = z.object({ attachmentId: z.uuid() }).parse(await body(req));
      return json(await confirmCloudPhoto(user, data.attachmentId));
    }
    if (path[0] === "attachments" && path.length === 2 && method === "GET") {
      const id = z.uuid().parse(path[1]);
      const item = await one<{
        owner_id: string;
        ticket_id: string | null;
        verified: boolean;
        storage_key: string;
        content_type: string;
      }>(sql`SELECT * FROM attachments WHERE attachment_id=${id}::uuid`);
      assert(item?.verified, "This photo was not found.", 404);
      if (item.ticket_id) await ticketDetail(user, item.ticket_id);
      else
        assert(
          item.owner_id === user.user_id,
          "You cannot view this photo.",
          403,
        );
      return new NextResponse(
        new Uint8Array(await photoBytes(item.storage_key)),
        {
          headers: {
            "Content-Type": item.content_type,
            "Cache-Control": "private, no-store",
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
    if (route === "notifications" && method === "GET")
      return json(await getNotifications(user));
    if (route === "notifications" && method === "PATCH") {
      await markNotificationsRead(user);
      return json({ ok: true });
    }
    if (route === "settings" && method === "PATCH") {
      const data = z
        .object({ email: z.boolean(), sms: z.boolean(), inApp: z.boolean() })
        .parse(await body(req));
      await rows(
        sql`UPDATE users SET pref_email=${data.email},pref_sms=${data.sms},pref_in_app=${data.inApp},updated_at=NOW() WHERE user_id=${user.user_id}::uuid`,
      );
      await audit(
        user.user_id,
        "PREFERENCES_UPDATED",
        null,
        "Notification preferences saved.",
      );
      return json({ ok: true });
    }
    if (route === "reports" && method === "GET")
      return json(await reports(user, req.nextUrl.searchParams));
    if (route === "reports/export" && method === "GET")
      return new NextResponse(await exportCsv(user, req.nextUrl.searchParams), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            "attachment; filename=campusfix-maintenance.csv",
          "Cache-Control": "private, no-store",
        },
      });
    if (route === "admin/users" && method === "GET")
      return json(await listUsers(user));
    if (route === "admin/users" && method === "POST")
      return json(await createUser(user, await body(req)), 201);
    if (route === "admin/users" && method === "PATCH")
      return json(await updateUser(user, await body(req)));
    if (route === "admin/reference" && method === "POST")
      return json(await updateReference(user, await body(req)));
    if (route === "admin/audit" && method === "GET") {
      assert(
        user.role === "FMD_ADMIN",
        "Only administrators can view the audit log.",
        403,
      );
      return json(
        await rows(
          sql`SELECT a.audit_id,a.event_code,a.details,a.ticket_id,a.created_at,u.full_name FROM audit_logs a LEFT JOIN users u ON u.user_id=a.actor_id ORDER BY a.created_at DESC LIMIT 200`,
        ),
      );
    }
    if (route === "admin/deliveries" && method === "GET") {
      assert(
        isManager(user.role),
        "Only facilities staff can view message delivery records.",
        403,
      );
      return json(
        await rows(
          sql`SELECT d.delivery_id,d.channel,d.status,d.attempts,d.last_error,d.processed_at,n.title,n.ticket_id,u.full_name FROM notification_deliveries d JOIN notifications n ON n.notification_id=d.notification_id JOIN users u ON u.user_id=n.user_id ORDER BY n.created_at DESC LIMIT 100`,
        ),
      );
    }
    throw new AppError("This page was not found.", 404);
  } catch (error) {
    if (error instanceof ZodError)
      return json(
        {
          error: error.issues[0]?.message ?? "Check your entries.",
          fields: Object.fromEntries(
            error.issues.map((issue) => [issue.path.join("."), issue.message]),
          ),
        },
        400,
      );
    if (error instanceof AppError)
      return json({ error: error.message, code: error.code }, error.status);
    const code = (error as { code?: string })?.code;
    if (code === "23505")
      return json(
        { error: "This record already exists. Check the ID, email, or name." },
        409,
      );
    if (code === "22P02" || code === "22007" || code === "22008")
      return json({ error: "One of the values is not valid." }, 400);
    if (code === "40P01")
      return json(
        { error: "Another update is in progress. Refresh and try again." },
        409,
      );
    console.error("CampusFix request failed", error);
    return json(
      {
        error:
          "CampusFix could not finish this request. Try again. Your previous data is safe.",
      },
      500,
    );
  }
}
export { handler as GET, handler as PATCH, handler as POST };
````

## src/app/app/[[...view]]/page.tsx

````tsx
import { CampusApp } from "@/components/campus-app";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function AppPage({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  return <CampusApp user={user} view={(await params).view ?? []} />;
}
````

## src/app/globals.css

````css
@import "tailwindcss";

:root {
  --ink: oklch(0.23 0.025 164);
  --muted: oklch(0.49 0.018 164);
  --green: oklch(0.34 0.065 164);
  --green-hover: oklch(0.28 0.06 164);
  --canvas: oklch(0.975 0.005 164);
  --surface: oklch(0.998 0.002 164);
  --line: oklch(0.91 0.009 164);
  --gold: #e7c975;
  --radius: 0.75rem;
  --font-body: "Public Sans Variable", sans-serif;
  --font-heading: "Manrope Variable", sans-serif;
  --space-sm: 12px;
  --space-md: 24px;
  --space-lg: 32px;
}
@theme inline {
  --color-background: var(--canvas);
  --color-foreground: var(--ink);
  --font-sans: var(--font-body);
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
button,
input,
textarea,
select {
  font: inherit;
}
button,
a,
input,
select,
textarea {
  -webkit-tap-highlight-color: transparent;
}
button,
a {
  touch-action: manipulation;
}
button {
  cursor: pointer;
}
a {
  color: inherit;
  text-decoration: none;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
h1,
h2,
h3,
p {
  margin: 0;
}
h1,
h2,
h3 {
  font-family: var(--font-heading);
  font-weight: 700;
  letter-spacing: -0.035em;
}
h1 {
  font-size: 30px;
  line-height: 1.25;
}
h2 {
  font-size: 17px;
  line-height: 1.4;
}
h3 {
  font-size: 15px;
}
p {
  line-height: 1.65;
}
small {
  font-size: 11px;
}
svg {
  flex-shrink: 0;
}
button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 3px solid #659687;
  outline-offset: 3px;
}
::selection {
  background: #dcebe3;
}
input:not([type="checkbox"]):not([type="radio"]),
select,
textarea {
  width: 100%;
  border: 1px solid #dbe2df;
  background: var(--surface);
  color: var(--ink);
  border-radius: 7px;
  padding: 11px 13px;
  min-height: 44px;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
input::placeholder,
textarea::placeholder {
  color: #606c65;
}
select {
  appearance: auto;
  padding-right: 8px;
}
input:focus,
textarea:focus,
select:focus {
  border-color: #618575;
  box-shadow: 0 0 0 3px #e9f0ec;
}
textarea {
  resize: vertical;
  min-height: 90px;
}
input[type="checkbox"],
input[type="radio"] {
  accent-color: #24684f;
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}
input:disabled,
select:disabled {
  background: #f0f3f1;
  color: #606b64;
}
.muted {
  color: var(--muted);
}
.green-text {
  color: #24684f;
}
.nowrap {
  white-space: nowrap;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 10px 17px;
  min-height: 42px;
  border-radius: 7px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transition:
    background 0.15s,
    transform 0.15s;
}
.btn:active:not(:disabled) {
  transform: translateY(1px);
}
.btn-primary {
  background: #235d47;
  color: #fcfefc;
  border-color: #235d47;
}
.btn-primary:hover:not(:disabled) {
  background: #174a36;
}
.btn-secondary {
  background: #e8f0e9;
  color: #24553f;
}
.btn-outline {
  background: var(--surface);
  border-color: #d7dfd9;
  color: #354d40;
}
.btn-outline:hover:not(:disabled) {
  background: #f1f5f2;
  border-color: #a8bcb0;
}
.btn-ghost {
  background: transparent;
  color: #3a5c49;
}
.btn-ghost:hover {
  background: #e9efea;
}
.btn-danger {
  background: #a03836;
  color: #fff8f6;
}
.btn-sm {
  min-height: 34px;
  padding: 6px 11px;
  font-size: 11px;
}
.btn-icon {
  padding: 8px;
  min-width: 36px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  font-family: var(--font-heading);
  font-size: 27px;
  font-weight: 800;
  letter-spacing: -1.1px;
  line-height: 1;
}
.brand-mark {
  display: grid;
  place-items: center;
  width: 39px;
  height: 39px;
  background: var(--gold);
  color: #193b32;
  border-radius: 11px;
  transform: rotate(-3deg);
}
.brand-light {
  font-weight: 400;
}
.brand small {
  display: block;
  margin-top: 10px;
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 2px;
  color: #a9bcb4;
}
.eyebrow {
  display: block;
  color: #576d61;
  font-size: 10px !important;
  font-weight: 700;
  letter-spacing: 1.7px;
  text-transform: uppercase;
  margin-bottom: 10px !important;
}
.notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid;
  border-radius: 8px;
  padding: 13px 15px;
  font-size: 12px;
  margin-bottom: 20px;
  line-height: 1.6;
}
.notice > svg {
  margin-top: 1px;
}
.notice-error {
  background: #fff4f2;
  border-color: #edceca;
  color: #8e322b;
}
.notice-success {
  background: #edf6ef;
  border-color: #c5dfcd;
  color: #27563c;
}
.notice-info {
  background: #eff4f8;
  border-color: #d0dee9;
  color: #35576e;
}
.notice a {
  text-decoration: underline;
}
.notice div > svg {
  display: inline;
  vertical-align: middle;
}
.field {
  display: grid;
  gap: 7px;
  min-width: 0;
}
.field label,
.urgency-field > legend {
  font-size: 12px;
  font-weight: 600;
  color: #35493e;
}
.field-hint {
  display: block;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.6;
}
.field-message {
  font-size: 11px;
  color: #a13c34;
}
.field-error input,
.field-error textarea,
.field-error select {
  border-color: #b75248;
}
.form-stack {
  display: grid;
  gap: 19px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.field .notice {
  margin: 0;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #596c5f;
  font-size: 11px;
  margin-bottom: 21px;
}
.back-link:hover {
  color: #235d47;
}
.text-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #2c624c;
  font-weight: 600;
  font-size: 11px;
  white-space: nowrap;
}
.text-link:hover {
  text-decoration: underline;
}
.page-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 27px;
}
.page-title > div > p:not(.eyebrow) {
  font-size: 12px;
  color: var(--muted);
  margin-top: 9px;
}
.page-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
}
.panel {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
}
.panel-heading {
  padding: 22px 24px 19px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.panel-heading p {
  font-size: 11px;
  color: var(--muted);
  margin-top: 5px;
}
.panel-body {
  padding: 24px;
}
.panel-note {
  font-size: 11px;
  color: var(--muted);
  padding: 0 24px 24px;
}
.subtle-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
  margin: 18px 0;
}
.subtle-note svg {
  margin-top: 1px;
}
.empty {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 50px 24px;
  text-align: center;
}
.empty p {
  max-width: 42ch;
  font-size: 12px;
  color: var(--muted);
}
.empty .btn {
  margin-top: 10px;
}
.empty-icon {
  display: grid;
  place-items: center;
  background: #eff4ef;
  border: 1px solid #e0e9e1;
  border-radius: 13px;
  width: 57px;
  height: 57px;
  margin-bottom: 5px;
  color: #546e5b;
}
.skeleton {
  background: linear-gradient(100deg, #eaf0ec 25%, #f3f6f4 45%, #eaf0ec 65%);
  background-size: 250% 100%;
  animation: shimmer 1.6s linear infinite;
  border-radius: 8px;
}
.skeleton-heading {
  width: 260px;
  height: 30px;
  margin: 20px 0 25px;
}
.skeleton-banner {
  height: 180px;
}
.skeleton-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin: 24px 0;
}
.skeleton-stat {
  height: 115px;
}
.skeleton-table {
  height: 240px;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes shimmer {
  to {
    background-position: -150% 0;
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
/* Sign in */
.login-page {
  display: grid;
  grid-template-columns: minmax(420px, 0.94fr) minmax(500px, 1.06fr);
  min-height: 100dvh;
  background: var(--surface);
}
.login-story {
  background: #173d33;
  color: #f3f7ef;
  padding: 43px 52px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.login-story .brand {
  color: #f8fbf5;
}
.login-story-copy {
  margin: auto 0;
  max-width: 530px;
  padding: 65px 0 40px;
}
.story-kicker {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.7px;
  color: #c3d2c9;
  margin-bottom: 22px;
}
.story-kicker > span,
.banner-eyebrow > span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--gold);
}
.login-story h1 {
  font-size: clamp(39px, 4vw, 62px);
  font-weight: 500;
  line-height: 1.13;
  letter-spacing: -2.5px;
}
.login-story-copy > p {
  color: #bdd0c4;
  font-size: 14px;
  max-width: 36ch;
  margin-top: 24px;
}
.campus-illustration {
  width: 100%;
  max-width: 430px;
  color: #586d61;
}
.login-story .campus-illustration {
  margin: 20px 0 0;
  max-width: 440px;
  transform: translateX(-20px);
}
.story-points {
  display: grid;
  gap: 13px;
  margin-top: 8px;
  font-size: 12px;
  color: #d6e3da;
}
.story-points > div {
  display: flex;
  align-items: center;
  gap: 10px;
}
.story-points svg {
  color: var(--gold);
}
.login-story-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: #aac1b3;
  padding-top: 20px;
}
.login-story-footer > span {
  margin-left: auto;
  font-size: 10px;
}
.login-main {
  padding: 40px 48px 25px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.login-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 10px;
  color: #687b6e;
  letter-spacing: 1.3px;
}
.login-top a {
  display: flex;
  align-items: center;
  gap: 6px;
  letter-spacing: 0;
  font-size: 11px;
  color: #3b5e4b;
}
.login-form-wrap {
  width: 100%;
  max-width: 395px;
  margin: auto;
  padding: 72px 0;
}
.login-heading {
  margin-bottom: 30px;
}
.login-heading h2 {
  font-size: 35px;
  letter-spacing: -1.5px;
  line-height: 1.2;
}
.login-heading p {
  font-size: 13px;
  color: var(--muted);
  margin-top: 10px;
}
.login-form-wrap .eyebrow {
  font-size: 10px !important;
  letter-spacing: 1.8px;
}
.password-input {
  position: relative;
}
.password-input > input {
  padding-right: 45px !important;
}
.password-input > button {
  position: absolute;
  right: 12px;
  top: 13px;
  color: #5c6c61;
  background: transparent;
  border: 0;
  padding: 0;
  display: grid;
  place-items: center;
}
.login-help {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  color: #5c6d60;
  margin-top: -2px;
}
.login-submit {
  width: 100%;
  justify-content: center;
  min-height: 45px;
}
.login-submit > svg:last-child {
  margin-left: auto;
}
.login-submit:before {
  content: "";
  width: 17px;
  margin-right: auto;
}
.demo-accounts {
  margin-top: 33px;
  text-align: center;
}
.divider-label {
  display: flex;
  align-items: center;
  gap: 13px;
  color: #5b6c60;
  font-size: 10px;
  letter-spacing: 1.2px;
  font-weight: 600;
}
.divider-label > span {
  height: 1px;
  flex: 1;
  background: var(--line);
}
.demo-accounts > p {
  font-size: 11px;
  color: #586a5d;
  margin: 14px 0;
}
.demo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.demo-choice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid #dce4dd;
  border-radius: 7px;
  min-height: 41px;
  background: var(--surface);
  font-size: 11px;
  color: #4c6655;
}
.demo-choice:hover,
.demo-choice.selected {
  border-color: #6a937b;
  background: #f0f5f0;
  color: #254f36;
}
.demo-caption {
  display: block;
  font-size: 10px;
  color: #5e6c60;
  margin-top: 13px;
}
.login-policy {
  font-size: 10px;
  line-height: 1.8;
  color: #5c6860;
  text-align: center;
  margin-top: 30px;
}
.login-footer {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 10px;
  color: #5f6c62;
}
/* Workspace shell */
.app-shell {
  min-height: 100dvh;
}
.sidebar {
  background: #192e28;
  color: #b5c4ba;
  width: 246px;
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  padding: 30px 17px 0;
  overflow-y: auto;
}
.sidebar-brand {
  padding: 0 11px 30px;
}
.sidebar .brand {
  font-size: 26px;
  color: #f3f6ef;
}
.sidebar .brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
}
.sidebar .brand small {
  font-size: 6px;
  letter-spacing: 1.8px;
  margin-top: 8px;
}
.workspace-label {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #3a4b40;
  background: #26392f;
  padding: 11px;
  border-radius: 8px;
  margin-bottom: 30px;
  font-size: 11px;
  color: #e0e8dc;
}
.workspace-label > svg {
  margin-left: auto;
}
.workspace-label small {
  display: block;
  font-size: 10px;
  color: #a0b19f;
  margin-top: 2px;
}
.workspace-icon {
  background: #3b4e3e;
  border: 1px solid #50614d;
  border-radius: 6px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 32px;
  color: var(--gold);
}
.nav-label {
  font-size: 10px;
  letter-spacing: 1.4px;
  color: #849887;
  margin: 0 13px 11px;
  font-weight: 600;
}
.sidebar nav {
  display: grid;
  gap: 5px;
  margin-bottom: 22px;
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 42px;
  padding: 10px 13px;
  border-radius: 7px;
  font-size: 11px;
  color: #b5c4ba;
  position: relative;
}
.nav-link:hover {
  background: #263e32;
  color: #eff5eb;
}
.nav-link.active {
  background: #354c3b;
  color: #f0f6e9;
}
.nav-link.active > svg {
  color: var(--gold);
}
.nav-count {
  margin-left: auto;
  background: #445e47;
  color: #e0eada;
  font-size: 10px;
  line-height: 19px;
  min-width: 20px;
  text-align: center;
  border-radius: 5px;
}
.sidebar-bottom {
  margin-top: auto;
  padding-top: 14px;
}
.sidebar-note {
  border: 1px solid #40533e;
  background: #263d2e;
  border-radius: 9px;
  padding: 18px 15px;
  margin: 0 3px 20px;
  color: #e5eddd;
}
.sidebar-note > svg {
  color: var(--gold);
  margin-bottom: 10px;
}
.sidebar-note > strong {
  font-size: 11px;
  display: block;
  line-height: 1.6;
}
.sidebar-note p {
  font-size: 10px;
  color: #b0c2ad;
  margin-top: 7px;
  line-height: 1.7;
}
.sidebar-note a {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  color: #e1d6a6;
  margin-top: 14px;
}
.sidebar-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  border-top: 1px solid #33483a;
  margin-top: 17px;
  padding: 20px 3px;
}
.avatar {
  background: #d9e5cc;
  color: #31523c;
  display: grid;
  place-items: center;
  width: 35px;
  height: 35px;
  border: 2px solid #ecf2e7;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.avatar-small {
  width: 31px;
  height: 31px;
  font-size: 10px;
}
.avatar-large {
  width: 60px;
  height: 60px;
  font-size: 18px;
  margin: auto auto 16px;
}
.sidebar-profile > div {
  min-width: 0;
}
.sidebar-profile strong {
  display: block;
  font-size: 10px;
  color: #eef3e9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 122px;
}
.sidebar-profile small {
  display: block;
  font-size: 10px;
  margin-top: 3px;
  color: #9db199;
}
.sidebar-profile > button {
  background: transparent;
  border: 0;
  color: #9bb199;
  padding: 6px;
  margin-left: auto;
}
.workspace-main {
  margin-left: 246px;
}
.topbar {
  height: 76px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 36px;
  gap: 15px;
}
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 13px;
  font-size: 10px;
  color: #5d6960;
}
.breadcrumb strong {
  font-weight: 500;
  color: #334c3d;
}
.breadcrumb-divider {
  color: #646a65;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 22px;
}
.demo-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  background: #f3f5ef;
  border: 1px solid #e3e7da;
  border-radius: 5px;
  color: #606b4f;
  padding: 5px 9px;
  font-size: 10px;
}
.demo-pill > span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #7c9463;
}
.notification-button {
  position: relative;
  color: #586c60;
  padding: 4px;
}
.notification-button > i {
  position: absolute;
  width: 5px;
  height: 5px;
  background: #b47a2a;
  border: 1px solid var(--surface);
  border-radius: 50%;
  top: 3px;
  right: 4px;
}
.page-content {
  max-width: 1570px;
  margin: 0 auto;
  padding: 35px 36px 0;
  outline: none;
}
.workspace-footer {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  margin-top: 38px;
  padding: 18px 0 22px;
  border-top: 1px solid var(--line);
  font-size: 10px;
  color: #5d6860;
}
.workspace-footer > span:last-child {
  display: flex;
  align-items: center;
  gap: 6px;
}
.live-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #5d8a66;
}
.footer-separator {
  padding: 0 6px;
}
.skip-link {
  position: fixed;
  left: 270px;
  top: -60px;
  padding: 10px 15px;
  background: #fff;
  color: #173d33;
  z-index: 100;
}
.skip-link:focus {
  top: 12px;
}
.menu-button,
.mobile-close {
  display: none;
}
.toast {
  position: fixed;
  right: 28px;
  bottom: 24px;
  max-width: min(440px, calc(100vw - 30px));
  background: #214d38;
  color: #f3f9ef;
  padding: 15px 17px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #5c8266;
  border-radius: 9px;
  z-index: 60;
  box-shadow: 0 6px 24px #233d2920;
  font-size: 12px;
}
.toast > button {
  border: 0;
  background: transparent;
  color: inherit;
  margin-left: 10px;
  display: grid;
  place-items: center;
}
.date-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #dee5df;
  border-radius: 7px;
  padding: 8px 11px;
  color: #58695b;
  font-size: 10px;
  background: var(--surface);
}
/* Overview */
.welcome-banner {
  border-radius: 11px;
  background: #234e3c;
  color: #f4f8ee;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
  min-height: 189px;
  padding: 29px 32px;
  margin-bottom: 24px;
}
.banner-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 1.5px;
  color: #c8d5c3;
  margin-bottom: 11px;
}
.welcome-banner h2 {
  font-size: 26px;
  font-weight: 500;
  letter-spacing: -1px;
}
.welcome-banner p {
  font-size: 11px;
  max-width: 47ch;
  color: #c7d7c6;
  margin-top: 9px;
}
.welcome-banner a {
  font-size: 10px;
  color: #ead792;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-top: 19px;
}
.welcome-banner .campus-illustration {
  width: 310px;
  max-width: 42%;
  height: 180px;
  margin: -15px -5px -20px 10px;
  color: #90b39d;
}
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  margin-bottom: 27px;
  overflow: hidden;
}
.stat {
  padding: 20px 23px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-right: 1px solid var(--line);
  min-width: 0;
}
.stat:last-child {
  border-right: 0;
}
.stat-label {
  font-size: 11px;
  color: #596d60;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 28px;
}
.stat > strong {
  font-family: var(--font-heading);
  font-size: 33px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -1.5px;
  font-variant-numeric: tabular-nums;
}
.stat > strong > small {
  font-size: 13px;
  letter-spacing: 0;
  font-weight: 400;
}
.stat > span:last-child:not(.stat-label) {
  font-size: 10px;
  color: #5c685f;
}
.stat-icon {
  width: 31px;
  height: 31px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #f0f5ed;
  color: #536e4f;
}
.stat-icon.amber {
  background: #faf5e6;
  color: #7a642f;
}
.stat-icon.blue {
  background: #eef3f5;
  color: #556a73;
}
.stat-icon.rose {
  background: #fbf0ed;
  color: #845b50;
}
.dashboard-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.95fr) minmax(270px, 1fr);
  gap: 23px;
  margin-bottom: 24px;
}
.dashboard-columns .panel-heading h2 {
  font-size: 15px;
}
.dashboard-columns .panel-heading {
  padding: 20px 22px 17px;
}
.live-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  letter-spacing: 1px;
  color: #5b6d5b;
}
.live-indicator > span {
  width: 4px;
  height: 4px;
  background: #6d9368;
  border-radius: 50%;
}
.activity-feed {
  padding: 0 22px 10px;
}
.activity-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 15px 0;
  border-bottom: 1px solid #edf0ec;
}
.activity-item:last-child {
  border: 0;
}
.activity-icon {
  background: #f0f3ed;
  color: #5c6b57;
  border: 1px solid #e4eade;
  width: 29px;
  height: 29px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  flex-shrink: 0;
}
.activity-icon.green {
  background: #e9f3e9;
  color: #3b7148;
}
.activity-item strong {
  font-size: 10px;
  font-weight: 600;
}
.activity-item p {
  font-size: 10px;
  color: #5d695e;
  margin-top: 3px;
}
.activity-item small {
  font-size: 10px;
  color: #626c63;
  display: block;
  margin-top: 4px;
}
.dashboard-bottom {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 24px;
}
.dashboard-bottom h2 {
  font-size: 15px;
}
.category-bars {
  padding: 0 24px 24px;
  display: grid;
  gap: 17px;
}
.category-bars > div {
  display: grid;
  grid-template-columns: 145px 1fr 15px;
  gap: 12px;
  align-items: center;
  font-size: 10px;
  color: #5b6d5e;
}
.category-bars strong {
  font-size: 10px;
  color: #455e49;
}
.bar-track {
  height: 5px;
  border-radius: 10px;
  background: #eef2ec;
  overflow: hidden;
}
.bar-track > div {
  height: 100%;
  border-radius: 10px;
  background: #7e9b74;
}
.category-bars > div:nth-child(2) .bar-track > div {
  background: #b8ba8b;
}
.category-bars > div:nth-child(3) .bar-track > div {
  background: #a1b5a0;
}
.category-bars > div:nth-child(4) .bar-track > div {
  background: #c9b78e;
}
.how-it-works {
  padding: 25px 28px;
  border-radius: 11px;
  border: 1px solid #dce4d5;
  background: #edf2e7;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.section-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  letter-spacing: 1px;
  color: #556b49;
}
.section-eyebrow svg {
  color: #546d43;
}
.how-it-works h2 {
  font-size: 20px;
  font-weight: 600;
  margin-top: 11px;
}
.steps-inline {
  display: flex;
  gap: 14px;
  margin: 18px 0 21px;
  width: 100%;
  justify-content: space-between;
}
.steps-inline > div {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  font-size: 10px;
  color: #5c6b53;
}
.steps-inline > div > span {
  font-size: 10px;
  border: 1px solid #ccd8c2;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  background: #f4f7ee;
  color: #586b4b;
}
.steps-inline > div > svg {
  margin-left: 4px;
  color: #606958;
}
.how-it-works .text-link {
  font-size: 10px;
  margin-top: auto;
}
/* Tables and status labels */
.table-scroll {
  width: 100%;
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 11px;
}
thead {
  background: #fafbf8;
}
th {
  font-weight: 500;
  font-size: 10px;
  color: #5d6a5c;
  padding: 11px 20px;
  border-top: 1px solid #eaf0e7;
  border-bottom: 1px solid #eaf0e7;
  white-space: nowrap;
}
td {
  padding: 17px 20px;
  border-bottom: 1px solid #edf1e9;
  vertical-align: middle;
  color: #536b58;
}
tr:last-child td {
  border-bottom: 0;
}
tbody tr:hover {
  background: #fcfdfa;
}
td > strong {
  font-weight: 600;
  color: #344b3a;
}
td small {
  display: block;
  font-size: 10px;
  color: #606c60;
  margin-top: 4px;
}
.table-main {
  color: #48604c;
  font-size: 10px;
  display: block;
}
.ticket-title {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 190px;
  max-width: 360px;
}
.ticket-title strong {
  font-weight: 500;
  font-size: 11px;
  color: #304a38;
  display: block;
  line-height: 1.6;
}
.ticket-title:hover strong {
  color: #256344;
  text-decoration: underline;
}
.ticket-title small {
  font-size: 10px;
  color: #606859;
  margin-top: 4px;
}
.ticket-title small > span {
  padding: 0 5px;
}
.ticket-category-icon {
  width: 32px;
  height: 34px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid #e0e8dd;
  background: #f6f8f2;
  color: #5e6a56;
  border-radius: 7px;
}
.ticket-category-icon.electrical {
  color: #73643d;
  background: #fbf9ef;
  border-color: #eee9d6;
}
.ticket-table th {
  padding: 10px 17px;
}
.ticket-table td {
  padding: 16px 17px;
}
.recent-panel .ticket-table th:first-child,
.recent-panel .ticket-table td:first-child {
  padding-left: 22px;
}
.recent-panel .ticket-title {
  min-width: 200px;
}
.recent-panel .ticket-title strong {
  font-size: 10px;
  max-width: 205px;
}
.recent-panel .ticket-table td {
  padding-top: 16px;
  padding-bottom: 16px;
}
.recent-panel .ticket-category-icon {
  width: 29px;
  height: 31px;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  line-height: 1.5;
  font-weight: 500;
  border: 1px solid #e3e7de;
  border-radius: 5px;
  padding: 4px 7px;
  background: #f1f3ed;
  color: #5d6d52;
  white-space: nowrap;
}
.status-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}
.badge.pending {
  background: #faf5e4;
  color: #796423;
  border-color: #eee4bc;
}
.badge.assigned {
  background: #edf2f6;
  color: #4a6b7f;
  border-color: #dbe6ee;
}
.badge.in_progress {
  background: #eff0f8;
  color: #606590;
  border-color: #e1e3ef;
}
.badge.completed {
  background: #edf5e8;
  color: #4f6d3e;
  border-color: #dceacf;
}
.badge.closed {
  background: #edf0ed;
  color: #606c5a;
  border-color: #dee5da;
}
.badge.rejected {
  background: #fff0eb;
  color: #915845;
  border-color: #f0d6cc;
}
.badge.duplicate {
  background: #f1efeb;
  color: #746654;
  border-color: #e6dfd5;
}
.badge.priority {
  background: transparent;
  border: 0;
  padding: 0;
  font-size: 10px;
}
.badge.p1_critical {
  color: #935547;
}
.badge.p2_urgent {
  color: #73652d;
}
.badge.p3_routine {
  color: #576f50;
}
.badge.priority .status-dot {
  width: 5px;
  height: 5px;
}
.row-open {
  display: grid;
  place-items: center;
  padding: 7px;
  color: #5c685a;
  min-width: 25px;
}
.row-open:hover {
  color: #255a3c;
}
.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 19px 22px;
  flex-wrap: wrap;
}
.search-input {
  position: relative;
  flex: 1;
  max-width: 370px;
  min-width: 200px;
}
.search-input > svg {
  position: absolute;
  left: 12px;
  top: 13px;
  color: #5c6959;
}
.search-input input {
  padding-left: 37px !important;
  font-size: 11px;
  min-height: 40px !important;
}
.filter-controls {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
}
.filter-controls select {
  width: auto;
  min-width: 116px;
  font-size: 10px;
  min-height: 40px;
  padding: 9px;
}
.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 22px;
  border-top: 1px solid var(--line);
  font-size: 10px;
  color: #5c6d5a;
}
.table-footer > div {
  display: flex;
  gap: 7px;
}
.overdue-label {
  color: #995840 !important;
}
.availability {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #746758;
}
.availability > span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.availability.available {
  color: #517045;
}
.row-actions {
  display: flex;
  gap: 7px;
}
.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(235px, 1fr));
  gap: 20px;
}
.team-card {
  text-align: center;
  padding: 30px 24px 0;
}
.team-card > p {
  font-size: 11px;
  color: #5e6a5a;
  margin-top: 6px;
}
.team-card .availability {
  margin: 15px 0 25px;
}
.team-workload {
  border-top: 1px solid #e3eadb;
  padding: 15px;
  color: #5f6956;
  font-size: 10px;
}
.team-workload strong {
  font-size: 15px;
  color: #4d6c41;
  margin-right: 5px;
}
/* Report and repair forms */
.report-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(260px, 0.8fr);
  gap: 26px;
  align-items: start;
}
.report-form {
  padding: 30px;
}
.report-form > fieldset {
  border: 0;
  margin: 0;
  padding: 0 0 29px;
  display: grid;
  gap: 20px;
  min-width: 0;
}
.report-form > fieldset + fieldset {
  padding-top: 28px;
  border-top: 1px solid var(--line);
}
.report-form > fieldset > legend {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  float: left;
  width: 100%;
  margin-bottom: 3px;
  font-family: var(--font-heading);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.4px;
}
.report-form > fieldset > legend small {
  display: block;
  font-family: var(--font-body);
  font-size: 10px;
  color: #5e6b5c;
  font-weight: 400;
  letter-spacing: 0;
  margin-top: 6px;
  line-height: 1.6;
}
.step-number {
  display: grid;
  place-items: center;
  width: 29px;
  height: 29px;
  background: #edf2e8;
  color: #5f6e53;
  border: 1px solid #dce6d4;
  border-radius: 7px;
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0;
  flex-shrink: 0;
}
.character-count {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #606c5c;
}
.character-count > span {
  color: #5d6a58;
}
.form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--line);
  padding-top: 24px;
  gap: 12px;
}
.photo-dropzone {
  border: 1px dashed #c5d4bc;
  border-radius: 9px;
  background: #fafcf7;
  position: relative;
}
.photo-picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 26px 12px;
  cursor: pointer;
  gap: 7px;
}
.photo-picker > span {
  display: grid;
  place-items: center;
  width: 43px;
  height: 43px;
  background: #edf3e7;
  border-radius: 10px;
  color: #5b6f51;
  margin-bottom: 5px;
}
.photo-picker strong {
  font-size: 11px;
  font-weight: 600;
}
.photo-picker p {
  font-size: 10px;
  color: #60695b;
  font-weight: 400;
}
.photo-dropzone input[type="file"] {
  font-size: 10px !important;
  max-width: 100%;
  padding: 8px 12px !important;
  border: 0 !important;
  background: transparent !important;
  min-height: 36px !important;
}
.photo-preview {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
}
.photo-preview img {
  width: 65px;
  height: 65px;
  object-fit: cover;
  border-radius: 6px;
}
.photo-preview > span {
  font-size: 11px;
  overflow-wrap: anywhere;
}
.photo-preview small {
  display: block;
  color: var(--muted);
  margin-top: 4px;
}
.photo-preview > button {
  margin-left: auto;
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: #5d6d56;
  padding: 4px;
}
.urgency-field {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.urgency-field > legend {
  margin-bottom: 10px;
}
.urgency-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
}
.urgency-options > label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 12px 10px;
  cursor: pointer;
}
.urgency-options input {
  margin: 2px 0 0;
  width: 13px;
  height: 13px;
}
.urgency-options .selected {
  background: #f1f6eb;
  border-color: #92ad80;
}
.urgency-options strong {
  font-size: 10px;
  color: #4a6341;
  display: block;
  line-height: 1.5;
}
.urgency-options small {
  font-size: 10px;
  display: block;
  color: #5b6950;
  line-height: 1.7;
  margin-top: 3px;
}
.urgency-field .field-hint {
  margin-top: 10px;
}
.report-aside {
  display: grid;
  gap: 20px;
}
.report-tip {
  background: #edf2e7;
  border: 1px solid #dbe5d1;
  border-radius: 11px;
  padding: 27px;
}
.tip-icon {
  display: grid;
  place-items: center;
  width: 45px;
  height: 45px;
  border: 1px solid #cddbbe;
  background: #f8faf1;
  border-radius: 12px;
  color: #556d46;
  margin-bottom: 18px;
}
.report-tip h2 {
  font-size: 23px;
  line-height: 1.35;
  font-weight: 600;
}
.report-tip > p {
  font-size: 11px;
  line-height: 1.9;
  color: #5f6d56;
  margin-top: 13px;
}
.report-tip ol {
  list-style: none;
  padding: 0;
  margin: 24px 0 0;
  display: grid;
  gap: 22px;
}
.report-tip li {
  display: flex;
  gap: 11px;
}
.report-tip li > span {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 1px solid #c5d5b5;
  background: #f5f8ee;
  border-radius: 50%;
  color: #5c6d4f;
  font-size: 10px;
}
.report-tip li strong {
  display: block;
  font-size: 10px;
  font-weight: 600;
  color: #4c6840;
  line-height: 1.6;
}
.report-tip li p {
  font-size: 10px;
  color: #5d6c53;
  line-height: 1.8;
  margin-top: 3px;
}
.location-tip {
  padding: 23px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #f9fbf6;
  color: #606d54;
}
.location-tip h3 {
  font-size: 12px;
  color: #556c47;
  margin: 10px 0 8px;
}
.location-tip p {
  font-size: 10px;
  line-height: 1.9;
  color: #5f6b55;
}
.duplicate-suggestions {
  border: 1px solid #cfdfd0;
  background: #f5faf3;
  border-radius: 8px;
  padding: 15px;
}
.duplicate-suggestions > div:first-child {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #4b724c;
  font-size: 12px;
}
.duplicate-suggestions > p {
  font-size: 10px;
  color: #586f58;
  margin-top: 7px;
}
.duplicate-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid #dfe9dc;
}
.duplicate-item strong {
  font-size: 10px;
  display: block;
}
.duplicate-item small {
  font-size: 10px;
  color: #5c6a56;
  display: block;
  margin-top: 3px;
}
.duplicate-suggestions .checkbox-label {
  margin-top: 13px;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  font-weight: 400;
  line-height: 1.7;
}
.submission-success {
  text-align: center;
  display: grid;
  justify-items: center;
  gap: 18px;
  padding: 60px 25px;
}
.submission-success > svg {
  color: #546c45;
}
.submission-success p {
  max-width: 55ch;
  color: var(--muted);
  font-size: 12px;
}
.lifecycle {
  display: flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  padding: 22px 28px;
  margin-bottom: 26px;
  gap: 10px;
}
.lifecycle > div {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  position: relative;
  color: #60695c;
  font-size: 10px;
}
.lifecycle > div:not(:last-child):after {
  content: "";
  height: 1px;
  background: #e4eade;
  flex: 1;
  margin-right: 10px;
}
.lifecycle > div > span {
  border: 1px solid #dde5d6;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  font-size: 10px;
  background: #fafcf7;
}
.lifecycle strong {
  font-weight: 500;
  white-space: nowrap;
}
.lifecycle .reached {
  color: #466c38;
}
.lifecycle .reached > span {
  background: #e8f0de;
  border-color: #cbddb8;
  color: #487335;
}
.lifecycle .reached:after {
  background: #a9bf95 !important;
}
.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(280px, 0.85fr);
  gap: 24px;
  align-items: start;
}
.detail-main,
.detail-sidebar {
  display: grid;
  gap: 23px;
  min-width: 0;
}
.detail-main .panel-heading,
.detail-sidebar .panel-heading {
  border-bottom: 1px solid var(--line);
}
.detail-main .panel-heading .muted {
  font-size: 10px;
}
.issue-description {
  font-size: 12px;
  line-height: 1.9;
  white-space: pre-wrap;
}
.detail-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 25px;
  padding: 24px 0 0;
  border-top: 1px solid var(--line);
}
.detail-facts > div {
  display: flex;
  gap: 10px;
  color: #5c6c54;
}
.detail-facts small {
  display: block;
  font-size: 10px;
  letter-spacing: 1.1px;
  margin-bottom: 5px;
}
.detail-facts strong {
  display: block;
  font-size: 11px;
  color: #526b47;
  font-weight: 500;
}
.detail-facts p {
  font-size: 10px;
  color: #5e6b54;
  margin-top: 3px;
}
.evidence-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;
  margin-top: 27px;
}
.evidence-grid > a {
  display: block;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  background: #f6f9f0;
}
.evidence-grid img {
  width: 100%;
  height: 200px;
  object-fit: contain;
  background: #f0f3ea;
}
.evidence-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  letter-spacing: 0.8px;
  color: #596b4b;
  padding: 11px 12px;
}
.evidence-grid small {
  display: block;
  padding: 9px 12px;
  overflow-wrap: anywhere;
  color: #5d6b51;
  font-size: 10px;
}
.resolution-notes {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  background: #f2f7ed;
  border: 1px solid #dce9d2;
  padding: 16px;
  border-radius: 7px;
  margin-top: 22px;
  color: #557042;
}
.resolution-notes strong {
  font-size: 11px;
}
.resolution-notes p {
  font-size: 11px;
  color: #5c6f4e;
  margin-top: 7px;
  white-space: pre-wrap;
}
.ticket-timeline {
  list-style: none;
  margin: 0;
  padding: 24px;
}
.ticket-timeline > li {
  display: flex;
  gap: 17px;
  padding-bottom: 23px;
  position: relative;
}
.ticket-timeline > li:last-child {
  padding-bottom: 0;
}
.ticket-timeline > li:not(:last-child):before {
  content: "";
  position: absolute;
  left: 5px;
  top: 9px;
  bottom: -2px;
  width: 1px;
  background: #dbe5d1;
}
.timeline-marker {
  width: 11px;
  height: 11px;
  border: 3px solid #dbe7ce;
  border-radius: 50%;
  background: #799b62;
  flex-shrink: 0;
  margin-top: 4px;
  z-index: 1;
}
.ticket-timeline strong {
  font-size: 11px;
  font-weight: 500;
}
.ticket-timeline p {
  font-size: 10px;
  color: #5e6e54;
  margin-top: 6px;
  line-height: 1.8;
}
.ticket-timeline small {
  font-size: 10px;
  color: #5e6855;
  display: block;
  margin-top: 7px;
}
.repair-overview {
  padding: 4px 23px;
}
.repair-overview > div {
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}
.repair-overview > div:last-child {
  border: 0;
}
.repair-overview span {
  font-size: 10px;
  color: #5c6953;
  display: block;
  margin-bottom: 5px;
}
.repair-overview strong {
  font-size: 11px;
  font-weight: 500;
  color: #4d6840;
  display: block;
}
.action-panel .form-stack {
  gap: 15px;
}
.action-panel .btn {
  width: 100%;
  white-space: normal;
}
.action-panel .muted {
  font-size: 11px;
}
.action-panel .field-hint {
  font-size: 10px;
}
.action-panel h2 {
  font-size: 16px;
}
.action-panel .field label {
  font-size: 11px;
}
.complete-form {
  border-top: 1px solid var(--line);
}
.complete-form h3 {
  margin-bottom: 3px;
}
.detail-sidebar .subtle-note {
  margin: 0;
  font-size: 10px;
}
.comments-list {
  padding: 22px;
}
.comment {
  display: flex;
  gap: 11px;
  padding: 13px 0;
  border-bottom: 1px solid var(--line);
}
.comment:first-child {
  padding-top: 0;
}
.comment > div {
  flex: 1;
  min-width: 0;
}
.comment strong {
  font-size: 10px;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.comment small {
  font-size: 10px;
  color: #606c56;
  font-weight: 400;
}
.comment p {
  font-size: 11px;
  white-space: pre-wrap;
  margin-top: 9px;
  color: #5b6e50;
}
.comments-list > .muted {
  font-size: 11px;
}
.comment-form {
  display: grid;
  justify-items: end;
  gap: 12px;
  margin-top: 21px;
}
.work-logs {
  padding: 0 23px;
}
.work-logs > div {
  padding: 20px 0;
  border-bottom: 1px solid var(--line);
}
.work-logs > div:last-child {
  border: 0;
}
.work-logs strong {
  font-size: 11px;
  font-weight: 500;
}
.work-logs p {
  font-size: 11px;
  color: #5d6d52;
  margin-top: 6px;
}
.work-logs small {
  display: block;
  font-size: 10px;
  color: #5c6952;
  margin-top: 10px;
}
details + details {
  margin-top: 20px;
}
summary {
  font-size: 11px;
  font-weight: 500;
  color: #576e46;
  cursor: pointer;
  padding: 5px 0;
}
details[open] > summary {
  margin-bottom: 15px;
}
/* Reports and administration */
.report-filters {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr;
  gap: 20px;
  padding: 22px;
  margin-bottom: 23px;
}
.report-columns {
  margin-top: 24px;
}
.ranking-list {
  padding: 0 22px 12px;
}
.ranking-list > div {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 15px 0;
  border-bottom: 1px solid var(--line);
}
.ranking-list > div:last-child {
  border: 0;
}
.ranking-list strong {
  display: block;
  font-size: 11px;
  font-weight: 500;
}
.ranking-list small {
  display: block;
  font-size: 10px;
  color: #606c57;
  margin-top: 4px;
}
.ranking-list b {
  font-size: 14px;
  font-weight: 500;
  margin-left: auto;
  color: #5b6f4a;
}
.ranking-number {
  font-size: 10px;
  color: #606954;
  align-self: flex-start;
  margin-top: 2px;
  min-width: 18px;
}
.settings-layout {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 25px;
  align-items: start;
}
.profile-details {
  padding: 3px 24px;
  margin: 0;
}
.profile-details > div {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  padding: 17px 0;
  border-bottom: 1px solid var(--line);
  font-size: 11px;
}
.profile-details > div:last-child {
  border: 0;
}
.profile-details dt {
  color: #5c6952;
  flex-shrink: 0;
}
.profile-details dd {
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
  color: #4d6c3c;
}
.preference-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 25px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 20px;
}
.preference-row strong {
  display: block;
  font-size: 12px;
  font-weight: 500;
}
.preference-row small {
  display: block;
  font-size: 10px;
  line-height: 1.8;
  color: #5e6d51;
  margin-top: 5px;
}
.preference-row input {
  width: 18px;
  height: 18px;
}
.settings-layout .notice {
  font-size: 10px;
  margin: 0;
}
.settings-layout .btn {
  justify-self: start;
}
.notifications-list .notification-item {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding: 24px;
  border-bottom: 1px solid var(--line);
}
.notification-item:last-child {
  border: 0;
}
.notification-item.unread {
  background: #f6f9ef;
}
.notification-item h2 {
  font-size: 13px;
}
.notification-item p {
  font-size: 11px;
  color: #5e6e51;
  margin-top: 6px;
  white-space: pre-wrap;
}
.notification-item small {
  font-size: 10px;
  color: #5e6952;
  display: block;
  margin-top: 10px;
}
.notification-item > svg:last-child {
  margin-left: auto;
  color: #5c6950;
}
.unread-label {
  font-size: 10px;
  background: #e5efd9;
  color: #506f39;
  padding: 3px 8px;
  border-radius: 4px;
  margin-left: auto;
  white-space: nowrap;
}
.admin-form {
  padding: 25px;
  margin-bottom: 24px;
}
.admin-form h2 {
  margin-bottom: 22px;
}
.admin-form > .btn {
  margin-top: 23px;
}
.admin-form .checkbox-label {
  align-self: end;
  min-height: 43px;
}
.tabs {
  display: flex;
  gap: 22px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 24px;
}
.tabs > button {
  padding: 12px 2px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #5f6e52;
  font-size: 11px;
}
.tabs > button[aria-selected="true"] {
  color: #3e6730;
  border-bottom-color: #537c40;
}
.audit-details {
  max-width: 420px;
  white-space: normal;
  overflow-wrap: anywhere;
}
.help-page {
  max-width: 850px;
  margin: auto;
  padding: 45px 30px;
}
.help-page .brand {
  margin-bottom: 70px;
  color: #234e3c;
}
.help-content {
  max-width: 650px;
}
.help-content h1 {
  font-size: 40px;
  margin-bottom: 35px;
  line-height: 1.25;
}
.help-content h2 {
  margin-top: 30px;
  margin-bottom: 10px;
}
.help-content p {
  color: #586f50;
  line-height: 1.9;
  font-size: 14px;
}
.help-content .btn {
  margin-top: 35px;
}
/* Smaller screens */
@media (min-width: 1500px) {
  .page-content {
    padding-top: 42px;
    padding-left: 47px;
    padding-right: 47px;
  }
  .topbar {
    padding-left: 47px;
    padding-right: 47px;
  }
  .welcome-banner {
    min-height: 205px;
  }
  .welcome-banner .campus-illustration {
    width: 360px;
  }
  .ticket-table td {
    padding-top: 19px;
    padding-bottom: 19px;
  }
  .recent-panel .ticket-title strong {
    max-width: 270px;
  }
  .stat {
    padding: 24px 27px;
  }
  .dashboard-columns {
    grid-template-columns: minmax(0, 2fr) minmax(290px, 1fr);
  }
}
@media (max-width: 1190px) {
  .sidebar {
    width: 219px;
    padding-left: 12px;
    padding-right: 12px;
  }
  .workspace-main {
    margin-left: 219px;
  }
  .topbar {
    padding: 0 25px;
  }
  .page-content {
    padding: 30px 25px 0;
  }
  .sidebar .brand {
    font-size: 24px;
  }
  .sidebar-brand {
    padding-left: 10px;
  }
  .nav-link {
    font-size: 10px;
    gap: 9px;
  }
  .dashboard-columns {
    grid-template-columns: minmax(0, 1.65fr) minmax(245px, 1fr);
    gap: 18px;
  }
  .panel-heading {
    padding: 18px;
  }
  .recent-panel .ticket-title {
    min-width: 160px;
  }
  .recent-panel .ticket-title strong {
    font-size: 10px;
    max-width: 150px;
  }
  .recent-panel .ticket-category-icon {
    display: none;
  }
  .recent-panel .ticket-table th,
  .recent-panel .ticket-table td {
    padding: 13px 10px;
  }
  .stat {
    padding: 18px 16px;
  }
  .stat-label {
    font-size: 10px;
  }
  .stat-icon {
    width: 27px;
    height: 27px;
  }
  .stat > span:last-child:not(.stat-label) {
    font-size: 10px;
  }
  .welcome-banner {
    padding: 25px;
  }
  .welcome-banner h2 {
    font-size: 24px;
  }
  .dashboard-bottom {
    gap: 18px;
  }
  .category-bars > div {
    grid-template-columns: 110px 1fr 12px;
    gap: 8px;
    font-size: 10px;
  }
  .steps-inline {
    gap: 5px;
  }
  .steps-inline > div {
    gap: 5px;
  }
  .steps-inline > div > svg {
    display: none;
  }
  .report-layout {
    grid-template-columns: minmax(0, 1.5fr) minmax(235px, 0.8fr);
    gap: 20px;
  }
  .report-form {
    padding: 25px;
  }
  .report-tip {
    padding: 22px;
  }
  .report-tip h2 {
    font-size: 20px;
  }
  .urgency-options {
    gap: 6px;
  }
  .urgency-options > label {
    padding: 10px 7px;
    gap: 5px;
  }
  .detail-layout {
    grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.9fr);
    gap: 20px;
  }
  .lifecycle {
    padding: 19px;
  }
  .lifecycle > div {
    gap: 7px;
    font-size: 10px;
  }
  .lifecycle > div:not(:last-child):after {
    margin-right: 4px;
  }
  .login-story {
    padding: 35px;
  }
  .login-main {
    padding: 35px;
  }
  .login-top > span {
    font-size: 10px;
  }
  .login-story-copy {
    padding-top: 60px;
  }
  .login-story h1 {
    font-size: 47px;
  }
  .login-story-copy > p {
    font-size: 13px;
  }
  .login-story-footer {
    font-size: 10px;
  }
  .login-story-footer > span {
    display: none;
  }
  .login-footer {
    font-size: 10px;
  }
}
@media (max-width: 980px) {
  .dashboard-columns {
    grid-template-columns: 1fr;
  }
  .activity-panel {
    display: none;
  }
  .recent-panel .ticket-title strong {
    max-width: 300px;
    font-size: 11px;
  }
  .recent-panel .ticket-category-icon {
    display: grid;
  }
  .recent-panel .ticket-title {
    min-width: 220px;
  }
  .recent-panel .ticket-table th,
  .recent-panel .ticket-table td {
    padding: 15px 18px;
  }
  .dashboard-bottom {
    grid-template-columns: 1fr;
  }
  .category-bars > div {
    grid-template-columns: 170px 1fr 20px;
    font-size: 11px;
  }
  .how-it-works {
    min-height: 190px;
  }
  .steps-inline {
    justify-content: flex-start;
    gap: 27px;
  }
  .steps-inline > div > svg {
    display: block;
  }
  .welcome-banner .campus-illustration {
    max-width: 35%;
  }
  .welcome-banner h2 {
    font-size: 22px;
  }
  .welcome-banner p {
    max-width: 35ch;
    font-size: 10px;
  }
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .stat:nth-child(2) {
    border-right: 0;
  }
  .stat:nth-child(-n + 2) {
    border-bottom: 1px solid var(--line);
  }
  .stat {
    padding: 18px 22px;
  }
  .stat > span:last-child:not(.stat-label) {
    font-size: 10px;
  }
  .stat-label {
    font-size: 11px;
  }
  .report-layout {
    grid-template-columns: 1fr;
  }
  .report-aside {
    grid-template-columns: 1fr 1fr;
  }
  .report-tip ol {
    display: none;
  }
  .report-tip h2 {
    font-size: 19px;
  }
  .report-tip h2 br {
    display: none;
  }
  .tip-icon {
    display: none;
  }
  .report-tip > p {
    margin-top: 8px;
  }
  .location-tip {
    padding: 20px;
  }
  .detail-layout {
    grid-template-columns: 1fr;
  }
  .detail-sidebar {
    grid-row: 1;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    align-items: start;
  }
  .detail-sidebar > .subtle-note {
    grid-column: 1/-1;
  }
  .detail-sidebar .action-panel:only-child {
    grid-column: 1/-1;
  }
  .detail-sidebar .panel-body {
    padding: 20px;
  }
  .repair-overview {
    padding: 3px 18px;
  }
  .detail-sidebar .panel-heading {
    padding: 19px;
  }
  .detail-sidebar .panel-heading h2 {
    font-size: 14px;
  }
  .detail-sidebar details .field {
    margin-top: 10px;
  }
  .settings-layout {
    grid-template-columns: 1fr;
  }
  .report-filters {
    gap: 13px;
    padding: 18px;
  }
  .report-filters .field label {
    font-size: 10px;
  }
  .report-filters input,
  .report-filters select {
    font-size: 11px;
  }
  .page-title h1 {
    font-size: 27px;
  }
  .page-actions .btn {
    padding: 9px 12px;
    font-size: 10px;
  }
  .topbar-right {
    gap: 15px;
  }
  .demo-pill {
    font-size: 10px;
  }
  .login-page {
    grid-template-columns: 42% 58%;
    min-width: 0;
  }
  .login-story {
    padding: 30px 28px;
  }
  .login-story h1 {
    font-size: 38px;
    letter-spacing: -1.7px;
  }
  .story-kicker {
    font-size: 10px;
    letter-spacing: 1.2px;
  }
  .login-story .campus-illustration {
    margin-top: 30px;
  }
  .login-story-copy > p {
    font-size: 12px;
  }
  .login-main {
    padding: 30px;
  }
  .login-top > span {
    display: none;
  }
  .login-top {
    justify-content: flex-end;
  }
  .story-points {
    font-size: 10px;
  }
  .login-heading h2 {
    font-size: 31px;
  }
  .login-footer > span:last-child {
    display: none;
  }
}
@media (max-width: 760px) {
  .sidebar {
    transform: translateX(-100%);
    transition: transform 0.2s;
    width: 246px;
    padding-top: 25px;
  }
  .sidebar.mobile-open {
    transform: translateX(0);
  }
  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: #0c231f70;
    border: 0;
    z-index: 35;
  }
  .sidebar-brand {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .mobile-close {
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    color: #60695e;
    padding: 4px;
  }
  .workspace-main {
    margin-left: 0;
  }
  .topbar {
    height: 64px;
    padding: 0 20px;
  }
  .menu-button {
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: #4f6d43;
    padding: 0 2px 0 0;
  }
  .breadcrumb {
    font-size: 10px;
    gap: 10px;
  }
  .breadcrumb > span:first-of-type {
    display: none;
  }
  .breadcrumb-divider {
    display: none;
  }
  .topbar-right {
    gap: 15px;
  }
  .demo-pill {
    font-size: 10px;
    padding: 4px 7px;
  }
  .topbar-right > .avatar {
    display: none;
  }
  .page-content {
    padding: 26px 20px 0;
  }
  .page-title {
    gap: 13px;
    margin-bottom: 23px;
  }
  .page-title h1 {
    font-size: 26px;
  }
  .page-title > div > p:not(.eyebrow) {
    font-size: 11px;
    max-width: 38ch;
  }
  .eyebrow {
    font-size: 10px !important;
    letter-spacing: 1.3px;
  }
  .welcome-banner {
    padding: 25px;
    min-height: 175px;
  }
  .welcome-banner h2 {
    font-size: 23px;
  }
  .welcome-banner .campus-illustration {
    max-width: 38%;
    margin-right: -15px;
  }
  .welcome-banner p {
    font-size: 10px;
  }
  .stat > strong {
    font-size: 31px;
  }
  .dashboard-columns .panel-heading h2 {
    font-size: 14px;
  }
  .recent-panel .ticket-title strong {
    max-width: 220px;
  }
  .table-scroll {
    scrollbar-width: thin;
  }
  .workspace-footer {
    font-size: 10px;
    gap: 10px;
  }
  .workspace-footer > span:first-child {
    max-width: 40%;
  }
  .date-chip {
    font-size: 10px;
    padding: 7px 9px;
  }
  .report-form {
    padding: 24px;
  }
  .report-aside {
    display: none;
  }
  .report-layout {
    display: block;
  }
  .detail-sidebar {
    gap: 17px;
  }
  .lifecycle {
    padding: 17px 13px;
    gap: 5px;
  }
  .lifecycle > div {
    font-size: 10px;
    gap: 5px;
  }
  .lifecycle > div > span {
    width: 21px;
    height: 21px;
    font-size: 10px;
  }
  .lifecycle > div:not(:last-child):after {
    margin-right: 0;
    min-width: 3px;
  }
  .page-actions > .badge {
    font-size: 10px;
  }
  .detail-main .panel-heading,
  .detail-main .panel-body {
    padding: 21px;
  }
  .ticket-timeline {
    padding: 21px;
  }
  .page-title:has(.badge) {
    align-items: flex-start;
    flex-direction: column;
  }
  .page-title:has(.badge) h1 {
    max-width: 27ch;
  }
  .report-filters {
    grid-template-columns: 1fr 1fr;
  }
  .report-filters > .field:first-child {
    grid-column: 1/-1;
  }
  .list-toolbar {
    padding: 18px;
    gap: 14px;
  }
  .search-input {
    max-width: none;
    width: 100%;
  }
  .filter-controls {
    width: 100%;
    gap: 7px;
  }
  .filter-controls select {
    flex: 1;
    min-width: 110px;
    font-size: 10px;
  }
  .team-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .team-card {
    padding: 24px 14px 0;
  }
  .team-card h2 {
    font-size: 14px;
  }
  .team-card > p {
    font-size: 10px;
  }
  .team-card .availability {
    font-size: 10px;
  }
  .team-workload {
    font-size: 10px;
  }
  .skip-link {
    left: 20px;
  }
  .login-page {
    display: block;
    background: var(--surface);
  }
  .login-story {
    padding: 25px 25px 24px;
  }
  .login-story .brand {
    font-size: 23px;
  }
  .login-story .brand small {
    font-size: 10px;
    margin-top: 7px;
  }
  .login-story .brand-mark {
    width: 34px;
    height: 34px;
  }
  .login-story-copy {
    padding: 32px 0 0;
    max-width: none;
    position: relative;
  }
  .login-story-copy .campus-illustration {
    display: none;
  }
  .login-story h1 {
    font-size: 33px;
    letter-spacing: -1.3px;
  }
  .login-story h1 br {
    display: none;
  }
  .login-story-copy > p {
    max-width: 46ch;
    font-size: 11px;
    margin-top: 12px;
  }
  .story-kicker {
    font-size: 10px;
    letter-spacing: 1.1px;
    margin-bottom: 11px;
  }
  .story-points,
  .login-story-footer {
    display: none;
  }
  .login-main {
    padding: 21px 25px;
  }
  .login-top {
    position: absolute;
    right: 25px;
    top: 34px;
  }
  .login-top > a {
    color: #c7d7bc;
    font-size: 10px;
  }
  .login-form-wrap {
    padding: 16px 0 35px;
    max-width: 420px;
    margin: auto;
  }
  .login-heading {
    margin: 15px 0 25px;
  }
  .login-heading h2 {
    font-size: 29px;
  }
  .login-heading p {
    font-size: 12px;
  }
  .login-form-wrap .eyebrow {
    display: none;
  }
  .login-form-wrap .form-stack {
    gap: 17px;
  }
  .demo-accounts {
    margin-top: 27px;
  }
  .login-footer {
    justify-content: center;
    font-size: 10px;
    padding: 0 0 8px;
  }
  .login-policy {
    font-size: 10px;
    margin-top: 22px;
  }
  .help-page {
    padding: 30px 25px;
  }
  .help-page .brand {
    margin-bottom: 45px;
  }
  .help-content h1 {
    font-size: 32px;
  }
  .help-content p {
    font-size: 12px;
  }
}
@media (max-width: 480px) {
  .page-content {
    padding: 24px 15px 0;
  }
  .topbar {
    padding: 0 15px;
  }
  .demo-pill {
    max-width: 100px;
    line-height: 1.3;
    font-size: 10px;
  }
  .breadcrumb {
    font-size: 10px;
    gap: 8px;
  }
  .topbar-right {
    gap: 12px;
  }
  .page-title h1 {
    font-size: 24px;
  }
  .page-title > div > p:not(.eyebrow) {
    font-size: 10px;
  }
  .page-title .page-actions {
    gap: 6px;
  }
  .page-title .btn {
    font-size: 10px;
    gap: 6px;
    padding: 8px 11px;
  }
  .page-title .btn > svg {
    width: 14px;
    height: 14px;
  }
  .welcome-banner {
    min-height: 177px;
    padding: 24px;
  }
  .welcome-banner .campus-illustration {
    display: none;
  }
  .welcome-banner p {
    max-width: 40ch;
  }
  .welcome-banner h2 {
    font-size: 24px;
  }
  .banner-eyebrow {
    font-size: 10px;
    letter-spacing: 1.1px;
  }
  .welcome-banner a {
    font-size: 10px;
  }
  .stats-row {
    margin-bottom: 21px;
  }
  .stat {
    padding: 16px 17px;
  }
  .stat > strong {
    font-size: 30px;
  }
  .stat-label {
    font-size: 10px;
  }
  .stat > span:last-child:not(.stat-label) {
    font-size: 10px;
  }
  .stat-icon {
    width: 25px;
    height: 25px;
  }
  .stat-icon svg {
    width: 15px;
    height: 15px;
  }
  .panel-heading {
    padding: 19px;
  }
  .dashboard-columns .panel-heading {
    padding: 19px 17px;
  }
  .panel-heading .text-link {
    font-size: 10px;
    gap: 6px;
  }
  .recent-panel .ticket-table th,
  .recent-panel .ticket-table td {
    padding: 12px;
  }
  .recent-panel .ticket-table th:first-child,
  .recent-panel .ticket-table td:first-child {
    padding-left: 17px;
  }
  .recent-panel .ticket-category-icon {
    display: none;
  }
  .recent-panel .ticket-title {
    min-width: 155px;
  }
  .recent-panel .ticket-title strong {
    font-size: 10px;
    max-width: 170px;
  }
  .recent-panel .ticket-title small {
    font-size: 10px;
  }
  .recent-panel .ticket-table th:nth-child(3),
  .recent-panel .ticket-table td:nth-child(3) {
    display: none;
  }
  .badge {
    font-size: 10px;
    padding: 3px 6px;
  }
  .recent-panel td:last-child,
  .recent-panel th:last-child {
    padding-left: 0;
    padding-right: 9px;
  }
  .row-open {
    padding: 4px;
  }
  .dashboard-bottom .panel-heading {
    padding: 20px;
  }
  .category-bars {
    padding: 0 20px 22px;
  }
  .category-bars > div {
    grid-template-columns: 132px 1fr 13px;
    font-size: 10px;
    gap: 12px;
  }
  .how-it-works {
    padding: 22px;
  }
  .how-it-works h2 {
    font-size: 20px;
  }
  .steps-inline {
    gap: 13px;
  }
  .steps-inline > div {
    font-size: 10px;
  }
  .steps-inline > div > svg {
    display: none;
  }
  .workspace-footer {
    margin-top: 27px;
    font-size: 10px;
    padding-bottom: 20px;
  }
  .workspace-footer > span:last-child {
    gap: 4px;
  }
  .workspace-footer > span:first-child {
    max-width: 42%;
  }
  .report-form {
    padding: 21px 17px;
  }
  .report-form > fieldset > legend {
    font-size: 15px;
  }
  .report-form > fieldset > legend small {
    font-size: 10px;
  }
  .report-form > fieldset {
    gap: 17px;
  }
  .form-grid {
    grid-template-columns: 1fr;
    gap: 17px;
  }
  .report-form > fieldset + fieldset {
    padding-top: 25px;
  }
  .urgency-options {
    grid-template-columns: 1fr;
  }
  .urgency-options > label {
    align-items: center;
    padding: 11px 12px;
    gap: 10px;
  }
  .urgency-options input {
    width: 15px;
    height: 15px;
    margin: 0;
  }
  .urgency-options > label > span {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 1;
    gap: 12px;
  }
  .urgency-options small {
    font-size: 10px;
    margin: 0;
  }
  .urgency-options strong {
    font-size: 11px;
  }
  .photo-picker {
    padding: 23px 10px;
  }
  .photo-picker strong {
    font-size: 10px;
  }
  .photo-picker p {
    font-size: 10px;
  }
  .field label {
    font-size: 11px;
  }
  .field-hint {
    font-size: 10px;
  }
  .form-footer .btn {
    padding: 9px 12px;
    font-size: 10px;
  }
  .detail-sidebar {
    grid-template-columns: 1fr;
  }
  .detail-main {
    gap: 19px;
  }
  .detail-layout {
    gap: 19px;
  }
  .detail-sidebar .panel:not(.action-panel):has(details) {
    order: 2;
  }
  .detail-facts {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .lifecycle {
    align-items: flex-start;
    padding: 16px 9px;
  }
  .lifecycle > div {
    flex-direction: column;
    gap: 8px;
    text-align: center;
    font-size: 10px;
    line-height: 1.5;
  }
  .lifecycle > div > span {
    width: 21px;
    height: 21px;
  }
  .lifecycle > div:not(:last-child):after {
    position: absolute;
    top: 10px;
    left: calc(50% + 12px);
    right: calc(-50% + 10px);
    width: auto;
    margin: 0;
  }
  .lifecycle strong {
    white-space: normal;
    max-width: 50px;
    font-size: 10px;
  }
  .evidence-grid {
    grid-template-columns: 1fr;
  }
  .evidence-grid img {
    height: 190px;
  }
  .ticket-timeline p {
    font-size: 10px;
  }
  .notifications-list .notification-item {
    padding: 18px;
    gap: 10px;
    flex-wrap: wrap;
  }
  .notification-item > div {
    flex: 1;
    min-width: 180px;
  }
  .notification-item > svg:last-child {
    display: none;
  }
  .notification-item h2 {
    font-size: 12px;
  }
  .unread-label {
    font-size: 10px;
    margin-left: 39px;
  }
  .settings-layout .panel-body {
    padding: 21px;
  }
  .profile-details {
    padding: 0 20px;
  }
  .profile-details > div {
    font-size: 10px;
  }
  .preference-row {
    gap: 15px;
  }
  .preference-row small {
    font-size: 10px;
  }
  .report-filters {
    gap: 13px;
  }
  .report-columns .panel-heading h2 {
    font-size: 13px;
  }
  .ranking-list {
    padding: 0 19px 9px;
  }
  .ranking-list strong {
    font-size: 10px;
  }
  .admin-form {
    padding: 21px;
  }
  .team-grid {
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .team-card {
    padding-top: 23px;
  }
  .team-card h2 {
    font-size: 12px;
  }
  .team-card > p {
    font-size: 10px;
  }
  .team-workload {
    padding: 14px 0;
  }
  .team-card .avatar {
    width: 48px;
    height: 48px;
    font-size: 15px;
  }
  .list-toolbar .filter-controls select {
    min-width: 95px;
  }
  .notice {
    font-size: 11px;
  }
  .date-chip {
    font-size: 10px;
    gap: 6px;
    padding: 7px;
  }
  .toast {
    right: 15px;
    bottom: 15px;
    font-size: 11px;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *:before,
  *:after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
@media print {
  body {
    background: white;
    color: #202b20;
    font-size: 11px;
  }
  .sidebar,
  .topbar,
  .page-actions,
  .no-print,
  .workspace-footer,
  .toast,
  .skip-link {
    display: none !important;
  }
  .workspace-main {
    margin-left: 0;
  }
  .page-content {
    padding: 15px;
    max-width: none;
  }
  .page-title {
    margin-bottom: 20px;
  }
  .panel {
    break-inside: avoid;
    box-shadow: none;
    border-color: #ddd;
  }
  .stats-row {
    break-inside: avoid;
  }
  .stat {
    padding: 14px;
  }
  .stat > strong {
    font-size: 25px;
  }
  .dashboard-columns {
    grid-template-columns: 1fr;
  }
  .table-scroll {
    overflow: visible;
  }
  th,
  td {
    padding: 10px;
  }
  a {
    text-decoration: none;
  }
  .subtle-note {
    color: #555;
  }
  .report-columns {
    display: block;
  }
  .report-columns > .panel {
    margin-bottom: 20px;
  }
  .panel-heading {
    padding: 16px;
  }
  .badge {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}

.help-page .brand small {
  color: #576b51;
}
````

## src/app/help/page.tsx

````tsx
import { Brand } from "@/components/ui/common";
import Link from "next/link";
export default function Help() {
  return (
    <main className="help-page">
      <Brand />
      <div className="help-content">
        <span className="eyebrow">CAMPUSFIX HELP</span>
        <h1>A little help goes a long way.</h1>
        <h2>Report a campus issue</h2>
        <p>
          Sign in with your university account. Select Report an issue. Choose
          the exact location and category. Add a clear description and an
          optional JPG or PNG photo up to 4.5 MB.
        </p>
        <h2>Follow a repair</h2>
        <p>
          Open My reports to see the current status. You can add comments and
          check the activity history. When work is complete, confirm the repair
          or select Report a problem.
        </p>
        <h2>Use the course demo</h2>
        <p>
          The sign-in page has demo accounts for students, technicians,
          dispatchers, and administrators. All records are for testing. Email
          and SMS delivery records are test records.
        </p>
        <h2>When your connection stops</h2>
        <p>
          A report form that is already open can save a draft or queue a
          submission. Keep the application open or return when the connection is
          back. CampusFix checks your sign-in before it sends queued reports.
        </p>
        <h2>Account help</h2>
        <p>
          Ask your course demonstration administrator to unlock or activate your
          account. This project has no connection to the official university
          account system.
        </p>
        <h2>Immediate hazards</h2>
        <p>
          Move away from danger and use the established university emergency
          contact process. This course demonstration is not monitored by campus
          emergency staff.
        </p>
        <Link className="btn btn-primary" href="/login">
          Return to sign in
        </Link>
      </div>
    </main>
  );
}
````

## src/app/layout.tsx

````tsx
import "@fontsource-variable/manrope";
import "@fontsource-variable/public-sans";
import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "CampusFix | A better campus", template: "%s | CampusFix" },
  description:
    "Report campus faults, follow repairs, and keep our campus moving.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "CampusFix" },
};
export const viewport: Viewport = {
  themeColor: "#173d33",
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
````

## src/app/login/page.tsx

````tsx
import { Login } from "@/components/login";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect("/app");
  return <Login demo={process.env.DEMO_MODE === "true"} />;
}
````

## src/app/page.tsx

````tsx
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getUser();
  redirect(user ? "/app" : "/login");
}
````

## src/components/campus-app.tsx

````tsx
"use client";
import { api } from "@/lib/client";
import {
  facultyLabel,
  formatDate,
  isManager,
  isReporter,
  label,
  type Ticket,
  type User,
} from "@/lib/domain";
import { flushReports, queuedCount } from "@/lib/offline";
import type { LucideIcon } from "lucide-react";
import {
  Activity as ActivityIcon,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Leaf,
  LifeBuoy,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Users,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AuditPage,
  DeliveriesPage,
  ReferencePage,
  ReportsPage,
  SettingsPage,
  UsersPage,
} from "./management";
import { NewReport } from "./new-report";
import { useResource } from "./resource";
import { TicketPage } from "./ticket-page";
import type {
  DashboardData,
  Notification,
  ReferenceData,
  TicketListData,
} from "./types";
import { Button } from "./ui/button";
import {
  Badge,
  Brand,
  Busy,
  CampusIllustration,
  Empty,
  Loading,
  Notice,
  PageTitle,
} from "./ui/common";
import { useClock } from "./use-clock";

export function CampusApp({ user, view }: { user: User; view: string[] }) {
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState(0);
  const [toast, setToast] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const reference = useResource<ReferenceData>("/api/reference");
  const summary = useResource<DashboardData>("/api/dashboard", 30_000);
  const refreshSummary = summary.refresh;
  const page = view[0] ?? "overview";
  const manager = isManager(user.role);
  const reporter = isReporter(user.role);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    const sync = async () => {
      setOnline(navigator.onLine);
      try {
        if (navigator.onLine)
          await flushReports(user.user_id, (id) => {
            setToast(`Report ${id} was sent.`);
            refreshSummary();
          });
        setQueue(await queuedCount(user.user_id));
      } catch (error) {
        if (navigator.onLine)
          setToast(
            error instanceof Error
              ? error.message
              : "Your queued report is saved. Try again when you are signed in.",
          );
      }
    };
    void sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const timer = setInterval(sync, 30_000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      clearInterval(timer);
    };
  }, [user.user_id, refreshSummary]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  const links: {
    href: string;
    label: string;
    icon: LucideIcon;
    count?: number;
  }[] = [
    { href: "/app", label: "Overview", icon: LayoutDashboard },
    {
      href: "/app/tickets",
      label: manager
        ? "All reports"
        : user.role === "TECHNICIAN"
          ? "My work orders"
          : "My reports",
      icon: ClipboardList,
      count: summary.data?.counts.active,
    },
    ...(reporter
      ? [{ href: "/app/report", label: "Report an issue", icon: Plus }]
      : []),
    ...(manager
      ? [
          {
            href: "/app/reports",
            label: "Reports and insights",
            icon: ActivityIcon,
          },
          { href: "/app/team", label: "Maintenance team", icon: Users },
        ]
      : []),
    {
      href: "/app/notifications",
      label: "Notifications",
      icon: Bell,
      count: summary.data?.unread,
    },
  ];
  const adminLinks =
    user.role === "FMD_ADMIN"
      ? [
          { href: "/app/users", label: "Accounts", icon: ShieldCheck },
          {
            href: "/app/reference",
            label: "Campus directory",
            icon: GraduationCap,
          },
          { href: "/app/audit", label: "Audit history", icon: FileText },
        ]
      : [];
  const current =
    page === "tickets" && view[1]
      ? "Report details"
      : page === "report"
        ? "Report an issue"
        : ([
            ...links,
            ...adminLinks,
            { href: "/app/settings", label: "Preferences" },
            { href: "/app/deliveries", label: "Message delivery" },
          ].find(
            (link) =>
              link.href === `/app${page === "overview" ? "" : "/" + page}`,
          )?.label ?? "Workspace");
  async function signOut() {
    setSigningOut(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Sign-out failed.");
      setSigningOut(false);
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="mobile-close"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-icon">
            <GraduationCap size={18} aria-hidden="true" />
          </span>
          <div>
            UTech, Jamaica
            <small>
              {manager
                ? "Facilities workspace"
                : user.role === "TECHNICIAN"
                  ? "Technician workspace"
                  : "Campus community"}
            </small>
          </div>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobile(false)}
              className={`nav-link ${(link.href === "/app" ? page === "overview" : link.href === `/app/${page}`) ? "active" : ""}`}
              aria-current={
                (
                  link.href === "/app"
                    ? page === "overview"
                    : link.href === `/app/${page}`
                )
                  ? "page"
                  : undefined
              }
            >
              <link.icon size={19} strokeWidth={1.7} aria-hidden="true" />
              {link.label}
              {!!link.count && <span className="nav-count">{link.count}</span>}
            </Link>
          ))}
        </nav>
        {adminLinks.length > 0 && (
          <>
            <div className="nav-label">ADMINISTRATION</div>
            <nav aria-label="Administration">
              {adminLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`nav-link ${link.href === `/app/${page}` ? "active" : ""}`}
                >
                  <link.icon size={18} aria-hidden="true" />
                  {link.label}
                </Link>
              ))}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Leaf size={21} aria-hidden="true" />
            <strong>A little care goes a long way.</strong>
            <p>Every report helps make our campus a better place.</p>
            <Link href="/help">
              How CampusFix works <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <Link
            href="/app/settings"
            className={`nav-link ${page === "settings" ? "active" : ""}`}
          >
            <Settings2 size={18} aria-hidden="true" />
            Preferences
          </Link>
          <Link href="/help" className="nav-link">
            <LifeBuoy size={18} aria-hidden="true" />
            Help and support
          </Link>
          <div className="sidebar-profile">
            <span className="avatar">
              {user.full_name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{user.full_name}</strong>
              <small>{label(user.role)}</small>
            </div>
            <button
              onClick={signOut}
              disabled={signingOut}
              aria-label="Sign out"
            >
              {signingOut ? <Busy /> : <LogOut size={17} />}
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="menu-button"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{current}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span />
              Course demonstration
            </span>
            <Link
              href="/app/notifications"
              className="notification-button"
              aria-label={`Notifications, ${summary.data?.unread ?? 0} unread`}
            >
              <Bell size={20} />
              {!!summary.data?.unread && <i />}
            </Link>
            <span className="avatar avatar-small">
              {user.full_name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
          </div>
        </header>
        <main id="main-content" className="page-content" tabIndex={-1}>
          {(!online || queue > 0) && (
            <Notice tone="info">
              <WifiOff size={16} aria-hidden="true" />{" "}
              {online
                ? `${queue} report(s) are waiting to send.`
                : "You are offline. Open report forms can save drafts and queue submissions."}
            </Notice>
          )}
          {toast && (
            <div className="toast" role="status">
              <CheckCircle2 size={18} aria-hidden="true" />
              {toast}
              <button onClick={() => setToast("")} aria-label="Dismiss message">
                <X size={15} />
              </button>
            </div>
          )}
          {reference.error ? (
            <Notice>{reference.error}</Notice>
          ) : !reference.data ? (
            <Loading />
          ) : page === "overview" ? (
            <Overview user={user} resource={summary} />
          ) : page === "report" && reporter ? (
            <NewReport
              user={user}
              reference={reference.data}
              onQueued={() => {
                queuedCount(user.user_id).then(setQueue);
              }}
            />
          ) : page === "tickets" && view[1] ? (
            <TicketPage
              key={view[1]}
              user={user}
              ticketId={view[1]}
              reference={reference.data}
              onChange={summary.refresh}
            />
          ) : page === "tickets" ? (
            <TicketList user={user} />
          ) : page === "reports" && manager ? (
            <ReportsPage />
          ) : page === "team" && manager ? (
            <Team reference={reference.data} />
          ) : page === "notifications" ? (
            <Notifications refresh={summary.refresh} />
          ) : page === "settings" ? (
            <SettingsPage user={user} />
          ) : page === "users" && user.role === "FMD_ADMIN" ? (
            <UsersPage />
          ) : page === "reference" && user.role === "FMD_ADMIN" ? (
            <ReferencePage
              reference={reference.data}
              refresh={reference.refresh}
            />
          ) : page === "audit" && user.role === "FMD_ADMIN" ? (
            <AuditPage />
          ) : page === "deliveries" && manager ? (
            <DeliveriesPage />
          ) : (
            <Empty
              title="This page is not available"
              text="Return to your workspace to see the pages for your account."
              href="/app"
              action="Open overview"
            />
          )}
          <footer className="workspace-footer">
            <span>CampusFix · University facilities services</span>
            <span>
              <span className="live-dot" /> {online ? "Connected" : "Offline"}{" "}
              <span className="footer-separator">·</span> All times in Jamaica
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Overview({
  user,
  resource,
}: {
  user: User;
  resource: ReturnType<typeof useResource<DashboardData>>;
}) {
  if (resource.error) return <Notice>{resource.error}</Notice>;
  if (!resource.data) return <Loading />;
  const { counts, recent, activity, categories } = resource.data;
  const manager = isManager(user.role);
  const reporter = isReporter(user.role);
  return (
    <>
      <PageTitle
        eyebrow={
          manager
            ? "FACILITIES AT A GLANCE"
            : user.role === "TECHNICIAN"
              ? "YOUR WORKSPACE"
              : "YOUR CAMPUS, CARED FOR"
        }
        title={`Hello, ${user.full_name.split(" ")[0]}.`}
        description={
          manager
            ? "Here is what needs your team's attention today."
            : user.role === "TECHNICIAN"
              ? "A clear view of your jobs and what comes next."
              : "A small report can make a big difference."
        }
      >
        {reporter ? (
          <Button asChild>
            <Link href="/app/report">
              <Plus size={17} aria-hidden="true" />
              Report an issue
            </Link>
          </Button>
        ) : (
          <span className="date-chip">
            <CalendarDays size={16} aria-hidden="true" />
            {new Intl.DateTimeFormat("en-JM", {
              timeZone: "America/Jamaica",
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(new Date())}
          </span>
        )}
      </PageTitle>
      <section className="welcome-banner">
        <div>
          <span className="banner-eyebrow">
            <span />
            WORKING TOGETHER, EVERY DAY
          </span>
          <h2>
            {manager
              ? "Keep campus moving."
              : user.role === "TECHNICIAN"
                ? "Good work starts with you."
                : "A better campus starts here."}
          </h2>
          <p>
            {manager
              ? `${counts.active} active reports. One place to keep every repair on track.`
              : user.role === "TECHNICIAN"
                ? "Your next job, the right details, and a clear path to completion."
                : "Report what needs a little care. Track the repair. Get back to your day."}
          </p>
          <Link href={reporter ? "/app/report" : "/app/tickets"}>
            {reporter ? "Tell us what needs fixing" : "View the work queue"}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <CampusIllustration />
      </section>
      <div className="stats-row">
        {[
          {
            title: "Active reports",
            value: counts.active,
            caption: "Awaiting or receiving care",
            icon: ClipboardList,
            color: "green",
          },
          {
            title: manager ? "Awaiting review" : "Pending",
            value: counts.pending,
            caption: "Ready for facilities review",
            icon: Clock3,
            color: "amber",
          },
          {
            title: "Completed",
            value: counts.completed,
            caption: "Repairs made and confirmed",
            icon: CheckCheck,
            color: "blue",
          },
          {
            title: "Past deadline",
            value: counts.overdue,
            caption: "Need a little extra attention",
            icon: TriangleAlert,
            color: "rose",
          },
        ].map((stat) => (
          <div className="stat" key={stat.title}>
            <div className="stat-label">
              {stat.title}
              <span className={`stat-icon ${stat.color}`}>
                <stat.icon size={18} aria-hidden="true" />
              </span>
            </div>
            <strong>{stat.value.toString().padStart(2, "0")}</strong>
            <span>{stat.caption}</span>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>
                {manager
                  ? "Recent reports"
                  : user.role === "TECHNICIAN"
                    ? "Your latest work orders"
                    : "Your recent reports"}
              </h2>
              <p>A quick look at the latest updates.</p>
            </div>
            <Link href="/app/tickets" className="text-link">
              View all
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <TicketTable tickets={recent} compact />
          {!recent.length && (
            <Empty
              href={reporter ? "/app/report" : undefined}
              action="Report an issue"
            />
          )}
        </section>
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Latest activity</h2>
              <p>Every step, kept in view.</p>
            </div>
            <span className="live-indicator">
              <span />
              LIVE
            </span>
          </div>
          <div className="activity-feed">
            {activity.slice(0, 5).map((item) => (
              <Link
                href={`/app/tickets/${item.ticket_id}`}
                className="activity-item"
                key={item.audit_id}
              >
                <span
                  className={`activity-icon ${item.event_code.includes("COMPLET") ? "green" : ""}`}
                >
                  {item.event_code.includes("ASSIGN") ? (
                    <Wrench size={15} aria-hidden="true" />
                  ) : item.event_code.includes("COMPLET") ? (
                    <CheckCheck size={15} aria-hidden="true" />
                  ) : (
                    <ClipboardList size={15} aria-hidden="true" />
                  )}
                </span>
                <div>
                  <strong>{label(item.event_code)}</strong>
                  <p>
                    {item.ticket_id} · {item.full_name ?? "CampusFix"}
                  </p>
                  <small>{formatDate(item.created_at)}</small>
                </div>
              </Link>
            ))}
            {!activity.length && (
              <p className="muted">Your report updates will appear here.</p>
            )}
          </div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>What needs care</h2>
              <p>Active reports by issue type.</p>
            </div>
            <SlidersHorizontal size={18} aria-hidden="true" />
          </div>
          <div className="category-bars">
            {categories.length ? (
              categories.slice(0, 4).map((item) => (
                <div key={item.category_name}>
                  <span>{item.category_name}</span>
                  <div className="bar-track">
                    <div
                      style={{
                        width: `${Math.max(5, (item.count / Math.max(...categories.map((c) => c.count))) * 100)}%`,
                      }}
                    />
                  </div>
                  <strong>{item.count}</strong>
                </div>
              ))
            ) : (
              <p className="muted">There are no active reports.</p>
            )}
          </div>
        </section>
        <section className="how-it-works">
          <div className="section-eyebrow">
            <Leaf size={18} aria-hidden="true" />A SMALL ACTION. A REAL
            DIFFERENCE.
          </div>
          <h2>From reported to repaired.</h2>
          <div className="steps-inline">
            {["Report", "Review", "Repair", "Confirm"].map((step, i) => (
              <div key={step}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {step}
                {i < 3 && <ArrowRight size={14} aria-hidden="true" />}
              </div>
            ))}
          </div>
          <Link href="/help" className="text-link">
            Learn how it works
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </>
  );
}
export function TicketTable({
  tickets,
  compact = false,
}: {
  tickets: Ticket[];
  compact?: boolean;
}) {
  const now = useClock();
  return (
    <div className="table-scroll">
      <table className="ticket-table">
        <thead>
          <tr>
            <th>Report</th>
            {!compact && <th>Location</th>}
            <th>Status</th>
            <th>Priority</th>
            {!compact && <th>Technician</th>}
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.ticket_id}>
              <td>
                <Link
                  className="ticket-title"
                  href={`/app/tickets/${ticket.ticket_id}`}
                >
                  <span
                    className={`ticket-category-icon ${ticket.category_name === "Electrical" ? "electrical" : ""}`}
                  >
                    <Wrench size={17} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{ticket.title}</strong>
                    <small>
                      {ticket.ticket_id} <span>·</span>{" "}
                      {compact ? ticket.building_name : ticket.category_name}
                    </small>
                  </span>
                </Link>
              </td>
              {!compact && (
                <td>
                  <span className="table-main">{ticket.building_name}</span>
                  <small>{ticket.room_number}</small>
                </td>
              )}
              <td>
                <Badge value={ticket.status} />
              </td>
              <td>
                <Badge value={ticket.priority} priority />
              </td>
              {!compact && (
                <td>
                  <span className="table-main">
                    {ticket.technician_name ?? "Unassigned"}
                  </span>
                  {new Date(ticket.sla_deadline).getTime() < now &&
                    ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(
                      ticket.status,
                    ) && <small className="overdue-label">Past deadline</small>}
                </td>
              )}
              <td>
                <Link
                  className="row-open"
                  href={`/app/tickets/${ticket.ticket_id}`}
                  aria-label={`Open ${ticket.ticket_id}`}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function TicketList({ user }: { user: User }) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [query, setQuery] = useState(search);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [faculty, setFaculty] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({
    search: query,
    status,
    priority,
    faculty,
    page: String(page),
  });
  const resource = useResource<TicketListData>(
    `/api/tickets?${params}`,
    30_000,
  );
  return (
    <>
      <PageTitle
        eyebrow="REPORTS AND REPAIRS"
        title={
          isManager(user.role)
            ? "All reports"
            : user.role === "TECHNICIAN"
              ? "My work orders"
              : "My reports"
        }
        description={
          isManager(user.role)
            ? "Review, prioritise, and keep every repair moving."
            : "All the details. Every step of the way."
        }
      >
        {isReporter(user.role) && (
          <Button asChild>
            <Link href="/app/report">
              <Plus size={17} aria-hidden="true" />
              Report an issue
            </Link>
          </Button>
        )}
      </PageTitle>
      <div className="panel">
        <div className="list-toolbar">
          <div className="search-input">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Search reports"
              placeholder="Search by report, ID, or building..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-controls">
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {[
                "PENDING",
                "ASSIGNED",
                "IN_PROGRESS",
                "COMPLETED",
                "CLOSED",
                "DUPLICATE",
                "REJECTED",
              ].map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by priority"
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All priorities</option>
              {["P1_CRITICAL", "P2_URGENT", "P3_ROUTINE"].map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by faculty"
              value={faculty}
              onChange={(e) => {
                setFaculty(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All faculties</option>
              {Object.entries(facultyLabel).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {resource.error ? (
          <Notice>{resource.error}</Notice>
        ) : !resource.data ? (
          <Loading />
        ) : resource.data.tickets.length ? (
          <TicketTable tickets={resource.data.tickets} />
        ) : (
          <Empty
            title="No matching reports"
            text="Try another search or filter."
          />
        )}
        <div className="table-footer">
          <span>
            {resource.data?.total ?? 0} report(s)
            <span className="muted"> · Page {page}</span>
          </span>
          <div>
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous page"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              disabled={!resource.data || page * 25 >= resource.data.total}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>
      <div className="subtle-note">
        <ShieldCheck size={16} aria-hidden="true" />
        You can view only the reports allowed by your account.
      </div>
    </>
  );
}
function Team({ reference }: { reference: ReferenceData }) {
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE BEHIND THE REPAIRS"
        title="Maintenance team"
        description="The right skills, ready to help."
      />
      <div className="team-grid">
        {reference.technicians.map((tech) => (
          <div className="panel team-card" key={tech.tech_id}>
            <span className="avatar avatar-large">
              {tech.full_name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </span>
            <h2>{tech.full_name}</h2>
            <p>{label(tech.trade_specialty)}</p>
            <span
              className={`availability ${tech.is_available && tech.is_active ? "available" : ""}`}
            >
              <span />
              {tech.is_available && tech.is_active
                ? "Available"
                : "Unavailable"}
            </span>
            <div className="team-workload">
              <strong>{tech.active_workload}</strong> active work order(s)
            </div>
          </div>
        ))}
      </div>
      <p className="subtle-note">
        Administrators can change technician availability from Accounts.
      </p>
    </>
  );
}
function Notifications({ refresh }: { refresh: () => void }) {
  const resource = useResource<Notification[]>("/api/notifications", 20_000);
  const [error, setError] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="STAY IN THE LOOP"
        title="Notifications"
        description="The latest news about your reports."
      >
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await api("/api/notifications", { method: "PATCH" });
              resource.refresh();
              refresh();
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not mark notifications as read.",
              );
            }
          }}
        >
          <CheckCheck size={16} aria-hidden="true" />
          Mark all as read
        </Button>
      </PageTitle>
      {(error || resource.error) && <Notice>{error || resource.error}</Notice>}
      <section className="panel notifications-list">
        {!resource.data ? (
          <Loading />
        ) : resource.data.length ? (
          resource.data.map((item) => (
            <Link
              className={`notification-item ${!item.read_at ? "unread" : ""}`}
              href={`/app/tickets/${item.ticket_id}`}
              key={item.notification_id}
            >
              <span className="activity-icon">
                <Bell size={18} aria-hidden="true" />
              </span>
              <div>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
                <small>
                  {item.ticket_id} · {formatDate(item.created_at)}
                </small>
              </div>
              {!item.read_at && <span className="unread-label">Unread</span>}
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          ))
        ) : (
          <Empty
            title="You are all caught up"
            text="New report updates will appear here when in-app notifications are on."
          />
        )}
      </section>
    </>
  );
}
````

## src/components/login.tsx

````tsx
"use client";
import { api } from "@/lib/client";
import {
  ArrowRight,
  Building2,
  Check,
  Eye,
  EyeOff,
  GraduationCap,
  Leaf,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui/button";
import { Brand, Busy, CampusIllustration, Field, Notice } from "./ui/common";
export function Login({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      router.replace("/app");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-in failed.");
      setBusy(false);
    }
  }
  const demos = [
    { id: "student", label: "Student", icon: GraduationCap },
    { id: "technician", label: "Technician", icon: Wrench },
    { id: "dispatcher", label: "Dispatcher", icon: Building2 },
    { id: "admin", label: "Administrator", icon: ShieldCheck },
  ];
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand />
        <div className="login-story-copy">
          <span className="story-kicker">
            <span />A CAMPUS THAT WORKS FOR YOU
          </span>
          <h1>
            Small reports.
            <br />A better campus.
          </h1>
          <p>
            From a flickering light to a leaking tap. Let us know what needs
            care. We will take it from here.
          </p>
          <CampusIllustration />
          <div className="story-points">
            {[
              "Report an issue in minutes",
              "Follow every step of the repair",
              "See the difference you make",
            ].map((text) => (
              <div key={text}>
                <Check size={17} aria-hidden="true" />
                {text}
              </div>
            ))}
          </div>
        </div>
        <div className="login-story-footer">
          <Leaf size={16} aria-hidden="true" />
          Built for our campus community.<span>UTech, Jamaica</span>
        </div>
      </section>
      <section className="login-main">
        <div className="login-top">
          <span>UNIVERSITY FACILITIES SERVICES</span>
          <a href="/help">
            Need a hand? <ArrowRight size={14} aria-hidden="true" />
          </a>
        </div>
        <div className="login-form-wrap">
          <div className="login-heading">
            <span className="eyebrow">WELCOME TO CAMPUSFIX</span>
            <h2>Good to see you.</h2>
            <p>Sign in to keep your campus moving.</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            {error && <Notice>{error}</Notice>}
            <Field label="University email or ID" htmlFor="identifier">
              <input
                id="identifier"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. student@utech.edu.jm"
                required
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <div className="password-input">
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            <div className="login-help">
              <ShieldCheck size={15} aria-hidden="true" />
              Your account decides which workspace you can use.
            </div>
            <Button type="submit" disabled={busy} className="login-submit">
              {busy ? <Busy /> : null}Sign in
              <ArrowRight size={17} aria-hidden="true" />
            </Button>
          </form>
          {demo && (
            <div className="demo-accounts">
              <div className="divider-label">
                <span />
                EXPLORE THE COURSE DEMO
                <span />
              </div>
              <p>Select an account, then sign in.</p>
              <div className="demo-grid">
                {demos.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={
                      identifier === `${item.id}@utech.edu.jm`
                        ? "demo-choice selected"
                        : "demo-choice"
                    }
                    onClick={() => {
                      setIdentifier(`${item.id}@utech.edu.jm`);
                      setPassword("CampusFix2026!");
                      setError("");
                    }}
                  >
                    <item.icon size={17} aria-hidden="true" />
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="demo-caption">
                Demo data only. Email and SMS use test records.
              </span>
            </div>
          )}
          <p className="login-policy">
            By signing in, you agree to use this service for campus maintenance
            reports.
          </p>
        </div>
        <footer className="login-footer">
          <span>CampusFix · CIT4001 course project</span>
          <span>Made for a better campus.</span>
        </footer>
      </section>
    </main>
  );
}
````

## src/components/management.tsx

````tsx
"use client";
import { api } from "@/lib/client";
import {
  facultyLabel,
  formatDate,
  label,
  PRIORITIES,
  ROLES,
  TRADES,
  type Category,
  type Location,
  type User,
} from "@/lib/domain";
import {
  BarChart3,
  Check,
  Download,
  FileText,
  Plus,
  Printer,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useResource } from "./resource";
import type { Activity, ReferenceData } from "./types";
import { Button } from "./ui/button";
import { Busy, Empty, Field, Loading, Notice, PageTitle } from "./ui/common";
import { useClock } from "./use-clock";

type Metric = number | string | null;
interface ReportData {
  summary: {
    total: number;
    active: number;
    completed: number;
    mttr_hours: Metric;
    sla_percent: Metric;
  };
  faculties: {
    faculty_code: string;
    total: number;
    completed: number;
    overdue: number;
    mttr_hours: Metric;
  }[];
  buildings: { building_name: string; category_name: string; count: number }[];
  technicians: { full_name: string; completed: number; mttr_hours: Metric }[];
}
export function ReportsPage() {
  const [faculty, setFaculty] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = new URLSearchParams({ faculty, from, to });
  const resource = useResource<ReportData>(`/api/reports?${params}`);
  return (
    <>
      <PageTitle
        eyebrow="A CLEARER PICTURE"
        title="Reports and insights"
        description="See what is working and where more care is needed."
      >
        <Button asChild variant="outline">
          <a href={`/api/reports/export?${params}`}>
            <Download size={16} aria-hidden="true" />
            Export CSV
          </a>
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer size={16} aria-hidden="true" />
          Print or save PDF
        </Button>
      </PageTitle>
      <section className="panel report-filters no-print">
        <Field label="Faculty or area" htmlFor="report-faculty">
          <select
            id="report-faculty"
            value={faculty}
            onChange={(e) => setFaculty(e.target.value)}
          >
            <option value="">All faculties and areas</option>
            {Object.entries(facultyLabel).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reported from" htmlFor="report-from">
          <input
            id="report-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Reported to" htmlFor="report-to">
          <input
            id="report-to"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </section>
      {resource.error ? (
        <Notice>{resource.error}</Notice>
      ) : !resource.data ? (
        <Loading />
      ) : (
        <>
          <div className="stats-row">
            {[
              {
                name: "Reports received",
                value: resource.data.summary.total,
                unit: "",
                hint: "Excludes duplicate and rejected reports",
              },
              {
                name: "Repairs completed",
                value: resource.data.summary.completed,
                unit: "",
                hint: "Completed and closed repairs",
              },
              {
                name: "Average repair time",
                value: resource.data.summary.mttr_hours ?? "N/A",
                unit: resource.data.summary.mttr_hours ? " hrs" : "",
                hint: "From first report to completion",
              },
              {
                name: "Within repair target",
                value: resource.data.summary.sla_percent ?? "N/A",
                unit: resource.data.summary.sla_percent !== null ? "%" : "",
                hint: "Of repairs completed in this period",
              },
            ].map((item) => (
              <div className="stat" key={item.name}>
                <span className="stat-label">{item.name}</span>
                <strong>
                  {item.value}
                  <small>{item.unit}</small>
                </strong>
                <span>{item.hint}</span>
              </div>
            ))}
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>By faculty and area</h2>
                <p>Keep an eye on demand across campus.</p>
              </div>
              <BarChart3 size={20} aria-hidden="true" />
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Faculty or area</th>
                    <th>Reports</th>
                    <th>Completed</th>
                    <th>Past deadline</th>
                    <th>Average repair time</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.faculties.map((item) => (
                    <tr key={item.faculty_code}>
                      <td>
                        <strong>
                          {facultyLabel[item.faculty_code] ?? item.faculty_code}
                        </strong>
                        <small>{item.faculty_code}</small>
                      </td>
                      <td>{item.total}</td>
                      <td>{item.completed}</td>
                      <td>{item.overdue}</td>
                      <td>
                        {item.mttr_hours !== null
                          ? `${item.mttr_hours} hours`
                          : "No completed repairs"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!resource.data.faculties.length && (
              <Empty
                title="No reports in this period"
                text="Choose another date range or faculty."
              />
            )}
          </section>
          <div className="dashboard-columns report-columns">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Where faults recur</h2>
                  <p>Report counts by building and issue type.</p>
                </div>
              </div>
              <div className="ranking-list">
                {resource.data.buildings.map((item, i) => (
                  <div key={item.building_name + item.category_name}>
                    <span className="ranking-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{item.building_name}</strong>
                      <small>{item.category_name}</small>
                    </span>
                    <b>{item.count}</b>
                  </div>
                ))}
                {!resource.data.buildings.length && (
                  <Empty
                    title="No building data yet"
                    text="Building counts will appear after reports are submitted."
                  />
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Completed work by technician</h2>
              </div>
              <div className="ranking-list">
                {resource.data.technicians.map((item) => (
                  <div key={item.full_name}>
                    <span className="avatar avatar-small">
                      {item.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </span>
                    <span>
                      <strong>{item.full_name}</strong>
                      <small>{item.mttr_hours} hours average</small>
                    </span>
                    <b>{item.completed}</b>
                  </div>
                ))}
                {!resource.data.technicians.length && (
                  <Empty
                    title="Repairs are in progress"
                    text="Completed repairs will appear here."
                  />
                )}
              </div>
            </section>
          </div>
          <p className="subtle-note">
            <FileText size={16} aria-hidden="true" />
            Report generated {formatDate(new Date())}. Figures use actual
            database records. Demo records are included.
          </p>
        </>
      )}
    </>
  );
}
export function SettingsPage({ user }: { user: User }) {
  const [email, setEmail] = useState(user.pref_email);
  const [sms, setSms] = useState(user.pref_sms);
  const [inApp, setInApp] = useState(user.pref_in_app);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="MAKE IT YOURS"
        title="Preferences"
        description="Your account details and the updates you want to receive."
      />
      <div className="settings-layout">
        <section className="panel">
          <div className="panel-heading">
            <h2>Your account</h2>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <dl className="profile-details">
            <div>
              <dt>Name</dt>
              <dd>{user.full_name}</dd>
            </div>
            <div>
              <dt>University ID</dt>
              <dd>{user.institutional_id}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Workspace role</dt>
              <dd>{label(user.role)}</dd>
            </div>
          </dl>
          <p className="panel-note">
            Contact the demonstration administrator to change account details.
          </p>
        </section>
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setMessage("");
            try {
              await api("/api/settings", {
                method: "PATCH",
                body: JSON.stringify({ email, sms, inApp }),
              });
              setMessage("Your preferences are saved.");
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Preferences could not be saved.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="panel-heading">
            <h2>Notification preferences</h2>
            <Settings2 size={18} aria-hidden="true" />
          </div>
          <div className="panel-body form-stack">
            {error && <Notice>{error}</Notice>}
            {message && <Notice tone="success">{message}</Notice>}
            {[
              {
                id: "in-app",
                title: "In-app updates",
                text: "See ticket updates in your notification inbox.",
                checked: inApp,
                set: setInApp,
              },
              {
                id: "email-pref",
                title: "Email updates",
                text: "Create test email delivery records for ticket updates.",
                checked: email,
                set: setEmail,
              },
              {
                id: "sms-pref",
                title: "SMS updates",
                text: "Create test SMS delivery records for ticket updates.",
                checked: sms,
                set: setSms,
              },
            ].map((item) => (
              <label className="preference-row" key={item.id} htmlFor={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </span>
                <input
                  role="switch"
                  id={item.id}
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.set(e.target.checked)}
                />
              </label>
            ))}
            <Notice tone="info">
              Email and SMS use a test transport. This demonstration does not
              send external messages.
            </Notice>
            <Button type="submit" disabled={busy}>
              {busy ? <Busy /> : <Check size={16} aria-hidden="true" />}Save
              preferences
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
interface ManagedUser {
  user_id: string;
  institutional_id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  locked_until: string | null;
  trade_specialty: string | null;
  is_available: boolean | null;
  active_workload: number | null;
}
export function UsersPage() {
  const now = useClock();
  const resource = useResource<ManagedUser[]>("/api/admin/users");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState("STUDENT");
  async function change(input: Record<string, unknown>) {
    setError("");
    setBusy(true);
    try {
      await api("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      resource.refresh();
      setMessage("The account was updated.");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The account could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="THE CAMPUS COMMUNITY"
        title="Accounts"
        description="Manage access and technician availability."
      >
        <Button onClick={() => setAdding(!adding)}>
          <Plus size={16} aria-hidden="true" />
          {adding ? "Close account form" : "Add account"}
        </Button>
      </PageTitle>
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {adding && (
        <form
          className="panel admin-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = Object.fromEntries(new FormData(form));
            setBusy(true);
            setError("");
            try {
              await api("/api/admin/users", {
                method: "POST",
                body: JSON.stringify(data),
              });
              setAdding(false);
              setMessage("The account was created.");
              resource.refresh();
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "The account could not be created.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Add an authorised account</h2>
          <div className="form-grid">
            <Field label="Full name" htmlFor="fullName">
              <input
                id="fullName"
                name="fullName"
                minLength={2}
                maxLength={120}
                required
              />
            </Field>
            <Field label="University ID" htmlFor="institutionalId">
              <input
                id="institutionalId"
                name="institutionalId"
                minLength={3}
                maxLength={20}
                required
              />
            </Field>
            <Field label="Institutional email" htmlFor="email">
              <input id="email" name="email" type="email" required />
            </Field>
            <Field
              label="Initial password"
              htmlFor="new-password"
              hint="Use at least 12 characters."
            >
              <input
                id="new-password"
                name="password"
                type="password"
                minLength={12}
                maxLength={72}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Role" htmlFor="role">
              <select
                id="role"
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {ROLES.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
            </Field>
            {role === "TECHNICIAN" && (
              <Field label="Trade specialty" htmlFor="trade">
                <select id="trade" name="trade" required>
                  {TRADES.map((item) => (
                    <option key={item} value={item}>
                      {label(item)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <Busy /> : null}Create account
          </Button>
        </form>
      )}
      <section className="panel">
        {resource.error ? (
          <Notice>{resource.error}</Notice>
        ) : !resource.data ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Account</th>
                  <th>Availability</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.map((person) => (
                  <tr key={person.user_id}>
                    <td>
                      <strong>{person.full_name}</strong>
                      <small>{person.email}</small>
                      <small>{person.institutional_id}</small>
                    </td>
                    <td>
                      {label(person.role)}
                      {person.trade_specialty && (
                        <small>{label(person.trade_specialty)}</small>
                      )}
                    </td>
                    <td>
                      <span
                        className={`availability ${person.is_active ? "available" : ""}`}
                      >
                        <span />
                        {person.is_active ? "Active" : "Inactive"}
                      </span>
                      {person.locked_until &&
                        new Date(person.locked_until).getTime() > now && (
                          <small className="overdue-label">Locked</small>
                        )}
                    </td>
                    <td>
                      {person.role === "TECHNICIAN" ? (
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            disabled={busy}
                            aria-label={`${person.full_name} available`}
                            checked={!!person.is_available}
                            onChange={(e) =>
                              change({
                                userId: person.user_id,
                                available: e.target.checked,
                              })
                            }
                          />
                          Available{" "}
                          <small>({person.active_workload} jobs)</small>
                        </label>
                      ) : (
                        <span className="muted">Not applicable</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            change({
                              userId: person.user_id,
                              active: !person.is_active,
                            })
                          }
                        >
                          {person.is_active ? "Deactivate" : "Activate"}
                        </Button>
                        {person.locked_until && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              change({ userId: person.user_id, unlock: true })
                            }
                          >
                            Unlock
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
export function ReferencePage({
  reference,
  refresh,
}: {
  reference: ReferenceData;
  refresh: () => void;
}) {
  const [tab, setTab] = useState("categories");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [open, setOpen] = useState(false);
  async function save(input: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/reference", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setMessage("The campus directory was updated.");
      setOpen(false);
      setEditCategory(null);
      setEditLocation(null);
      refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The directory could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="THE RIGHT PLACE AND PEOPLE"
        title="Campus directory"
        description="Keep issue categories and campus locations up to date."
      >
        <Button
          onClick={() => {
            setEditCategory(null);
            setEditLocation(null);
            setOpen(!open);
          }}
        >
          <Plus size={16} aria-hidden="true" />
          Add {tab === "categories" ? "category" : "location"}
        </Button>
      </PageTitle>
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <div className="tabs" role="tablist" aria-label="Directory type">
        <button
          role="tab"
          aria-selected={tab === "categories"}
          onClick={() => {
            setTab("categories");
            setOpen(false);
          }}
        >
          Issue categories
        </button>
        <button
          role="tab"
          aria-selected={tab === "locations"}
          onClick={() => {
            setTab("locations");
            setOpen(false);
          }}
        >
          Campus locations
        </button>
      </div>
      {open && (
        <form
          key={
            (editCategory?.category_id ?? editLocation?.location_id ?? "new") +
            tab
          }
          className="panel admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            void save(
              tab === "categories"
                ? {
                    kind: "category",
                    ...(editCategory ? { id: editCategory.category_id } : {}),
                    name: data.name,
                    trade: data.trade,
                    priority: data.priority,
                    active: data.active === "on",
                  }
                : {
                    kind: "location",
                    ...(editLocation ? { id: editLocation.location_id } : {}),
                    faculty: data.faculty,
                    building: data.building,
                    room: data.room,
                    active: data.active === "on",
                  },
            );
          }}
        >
          <h2>
            {editCategory || editLocation ? "Edit" : "Add"}{" "}
            {tab === "categories" ? "category" : "location"}
          </h2>
          <div className="form-grid">
            {tab === "categories" ? (
              <>
                <Field label="Category name" htmlFor="category-name">
                  <input
                    id="category-name"
                    name="name"
                    defaultValue={editCategory?.category_name}
                    minLength={2}
                    maxLength={60}
                    required
                  />
                </Field>
                <Field label="Trade specialty" htmlFor="category-trade">
                  <select
                    id="category-trade"
                    name="trade"
                    defaultValue={editCategory?.trade_specialty}
                  >
                    {TRADES.map((item) => (
                      <option key={item} value={item}>
                        {label(item)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Default priority" htmlFor="category-priority">
                  <select
                    id="category-priority"
                    name="priority"
                    defaultValue={
                      editCategory?.default_priority ?? "P3_ROUTINE"
                    }
                  >
                    {PRIORITIES.map((item) => (
                      <option key={item} value={item}>
                        {label(item)}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Faculty or area" htmlFor="location-faculty">
                  <select
                    id="location-faculty"
                    name="faculty"
                    defaultValue={editLocation?.faculty_code}
                  >
                    {Object.entries(facultyLabel).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Building name" htmlFor="location-building">
                  <input
                    id="location-building"
                    name="building"
                    defaultValue={editLocation?.building_name}
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </Field>
                <Field label="Room or area" htmlFor="location-room">
                  <input
                    id="location-room"
                    name="room"
                    defaultValue={editLocation?.room_number}
                    maxLength={30}
                    required
                  />
                </Field>
              </>
            )}
            <label className="checkbox-label">
              <input
                name="active"
                type="checkbox"
                defaultChecked={
                  editCategory?.is_active ?? editLocation?.is_active ?? true
                }
              />
              Active and available in forms
            </label>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <Busy /> : null}Save{" "}
            {tab === "categories" ? "category" : "location"}
          </Button>
        </form>
      )}
      <section className="panel">
        <div className="table-scroll">
          {tab === "categories" ? (
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Trade specialty</th>
                  <th>Default priority</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {reference.categories.map((item) => (
                  <tr key={item.category_id}>
                    <td>
                      <strong>{item.category_name}</strong>
                    </td>
                    <td>{label(item.trade_specialty)}</td>
                    <td>{label(item.default_priority)}</td>
                    <td>{item.is_active ? "Active" : "Inactive"}</td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditCategory(item);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Faculty</th>
                  <th>Building</th>
                  <th>Room or area</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {reference.locations.map((item) => (
                  <tr key={item.location_id}>
                    <td>{item.faculty_code}</td>
                    <td>
                      <strong>{item.building_name}</strong>
                    </td>
                    <td>{item.room_number}</td>
                    <td>{item.is_active ? "Active" : "Inactive"}</td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditLocation(item);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
export function AuditPage() {
  const resource = useResource<Activity[]>("/api/admin/audit");
  const [search, setSearch] = useState("");
  const filtered = resource.data?.filter((item) =>
    `${item.event_code} ${item.details} ${item.ticket_id ?? ""} ${item.full_name ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        eyebrow="A RECORD YOU CAN FOLLOW"
        title="Audit history"
        description="The latest 200 recorded actions. Audit records cannot be edited."
      />
      <section className="panel">
        <div className="list-toolbar">
          <div className="search-input">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Search audit history"
              placeholder="Search actions, reports, or people..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {resource.error ? (
          <Notice>{resource.error}</Notice>
        ) : !resource.data ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Time in Jamaica</th>
                  <th>Action</th>
                  <th>Person</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((item) => (
                  <tr key={item.audit_id}>
                    <td className="nowrap">{formatDate(item.created_at)}</td>
                    <td>
                      <strong>{label(item.event_code)}</strong>
                      <small>{item.ticket_id}</small>
                    </td>
                    <td>{item.full_name ?? "CampusFix"}</td>
                    <td className="audit-details">{item.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
interface Delivery {
  delivery_id: string;
  channel: string;
  status: string;
  attempts: number;
  last_error: string | null;
  processed_at: string | null;
  title: string;
  ticket_id: string;
  full_name: string;
}
export function DeliveriesPage() {
  const resource = useResource<Delivery[]>("/api/admin/deliveries", 20_000);
  return (
    <>
      <PageTitle
        eyebrow="TEST TRANSPORT"
        title="Message delivery records"
        description="Inspect email and SMS test records for the course demonstration."
      />
      <Notice tone="info">
        TEST_RECORDED means the test transport recorded the message. It does not
        mean an email or SMS was sent.
      </Notice>
      <section className="panel">
        {resource.error ? (
          <Notice>{resource.error}</Notice>
        ) : !resource.data ? (
          <Loading />
        ) : !resource.data.length ? (
          <Empty
            title="No test messages yet"
            text="Ticket updates create records when email or SMS preferences are on."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Report and message</th>
                  <th>Recipient</th>
                  <th>Channel</th>
                  <th>Result</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.map((item) => (
                  <tr key={item.delivery_id}>
                    <td>
                      <strong>{item.title}</strong>
                      <small>{item.ticket_id}</small>
                    </td>
                    <td>{item.full_name}</td>
                    <td>{item.channel}</td>
                    <td>
                      {item.status}
                      <small>
                        {item.last_error ?? formatDate(item.processed_at)}
                      </small>
                    </td>
                    <td>{item.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
````

## src/components/new-report.tsx

````tsx
"use client";
import { api, ApiError, uploadPhoto } from "@/lib/client";
import {
  facultyLabel,
  label,
  MAX_PHOTO_BYTES,
  ticketInput,
  type TicketInput,
  type User,
} from "@/lib/domain";
import { queueReport, readDraft, removeDraft, saveDraft } from "@/lib/offline";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Info,
  MapPin,
  Save,
  ShieldCheck,
  WifiOff,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReferenceData } from "./types";
import { Button } from "./ui/button";
import { Busy, Field, Notice, PageTitle } from "./ui/common";

type FormData = {
  categoryId: string;
  locationId: string;
  title: string;
  description: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  faculty: string;
  building: string;
};
const blank: FormData = {
  categoryId: "",
  locationId: "",
  title: "",
  description: "",
  urgency: "LOW",
  faculty: "",
  building: "",
};
export function NewReport({
  user,
  reference,
  onQueued,
}: {
  user: User;
  reference: ReferenceData;
  onQueued: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<FormData>(blank);
  const [photo, setPhoto] = useState<File>();
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [queued, setQueued] = useState(false);
  const [duplicates, setDuplicates] = useState<
    { ticket_id: string; title: string; status: string }[]
  >([]);
  const [separate, setSeparate] = useState(false);
  const submissionKey = useRef("");
  useEffect(() => {
    submissionKey.current = crypto.randomUUID();
    readDraft(user.user_id)
      .then((draft) => {
        if (draft) {
          setData({ ...blank, ...draft.data } as FormData);
          setPhoto(draft.photo);
          if (draft.photo) setPreview(URL.createObjectURL(draft.photo));
          if (draft.data.submissionKey)
            submissionKey.current = draft.data.submissionKey;
          setMessage("Your saved draft is ready to finish.");
        }
      })
      .catch(() => {});
  }, [user.user_id]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    let active = true;
    if (data.categoryId && data.locationId) {
      api<typeof duplicates>(
        `/api/tickets/duplicates?categoryId=${data.categoryId}&locationId=${data.locationId}`,
      )
        .then((items) => {
          if (active) {
            setDuplicates(items);
            setSeparate(false);
          }
        })
        .catch(() => {
          if (active) setDuplicates([]);
        });
    }
    return () => {
      active = false;
    };
  }, [data.categoryId, data.locationId]);
  function change<K extends keyof FormData>(key: K, value: FormData[K]) {
    if (["categoryId", "locationId", "faculty", "building"].includes(key)) {
      setDuplicates([]);
      setSeparate(false);
    }
    setData((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "faculty"
        ? { building: "", locationId: "" }
        : key === "building"
          ? { locationId: "" }
          : {}),
    }));
    setFields((previous) => ({ ...previous, [key]: "" }));
  }
  async function draft() {
    try {
      await saveDraft({
        userId: user.user_id,
        data: { ...data, submissionKey: submissionKey.current },
        photo,
        savedAt: Date.now(),
      });
      setMessage("Draft saved on this device.");
      setError("");
    } catch {
      setError("The draft could not be saved on this device.");
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const parsed = ticketInput.safeParse({
      ...data,
      submissionKey: submissionKey.current,
    });
    if (!parsed.success) {
      setFields(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join("."),
            issue.message,
          ]),
        ),
      );
      setError("Check the marked fields and try again.");
      return;
    }
    if (duplicates.length && !separate) {
      setError(
        "Choose an existing report or confirm that this is a separate issue.",
      );
      return;
    }
    setBusy(true);
    try {
      if (!navigator.onLine) {
        await queueReport({
          userId: user.user_id,
          data: parsed.data,
          photo,
          driver: reference.storageDriver,
        });
        setQueued(true);
        onQueued();
        return;
      }
      const payload: TicketInput = { ...parsed.data };
      if (photo)
        payload.attachmentId = await uploadPhoto(
          photo,
          "BEFORE",
          reference.storageDriver,
        );
      const result = await api<{ ticketId: string }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await removeDraft(user.user_id);
      router.push(`/app/tickets/${result.ticketId}?created=1`);
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
        setFields(error.fields);
      } else if (!navigator.onLine || error instanceof TypeError) {
        await queueReport({
          userId: user.user_id,
          data: parsed.data,
          photo,
          driver: reference.storageDriver,
        });
        setQueued(true);
        onQueued();
      } else
        setError(
          error instanceof Error
            ? error.message
            : "The report could not be sent.",
        );
    } finally {
      setBusy(false);
    }
  }
  const locations = reference.locations.filter((item) => item.is_active);
  const buildings = [
    ...new Set(
      locations
        .filter((item) => item.faculty_code === data.faculty)
        .map((item) => item.building_name),
    ),
  ];
  const rooms = locations.filter(
    (item) =>
      item.faculty_code === data.faculty &&
      item.building_name === data.building,
  );
  if (queued)
    return (
      <>
        <PageTitle
          title="Your report is saved"
          description="We will send it when your connection returns."
        />
        <div className="panel submission-success">
          <WifiOff size={36} aria-hidden="true" />
          <h2>Ready when you are connected.</h2>
          <p>
            Your report is in the queue on this device. Reopen CampusFix with
            the same account when you are online. A ticket number will appear
            after the report is sent.
          </p>
          <Button asChild>
            <Link href="/app">
              Return to overview
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </>
    );
  return (
    <>
      <Link className="back-link" href="/app/tickets">
        <ArrowLeft size={15} aria-hidden="true" />
        Back to my reports
      </Link>
      <PageTitle
        eyebrow="LET US TAKE CARE OF IT"
        title="Report an issue"
        description="Tell us what needs attention. We will take it from here."
      />
      <div className="report-layout">
        <form className="panel report-form" onSubmit={submit} noValidate>
          {error && <Notice>{error}</Notice>}
          {message && <Notice tone="success">{message}</Notice>}
          <fieldset>
            <legend>
              <span className="step-number">01</span>
              <span>
                What needs attention?
                <small>A clear report helps us send the right person.</small>
              </span>
            </legend>
            <Field
              label="Issue category"
              htmlFor="categoryId"
              error={fields.categoryId}
            >
              <select
                id="categoryId"
                value={data.categoryId}
                onChange={(e) => change("categoryId", e.target.value)}
                aria-invalid={!!fields.categoryId}
                aria-describedby={
                  fields.categoryId ? "categoryId-hint" : undefined
                }
                required
              >
                <option value="">Select an issue category</option>
                {reference.categories
                  .filter((c) => c.is_active)
                  .map((category) => (
                    <option
                      key={category.category_id}
                      value={category.category_id}
                    >
                      {category.category_name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label="Report title"
              htmlFor="title"
              error={fields.title}
              hint="Keep it short and specific."
            >
              <input
                id="title"
                placeholder="e.g. Flickering lights in Computer Lab 3"
                maxLength={150}
                value={data.title}
                onChange={(e) => change("title", e.target.value)}
                aria-invalid={!!fields.title}
                aria-describedby="title-hint"
                required
              />
            </Field>
            <Field
              label="What is happening?"
              htmlFor="description"
              error={fields.description}
            >
              <textarea
                id="description"
                rows={4}
                placeholder="Describe the issue and where we can find it. Let us know if it affects access or safety."
                maxLength={500}
                minLength={15}
                value={data.description}
                onChange={(e) => change("description", e.target.value)}
                aria-invalid={!!fields.description}
                aria-describedby={
                  fields.description
                    ? "description-count description-hint"
                    : "description-count"
                }
                required
              />
              <span className="character-count" id="description-count">
                {data.description.length}/500 characters <span>Minimum 15</span>
              </span>
            </Field>
          </fieldset>
          <fieldset>
            <legend>
              <span className="step-number">02</span>
              <span>
                Where is the issue?
                <small>The exact location helps us get there sooner.</small>
              </span>
            </legend>
            <div className="form-grid">
              <Field label="Faculty or area" htmlFor="faculty">
                <select
                  id="faculty"
                  value={data.faculty}
                  onChange={(e) => change("faculty", e.target.value)}
                  required
                >
                  <option value="">Select a faculty or area</option>
                  {Object.entries(facultyLabel)
                    .filter(([key]) =>
                      locations.some((l) => l.faculty_code === key),
                    )
                    .map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Building" htmlFor="building">
                <select
                  id="building"
                  disabled={!data.faculty}
                  value={data.building}
                  onChange={(e) => change("building", e.target.value)}
                  required
                >
                  <option value="">Select a building</option>
                  {buildings.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field
              label="Room or specific area"
              htmlFor="locationId"
              error={fields.locationId}
            >
              <select
                id="locationId"
                value={data.locationId}
                disabled={!data.building}
                onChange={(e) => change("locationId", e.target.value)}
                aria-invalid={!!fields.locationId}
                aria-describedby={
                  fields.locationId ? "locationId-hint" : undefined
                }
                required
              >
                <option value="">Select a room or area</option>
                {rooms.map((item) => (
                  <option key={item.location_id} value={item.location_id}>
                    {item.room_number}
                  </option>
                ))}
              </select>
            </Field>
            {duplicates.length > 0 && (
              <div className="duplicate-suggestions">
                <div>
                  <Info size={18} aria-hidden="true" />
                  <strong>Someone may have reported this.</strong>
                </div>
                <p>
                  Follow an existing report to get updates, or report a separate
                  fault.
                </p>
                {duplicates.map((item) => (
                  <div className="duplicate-item" key={item.ticket_id}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.ticket_id} · {label(item.status)}
                      </small>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await api(`/api/tickets/${item.ticket_id}/actions`, {
                            method: "POST",
                            body: JSON.stringify({ action: "follow" }),
                          });
                          await removeDraft(user.user_id);
                          router.push(`/app/tickets/${item.ticket_id}`);
                        } catch (error) {
                          setError(
                            error instanceof Error
                              ? error.message
                              : "Could not follow the report.",
                          );
                        }
                      }}
                    >
                      Follow report
                    </Button>
                  </div>
                ))}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={separate}
                    onChange={(e) => setSeparate(e.target.checked)}
                  />
                  This is a separate issue.
                </label>
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend>
              <span className="step-number">03</span>
              <span>
                A little more detail<small>Help us understand the issue.</small>
              </span>
            </legend>
            <Field
              label="Add a photo (optional)"
              htmlFor="photo"
              hint="JPG or PNG. Maximum 4.5 MB (4,500,000 bytes)."
            >
              <div className="photo-dropzone">
                {photo && preview ? (
                  <div className="photo-preview">
                    <Image
                      unoptimized
                      width={65}
                      height={65}
                      src={preview}
                      alt="Selected issue photo"
                    />
                    <span>
                      {photo.name}
                      <small>{(photo.size / 1_000_000).toFixed(2)} MB</small>
                    </span>
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => {
                        setPhoto(undefined);
                        setPreview("");
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <label className="photo-picker" htmlFor="photo">
                    <span>
                      <ImagePlus size={25} aria-hidden="true" />
                    </span>
                    <strong>Choose a photo or use your camera</strong>
                    <p>A clear photo helps us see what needs care.</p>
                  </label>
                )}
                <input
                  id="photo"
                  type="file"
                  accept="image/jpeg,image/png"
                  aria-describedby="photo-hint"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (
                      file.size < 1 ||
                      file.size > MAX_PHOTO_BYTES ||
                      !["image/jpeg", "image/png"].includes(file.type)
                    ) {
                      setError("Choose a JPG or PNG photo up to 4.5 MB.");
                      e.target.value = "";
                      return;
                    }
                    setPhoto(file);
                    setPreview(URL.createObjectURL(file));
                    setError("");
                  }}
                />
              </div>
            </Field>
            <fieldset className="urgency-field">
              <legend>How urgent is it?</legend>
              <div className="urgency-options">
                {[
                  { value: "LOW", title: "Routine", text: "Needs a repair" },
                  {
                    value: "MEDIUM",
                    title: "Disruptive",
                    text: "Affects daily use",
                  },
                  {
                    value: "HIGH",
                    title: "Safety concern",
                    text: "May cause harm",
                  },
                ].map((item) => (
                  <label
                    key={item.value}
                    className={data.urgency === item.value ? "selected" : ""}
                  >
                    <input
                      type="radio"
                      name="urgency"
                      value={item.value}
                      checked={data.urgency === item.value}
                      onChange={() =>
                        change("urgency", item.value as FormData["urgency"])
                      }
                    />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.text}</small>
                    </span>
                  </label>
                ))}
              </div>
              <p className="field-hint">
                Facilities staff will check the report and set the final
                priority.
              </p>
            </fieldset>
          </fieldset>
          <div className="form-footer">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={draft}
            >
              <Save size={16} aria-hidden="true" />
              Save draft
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Busy /> : null}
              {busy ? "Sending report..." : "Submit report"}
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </form>
        <aside className="report-aside">
          <div className="report-tip">
            <span className="tip-icon">
              <ShieldCheck size={24} aria-hidden="true" />
            </span>
            <h2>
              You report it.
              <br />
              We take it from here.
            </h2>
            <p>
              Your report goes straight to the facilities team. You can follow
              each step from your workspace.
            </p>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <strong>We review your report</strong>
                  <p>The team checks the details and priority.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>A technician takes care of it</strong>
                  <p>The right person is assigned to the repair.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>You get the update</strong>
                  <p>Check the repair and confirm it is complete.</p>
                </div>
              </li>
            </ol>
          </div>
          <div className="location-tip">
            <MapPin size={20} aria-hidden="true" />
            <h3>A good location saves time.</h3>
            <p>
              Select the exact room or area. Include nearby landmarks in your
              description if needed.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
````

## src/components/resource.ts

````ts
"use client";
import { api, ApiError } from "@/lib/client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
export function useResource<T>(url: string, interval = 0) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    const load = () => {
      api<T>(url)
        .then((value) => {
          if (active) {
            setData(value);
            setError("");
            setLoading(false);
          }
        })
        .catch((error) => {
          if (active) {
            setError(
              error instanceof Error
                ? error.message
                : "This page could not be loaded.",
            );
            setLoading(false);
            if (error instanceof ApiError && error.status === 401)
              router.replace("/login");
          }
        });
    };
    load();
    const timer = interval ? setInterval(load, interval) : undefined;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [url, interval, revision, router]);
  return { data, error, loading, refresh };
}
````

## src/components/ticket-page.tsx

````tsx
"use client";
import { api, uploadPhoto } from "@/lib/client";
import {
  formatDate,
  isManager,
  label,
  SLA_HOURS,
  type TicketDetail,
  type User,
} from "@/lib/domain";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  MapPin,
  MessageSquare,
  Send,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useResource } from "./resource";
import type { ReferenceData } from "./types";
import { Button } from "./ui/button";
import { Badge, Busy, Field, Loading, Notice, PageTitle } from "./ui/common";
import { useClock } from "./use-clock";

export function TicketPage({
  user,
  ticketId,
  reference,
  onChange,
}: {
  user: User;
  ticketId: string;
  reference: ReferenceData;
  onChange: () => void;
}) {
  const now = useClock();
  const resource = useResource<TicketDetail>(
    `/api/tickets/${ticketId}`,
    20_000,
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [priority, setPriority] = useState("");
  const [technician, setTechnician] = useState("auto");
  const [notes, setNotes] = useState("");
  const [parts, setParts] = useState("");
  const [labor, setLabor] = useState("0");
  const [photo, setPhoto] = useState<File>();
  const [reason, setReason] = useState("");
  const [master, setMaster] = useState("");
  const search = useSearchParams();
  async function action(input: Record<string, unknown>) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await api(`/api/tickets/${ticketId}/actions`, {
        method: "POST",
        body: JSON.stringify({
          ...input,
          version: resource.data?.ticket.version,
        }),
      });
      setMessage(
        input.action === "comment"
          ? "Your comment was added."
          : "The report was updated.",
      );
      setComment("");
      resource.refresh();
      onChange();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The report could not be updated.",
      );
      resource.refresh();
    } finally {
      setBusy(false);
    }
  }
  if (resource.error)
    return (
      <>
        <Link href="/app/tickets" className="back-link">
          <ArrowLeft size={16} />
          Back to reports
        </Link>
        <Notice>{resource.error}</Notice>
      </>
    );
  if (!resource.data) return <Loading />;
  const { ticket, activity, attachments, logs, comments } = resource.data;
  const manager = isManager(user.role);
  const assigned =
    user.role === "TECHNICIAN" && ticket.assigned_tech_id === user.user_id;
  const owner = ticket.reporter_id === user.user_id;
  const active = ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(ticket.status);
  const category = reference.categories.find(
    (c) => c.category_id === ticket.category_id,
  );
  const techs = reference.technicians.filter(
    (t) =>
      t.trade_specialty === category?.trade_specialty &&
      t.is_available &&
      t.is_active,
  );
  const lifecycle = [
    "PENDING",
    "ASSIGNED",
    "IN_PROGRESS",
    "COMPLETED",
    "CLOSED",
  ];
  const stage = lifecycle.indexOf(ticket.status);
  async function complete(event: React.FormEvent) {
    event.preventDefault();
    if (!photo) {
      setError("Add an after-repair photo before you complete this job.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const attachmentId = await uploadPhoto(
        photo,
        "AFTER",
        reference.storageDriver,
      );
      await action({ action: "complete", notes, attachmentId });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The repair could not be completed.",
      );
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" href="/app/tickets">
        <ArrowLeft size={15} aria-hidden="true" />
        Back to reports
      </Link>
      <PageTitle
        eyebrow={`${ticket.ticket_id} · ${ticket.category_name.toUpperCase()}`}
        title={ticket.title}
        description={`Reported ${formatDate(ticket.created_at)}`}
      >
        <Badge value={ticket.status} />
        <Badge value={ticket.priority} priority />
      </PageTitle>
      {search.get("created") === "1" && (
        <Notice tone="success">
          Your report is recorded. Your ticket number is {ticket.ticket_id}.
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {ticket.duplicate_of && (
        <Notice tone="info">
          This report is linked to{" "}
          <Link href={`/app/tickets/${ticket.duplicate_of}`}>
            {ticket.duplicate_of}
          </Link>
          . Follow the main report for repair updates.
        </Notice>
      )}
      {stage >= 0 && (
        <div
          className="lifecycle"
          aria-label={`Repair progress: ${label(ticket.status)}`}
        >
          {lifecycle.map((item, i) => (
            <div className={i <= stage ? "reached" : ""} key={item}>
              <span>
                {i < stage ? <Check size={15} aria-hidden="true" /> : i + 1}
              </span>
              <strong>{label(item)}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel">
            <div className="panel-heading">
              <h2>Issue details</h2>
              <span className="muted">
                Reported as {label(ticket.reporter_urgency)}
              </span>
            </div>
            <div className="panel-body">
              <p className="issue-description">{ticket.description}</p>
              <div className="detail-facts">
                <div>
                  <MapPin size={18} aria-hidden="true" />
                  <span>
                    <small>LOCATION</small>
                    <strong>{ticket.building_name}</strong>
                    <p>
                      {ticket.room_number} · {ticket.faculty_code}
                    </p>
                  </span>
                </div>
                <div>
                  <UserRound size={18} aria-hidden="true" />
                  <span>
                    <small>REPORTED BY</small>
                    <strong>{ticket.reporter_name}</strong>
                    <p>
                      {ticket.is_following && !owner
                        ? "You follow this report"
                        : "Campus community"}
                    </p>
                  </span>
                </div>
              </div>
              {attachments.length > 0 && (
                <div className="evidence-grid">
                  {attachments.map((item) => (
                    <a
                      key={item.attachment_id}
                      href={`/api/attachments/${item.attachment_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="evidence-label">
                        {item.phase === "BEFORE"
                          ? "REPORTED ISSUE"
                          : "AFTER THE REPAIR"}
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </span>
                      <Image
                        unoptimized
                        width={1000}
                        height={750}
                        src={`/api/attachments/${item.attachment_id}`}
                        alt={
                          item.phase === "BEFORE"
                            ? "Photo of the reported issue"
                            : "Photo submitted as repair proof"
                        }
                      />
                      <small>{item.original_name}</small>
                    </a>
                  ))}
                </div>
              )}
              {ticket.resolution_notes && (
                <div className="resolution-notes">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <div>
                    <strong>Repair notes</strong>
                    <p>{ticket.resolution_notes}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Activity history</h2>
              <span className="muted">{activity.length} update(s)</span>
            </div>
            <ol className="ticket-timeline">
              {activity.map((item) => (
                <li key={item.audit_id}>
                  <span className="timeline-marker" />
                  <div>
                    <strong>{label(item.event_code)}</strong>
                    <p>{item.details}</p>
                    <small>
                      {item.full_name ?? "CampusFix"} ·{" "}
                      {formatDate(item.created_at)}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {logs.length > 0 && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Work log</h2>
              </div>
              <div className="work-logs">
                {logs.map((log) => (
                  <div key={log.log_id}>
                    <strong>{log.action_description}</strong>
                    {log.parts_consumed && <p>Parts: {log.parts_consumed}</p>}
                    <small>
                      {log.labor_minutes} minutes · {log.full_name} ·{" "}
                      {formatDate(log.logged_at)}
                    </small>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel-heading">
              <h2>Conversation</h2>
              <MessageSquare size={18} aria-hidden="true" />
            </div>
            <div className="comments-list">
              {comments.length ? (
                comments.map((item) => (
                  <div className="comment" key={item.comment_id}>
                    <span className="avatar avatar-small">
                      {item.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div>
                      <strong>
                        {item.full_name}
                        <small>{formatDate(item.created_at)}</small>
                      </strong>
                      <p>{item.body}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Add a question or share an update about this report.
                </p>
              )}
              {!["CLOSED", "DUPLICATE", "REJECTED"].includes(ticket.status) && (
                <form
                  className="comment-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action({ action: "comment", body: comment });
                  }}
                >
                  <label className="sr-only" htmlFor="comment">
                    Your comment
                  </label>
                  <textarea
                    id="comment"
                    placeholder="Add a comment or ask a question..."
                    maxLength={2000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    required
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || !comment.trim()}
                  >
                    <Send size={15} aria-hidden="true" />
                    Post comment
                  </Button>
                </form>
              )}
            </div>
          </section>
        </div>
        <aside className="detail-sidebar">
          <section className="panel">
            <div className="panel-heading">
              <h2>Repair overview</h2>
              <Wrench size={18} aria-hidden="true" />
            </div>
            <div className="repair-overview">
              <div>
                <span>Assigned technician</span>
                <strong>
                  {ticket.technician_name ?? "Awaiting assignment"}
                </strong>
              </div>
              <div>
                <span>Repair target</span>
                <strong>
                  {SLA_HOURS[ticket.priority]} hours from submission
                </strong>
              </div>
              <div>
                <span>Deadline</span>
                <strong
                  className={
                    active && new Date(ticket.sla_deadline).getTime() < now
                      ? "overdue-label"
                      : ""
                  }
                >
                  {formatDate(ticket.sla_deadline)}
                </strong>
              </div>
              <div>
                <span>Last completed</span>
                <strong>{formatDate(ticket.resolved_at)}</strong>
              </div>
            </div>
          </section>
          {manager && active && (
            <section className="panel action-panel">
              <div className="panel-heading">
                <h2>Review and assign</h2>
              </div>
              <form
                className="panel-body form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action({
                    action: "assign",
                    priority: priority || ticket.priority,
                    technicianId: technician,
                  });
                }}
              >
                <Field label="Priority" htmlFor="priority">
                  <select
                    id="priority"
                    value={priority || ticket.priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    {["P1_CRITICAL", "P2_URGENT", "P3_ROUTINE"].map((p) => (
                      <option key={p} value={p}>
                        {p.slice(0, 2)} {label(p)} ·{" "}
                        {SLA_HOURS[p as keyof typeof SLA_HOURS]} hours
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Technician" htmlFor="technician">
                  <select
                    id="technician"
                    value={technician}
                    onChange={(e) => setTechnician(e.target.value)}
                  >
                    <option value="auto">Automatic: lowest workload</option>
                    {techs.map((tech) => (
                      <option key={tech.tech_id} value={tech.tech_id}>
                        {tech.full_name} ({tech.active_workload} jobs)
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="field-hint">
                  Only available technicians with the correct trade are listed.
                  Reassignment keeps the original deadline.
                </p>
                <Button type="submit" disabled={busy}>
                  {busy ? <Busy /> : <Wrench size={16} aria-hidden="true" />}
                  Assign work order
                </Button>
              </form>
            </section>
          )}
          {assigned && ticket.status === "ASSIGNED" && (
            <section className="panel action-panel">
              <div className="panel-body">
                <h2>Ready to get started?</h2>
                <p className="muted">
                  Check the issue and location. Start work when you arrive.
                </p>
                <Button
                  disabled={busy}
                  onClick={() => action({ action: "start" })}
                >
                  {busy ? <Busy /> : <Wrench size={16} aria-hidden="true" />}
                  Start work
                </Button>
              </div>
            </section>
          )}
          {assigned && ticket.status === "IN_PROGRESS" && (
            <section className="panel action-panel">
              <div className="panel-heading">
                <h2>Record your work</h2>
              </div>
              <form
                className="panel-body form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action({
                    action: "log",
                    notes,
                    parts,
                    laborMinutes: Number(labor),
                  });
                }}
              >
                <Field label="Work notes" htmlFor="notes">
                  <textarea
                    id="notes"
                    rows={3}
                    value={notes}
                    minLength={3}
                    maxLength={2000}
                    onChange={(e) => setNotes(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Parts used" htmlFor="parts">
                  <input
                    id="parts"
                    value={parts}
                    maxLength={1000}
                    onChange={(e) => setParts(e.target.value)}
                    placeholder="e.g. 2 LED tubes"
                  />
                </Field>
                <Field label="Labour time (minutes)" htmlFor="labor">
                  <input
                    id="labor"
                    type="number"
                    min={0}
                    max={1440}
                    value={labor}
                    onChange={(e) => setLabor(e.target.value)}
                  />
                </Field>
                <Button type="submit" variant="outline" disabled={busy}>
                  Save work log
                </Button>
              </form>
              <form
                className="panel-body form-stack complete-form"
                onSubmit={complete}
              >
                <h3>Complete the repair</h3>
                <Field label="Final repair notes" htmlFor="resolution">
                  <textarea
                    id="resolution"
                    minLength={10}
                    maxLength={2000}
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    required
                  />
                </Field>
                <Field
                  label="After-repair photo"
                  htmlFor="after-photo"
                  hint="A JPG or PNG photo up to 4.5 MB is required."
                >
                  <input
                    id="after-photo"
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={(e) => setPhoto(e.target.files?.[0])}
                    required
                  />
                </Field>
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Busy />
                  ) : (
                    <CheckCircle2 size={16} aria-hidden="true" />
                  )}
                  Complete repair
                </Button>
              </form>
            </section>
          )}
          {ticket.status === "COMPLETED" && (owner || manager) && (
            <section className="panel action-panel">
              <div className="panel-body form-stack">
                <CheckCircle2
                  size={26}
                  className="green-text"
                  aria-hidden="true"
                />
                <h2>How does it look?</h2>
                <p className="muted">
                  Check the repair and the after photo. Confirm it is complete,
                  or let us know if the problem remains.
                </p>
                <Button
                  disabled={busy}
                  onClick={() => action({ action: "close" })}
                >
                  <Check size={16} aria-hidden="true" />
                  Confirm repair and close
                </Button>
                {owner && (
                  <details>
                    <summary>Report a problem with the repair</summary>
                    <form
                      className="form-stack"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action({ action: "dispute", reason });
                      }}
                    >
                      <Field
                        label="What still needs attention?"
                        htmlFor="dispute-reason"
                      >
                        <textarea
                          id="dispute-reason"
                          minLength={10}
                          maxLength={1000}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          required
                        />
                      </Field>
                      <Button disabled={busy} type="submit" variant="outline">
                        Reopen the repair
                      </Button>
                    </form>
                  </details>
                )}
                <small className="field-hint">
                  If no problem is reported, this ticket will close 72 hours
                  after completion.
                </small>
              </div>
            </section>
          )}
          {manager && active && (
            <section className="panel">
              <div className="panel-body">
                <details>
                  <summary>Merge a duplicate report</summary>
                  <form
                    className="form-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action({
                        action: "merge",
                        masterId: master,
                        reason,
                      });
                    }}
                  >
                    <p className="field-hint">
                      Use the main report ID. Both reports must have the same
                      room and category. Reporters will follow the main report.
                    </p>
                    <Field label="Main report ID" htmlFor="master">
                      <input
                        id="master"
                        placeholder="CF-2026-1041"
                        value={master}
                        onChange={(e) =>
                          setMaster(e.target.value.toUpperCase())
                        }
                        required
                      />
                    </Field>
                    <Field label="Reason for merging" htmlFor="merge-reason">
                      <textarea
                        id="merge-reason"
                        minLength={10}
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        required
                      />
                    </Field>
                    <Button type="submit" variant="outline" disabled={busy}>
                      Confirm merge
                    </Button>
                  </form>
                </details>
                <details>
                  <summary>Reject this report</summary>
                  <form
                    className="form-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action({ action: "reject", reason });
                    }}
                  >
                    <Field label="Reason for rejection" htmlFor="reject-reason">
                      <textarea
                        id="reject-reason"
                        minLength={10}
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        required
                      />
                    </Field>
                    <Button type="submit" variant="destructive" disabled={busy}>
                      Confirm rejection
                    </Button>
                  </form>
                </details>
              </div>
            </section>
          )}
          <div className="subtle-note">
            <ShieldCheck size={17} aria-hidden="true" />
            Changes are saved in the ticket audit history.
          </div>
        </aside>
      </div>
    </>
  );
}
````

## src/components/types.ts

````ts
import type { Category, Location, Technician, Ticket } from "@/lib/domain";
export interface ReferenceData {
  categories: Category[];
  locations: Location[];
  technicians: Technician[];
  storageDriver: string;
  demoMode: boolean;
}
export interface Activity {
  audit_id: string;
  event_code: string;
  details: string;
  ticket_id: string;
  created_at: string;
  full_name: string | null;
}
export interface DashboardData {
  counts: {
    total: number;
    active: number;
    pending: number;
    completed: number;
    overdue: number;
    critical: number;
  };
  recent: Ticket[];
  activity: Activity[];
  categories: { category_name: string; count: number }[];
  unread: number;
}
export interface TicketListData {
  tickets: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Notification {
  notification_id: string;
  ticket_id: string;
  event_code: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}
````

## src/components/ui/button.tsx

````tsx
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { Slot } from "radix-ui";
import * as React from "react";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
const buttonVariants = cva("btn", {
  variants: {
    variant: {
      default: "btn-primary",
      secondary: "btn-secondary",
      ghost: "btn-ghost",
      outline: "btn-outline",
      destructive: "btn-danger",
    },
    size: { default: "", sm: "btn-sm", icon: "btn-icon" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
````

## src/components/ui/common.tsx

````tsx
"use client";
import { label } from "@/lib/domain";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Inbox,
  LoaderCircle,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/app" aria-label="CampusFix home">
      <span className="brand-mark">
        <Wrench size={21} strokeWidth={2.2} aria-hidden="true" />
      </span>
      <span>
        campus<span className="brand-light">fix</span>
        {!compact && <small>UNIVERSITY SERVICES</small>}
      </span>
    </Link>
  );
}
export function Badge({
  value,
  priority = false,
}: {
  value: string;
  priority?: boolean;
}) {
  return (
    <span
      className={`badge ${priority ? "priority " : ""}${value.toLowerCase()}`}
    >
      <span className="status-dot" />
      {priority ? `${value.slice(0, 2)} ${label(value)}` : label(value)}
    </span>
  );
}
export function Notice({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "info";
}) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "success" ? (
        <CheckCircle2 size={18} aria-hidden="true" />
      ) : (
        <AlertCircle size={18} aria-hidden="true" />
      )}
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title = "No reports here yet",
  text = "New reports will appear here.",
  href,
  action,
}: {
  title?: string;
  text?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={28} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {href && (
        <Link className="btn btn-primary" href={href}>
          {action}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
export function Loading({
  label: text = "Loading your workspace",
}: {
  label?: string;
}) {
  return (
    <div role="status" className="loading">
      <span className="sr-only">{text}</span>
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-banner" />
      <div className="skeleton-row">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="skeleton skeleton-stat" />
        ))}
      </div>
      <div className="skeleton skeleton-table" />
    </div>
  );
}
export function Busy() {
  return <LoaderCircle size={16} className="spin" aria-hidden="true" />;
}
export function Field({
  label: caption,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <label htmlFor={htmlFor}>{caption}</label>
      {children}
      {error ? (
        <span className="field-message" id={`${htmlFor}-hint`}>
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint" id={`${htmlFor}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
export function CampusIllustration() {
  return (
    <svg
      className="campus-illustration"
      viewBox="0 0 460 220"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <path d="M20 172 215 214 450 150 255 111Z" opacity=".2" />
        <path d="m72 143 150 34 159-45-147-33Z" opacity=".3" />
        <path d="m72 143 0-62 86 20v62M72 81l63-23 86 20-63 23M158 101l63-23v62l-63 23" />
        <path d="m235 137 0-64 106-30 0 64-106 30Z" />
        <path d="m235 73-57-15 106-30 57 15M178 58v26" />
        <path d="m267 126 0-37 35-10 0 37M245 78v16m11-19v16m57-33v15m15-19v15M84 96v12m18-8v12m18-8v12m17-8v12m40-20v14m20-21v14" />
        <path d="m320 159 0-38 66-18 0 38-66 18ZM320 121l-39-10 66-19 39 11M281 111v27l39 10M332 125v13m14-17v13m14-17v13m14-17v13M95 157l0 15m-8-20c0-13 16-13 16 0 0 11-16 11-16 0Zm310-65v18m-9-24c0-15 18-15 18 0 0 14-18 14-18 0Z" />
        <path
          d="M206 188 416 130M38 142 63 149"
          strokeDasharray="5 5"
          opacity=".5"
        />
      </g>
      <circle cx="242" cy="50" r="17" fill="#e7c975" />
      <path
        d="m235 50 5 5 9-11"
        stroke="#163c32"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
````

## src/components/use-clock.ts

````ts
"use client";
import { useEffect, useState } from "react";
// The clock is state so deadline labels change even when ticket data is unchanged.
export function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
````

## src/db/index.ts

````ts
import { type SQL } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globals = globalThis as unknown as {
  campusPool?: Pool;
  campusDb?: NodePgDatabase<typeof schema>;
};
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is not set. Follow the setup steps in README.md.",
    );
  if (!globals.campusPool) {
    globals.campusPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: process.env.VERCEL ? 3 : 15,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
    globals.campusPool.on("error", (error) =>
      console.error("An idle database connection closed", error.message),
    );
  }
  if (!globals.campusDb)
    globals.campusDb = drizzle(globals.campusPool, { schema });
  return globals.campusDb;
}
export type Executor = Pick<NodePgDatabase, "execute">;
export async function rows<T = Record<string, unknown>>(
  statement: SQL,
  executor: Executor = database(),
): Promise<T[]> {
  const result = await executor.execute(statement);
  return result.rows as T[];
}
export async function one<T = Record<string, unknown>>(
  statement: SQL,
  executor?: Executor,
): Promise<T | undefined> {
  return (await rows<T>(statement, executor))[0];
}
export async function closeDatabase() {
  await globals.campusPool?.end();
  globals.campusPool = undefined;
  globals.campusDb = undefined;
}
````

## src/db/schema.ts

````ts
import {
  pgTable,
  text,
  timestamp,
  foreignKey,
  check,
  uuid,
  integer,
  boolean,
  varchar,
  index,
  unique,
  inet,
  char,
  primaryKey,
  pgView,
  bigint,
  numeric,
  pgSequence,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const ticketPriorityEnum = pgEnum("ticket_priority_enum", [
  "P1_CRITICAL",
  "P2_URGENT",
  "P3_ROUTINE",
]);
export const ticketStatusEnum = pgEnum("ticket_status_enum", [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
  "DUPLICATE",
  "REJECTED",
]);
export const tradeSpecialtyEnum = pgEnum("trade_specialty_enum", [
  "ELECTRICAL",
  "PLUMBING",
  "HVAC_AIR_CONDITIONING",
  "CARPENTRY",
  "MASONRY_STRUCTURAL",
  "IT_AUDIOVISUAL",
  "GENERAL_CLEANING",
]);
export const userRoleEnum = pgEnum("user_role_enum", [
  "STUDENT",
  "STAFF",
  "TECHNICIAN",
  "FMD_DISPATCHER",
  "FMD_ADMIN",
]);

export const ticketNumberSeq = pgSequence("ticket_number_seq", {
  startWith: "1001",
  increment: "1",
  minValue: "1",
  maxValue: "9223372036854775807",
  cache: "1",
  cycle: false,
});

export const campusfixMigrations = pgTable("campusfix_migrations", {
  name: text().primaryKey().notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
});

export const technicians = pgTable(
  "technicians",
  {
    techId: uuid("tech_id").primaryKey().notNull(),
    tradeSpecialty: tradeSpecialtyEnum("trade_specialty").notNull(),
    activeWorkload: integer("active_workload").default(0).notNull(),
    isAvailable: boolean("is_available").default(true).notNull(),
    licenseCertification: varchar("license_certification", { length: 100 }),
  },
  (table) => [
    foreignKey({
      columns: [table.techId],
      foreignColumns: [users.userId],
      name: "technicians_tech_id_fkey",
    }).onDelete("cascade"),
    check("chk_workload_non_negative", sql`active_workload >= 0`),
  ],
);

export const users = pgTable(
  "users",
  {
    userId: uuid("user_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    institutionalId: varchar("institutional_id", { length: 20 }).notNull(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    email: varchar({ length: 150 }).notNull(),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: userRoleEnum().default("STUDENT").notNull(),
    failedAttempts: integer("failed_attempts").default(0).notNull(),
    isLocked: boolean("is_locked").default(false).notNull(),
    prefEmail: boolean("pref_email").default(true).notNull(),
    prefSms: boolean("pref_sms").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    lockedUntil: timestamp("locked_until", {
      withTimezone: true,
      mode: "string",
    }),
    isActive: boolean("is_active").default(true).notNull(),
    prefInApp: boolean("pref_in_app").default(true).notNull(),
  },
  (table) => [
    index("idx_users_email").using(
      "btree",
      table.email.asc().nullsLast().op("text_ops"),
    ),
    unique("users_institutional_id_key").on(table.institutionalId),
    unique("users_email_key").on(table.email),
    check(
      "chk_email_domain",
      sql`((email)::text ~~ '%@utech.edu.jm'::text) OR ((email)::text ~~ '%@utechstudents.edu.jm'::text)`,
    ),
  ],
);

export const locations = pgTable(
  "locations",
  {
    locationId: uuid("location_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    facultyCode: varchar("faculty_code", { length: 10 }).notNull(),
    buildingName: varchar("building_name", { length: 80 }).notNull(),
    roomNumber: varchar("room_number", { length: 30 }).notNull(),
    floorLevel: integer("floor_level").default(1).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [
    index("idx_locations_faculty").using(
      "btree",
      table.facultyCode.asc().nullsLast().op("text_ops"),
    ),
    unique("uq_location").on(
      table.facultyCode,
      table.buildingName,
      table.roomNumber,
    ),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    ticketId: varchar("ticket_id", { length: 15 }).primaryKey().notNull(),
    reporterId: uuid("reporter_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    locationId: uuid("location_id").notNull(),
    title: varchar({ length: 150 }).notNull(),
    description: text().notNull(),
    priority: ticketPriorityEnum().default("P3_ROUTINE").notNull(),
    status: ticketStatusEnum().default("PENDING").notNull(),
    assignedTechId: uuid("assigned_tech_id"),
    beforePhotoUri: varchar("before_photo_uri", { length: 500 }),
    afterPhotoUri: varchar("after_photo_uri", { length: 500 }),
    resolutionNotes: text("resolution_notes"),
    slaDeadline: timestamp("sla_deadline", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    assignedAt: timestamp("assigned_at", {
      withTimezone: true,
      mode: "string",
    }),
    resolvedAt: timestamp("resolved_at", {
      withTimezone: true,
      mode: "string",
    }),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    reporterUrgency: varchar("reporter_urgency", { length: 10 })
      .default("LOW")
      .notNull(),
    duplicateOf: varchar("duplicate_of", { length: 15 }),
    version: integer().default(1).notNull(),
    submissionKey: uuid("submission_key"),
  },
  (table) => [
    index("idx_tickets_created_at").using(
      "btree",
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("idx_tickets_duplicate_search")
      .using(
        "btree",
        table.locationId.asc().nullsLast().op("uuid_ops"),
        table.categoryId.asc().nullsLast().op("uuid_ops"),
        table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
      )
      .where(
        sql`(status = ANY (ARRAY['PENDING'::ticket_status_enum, 'ASSIGNED'::ticket_status_enum, 'IN_PROGRESS'::ticket_status_enum]))`,
      ),
    index("idx_tickets_location").using(
      "btree",
      table.locationId.asc().nullsLast().op("uuid_ops"),
    ),
    index("idx_tickets_priority").using(
      "btree",
      table.priority.asc().nullsLast().op("enum_ops"),
    ),
    index("idx_tickets_status").using(
      "btree",
      table.status.asc().nullsLast().op("enum_ops"),
    ),
    index("idx_tickets_tech").using(
      "btree",
      table.assignedTechId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.reporterId],
      foreignColumns: [users.userId],
      name: "tickets_reporter_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.categoryId],
      name: "tickets_category_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.locationId],
      foreignColumns: [locations.locationId],
      name: "tickets_location_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.assignedTechId],
      foreignColumns: [technicians.techId],
      name: "tickets_assigned_tech_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.duplicateOf],
      foreignColumns: [table.ticketId],
      name: "tickets_duplicate_of_fkey",
    }),
    unique("tickets_submission_key_key").on(table.submissionKey),
    check("chk_description_min_length", sql`length(description) >= 15`),
    check(
      "tickets_reporter_urgency_check",
      sql`(reporter_urgency)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying])::text[])`,
    ),
    check(
      "chk_description_length",
      sql`(char_length(description) >= 15) AND (char_length(description) <= 500)`,
    ),
    check(
      "chk_title_length",
      sql`(char_length((title)::text) >= 1) AND (char_length((title)::text) <= 150)`,
    ),
    check(
      "chk_not_self_duplicate",
      sql`(duplicate_of)::text IS DISTINCT FROM (ticket_id)::text`,
    ),
    check(
      "chk_assigned_state",
      sql`(status <> ALL (ARRAY['ASSIGNED'::ticket_status_enum, 'IN_PROGRESS'::ticket_status_enum])) OR (assigned_tech_id IS NOT NULL)`,
    ),
    check(
      "chk_completion",
      sql`(status <> ALL (ARRAY['COMPLETED'::ticket_status_enum, 'CLOSED'::ticket_status_enum])) OR ((resolved_at IS NOT NULL) AND (after_photo_uri IS NOT NULL) AND (char_length(resolution_notes) >= 10))`,
    ),
  ],
);

export const workOrderLogs = pgTable(
  "work_order_logs",
  {
    logId: uuid("log_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    ticketId: varchar("ticket_id", { length: 15 }).notNull(),
    techId: uuid("tech_id").notNull(),
    actionDescription: text("action_description").notNull(),
    partsConsumed: text("parts_consumed"),
    laborMinutes: integer("labor_minutes").default(0).notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [tickets.ticketId],
      name: "work_order_logs_ticket_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.techId],
      foreignColumns: [technicians.techId],
      name: "work_order_logs_tech_id_fkey",
    }).onDelete("restrict"),
    check("chk_labor", sql`(labor_minutes >= 0) AND (labor_minutes <= 1440)`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    auditId: uuid("audit_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    actorId: uuid("actor_id"),
    eventCode: varchar("event_code", { length: 50 }).notNull(),
    ticketId: varchar("ticket_id", { length: 15 }),
    details: text().notNull(),
    ipAddress: inet("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index("idx_audit_login_ip")
      .using(
        "btree",
        table.ipAddress.asc().nullsLast().op("timestamptz_ops"),
        table.createdAt.asc().nullsLast().op("inet_ops"),
      )
      .where(sql`((event_code)::text = 'LOGIN_FAILED'::text)`),
    index("idx_audit_ticket").using(
      "btree",
      table.ticketId.asc().nullsLast().op("timestamptz_ops"),
      table.createdAt.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [users.userId],
      name: "audit_logs_actor_id_fkey",
    }).onDelete("set null"),
  ],
);

export const categories = pgTable(
  "categories",
  {
    categoryId: uuid("category_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    categoryName: varchar("category_name", { length: 60 }).notNull(),
    tradeSpecialty: tradeSpecialtyEnum("trade_specialty").notNull(),
    defaultPriority: ticketPriorityEnum("default_priority")
      .default("P3_ROUTINE")
      .notNull(),
    defaultSlaHours: integer("default_sla_hours").default(72).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [unique("categories_category_name_key").on(table.categoryName)],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionId: uuid("session_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    userId: uuid("user_id").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_sessions_expiry").using(
      "btree",
      table.expiresAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "sessions_user_id_fkey",
    }).onDelete("cascade"),
    unique("sessions_token_hash_key").on(table.tokenHash),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    attachmentId: uuid("attachment_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    ownerId: uuid("owner_id").notNull(),
    ticketId: varchar("ticket_id", { length: 15 }),
    phase: varchar({ length: 10 }).notNull(),
    storageKey: text("storage_key").notNull(),
    originalName: varchar("original_name", { length: 200 }).notNull(),
    contentType: varchar("content_type", { length: 30 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    verified: boolean().default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_attachments_ticket").using(
      "btree",
      table.ticketId.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [users.userId],
      name: "attachments_owner_id_fkey",
    }),
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [tickets.ticketId],
      name: "attachments_ticket_id_fkey",
    }),
    unique("attachments_storage_key_key").on(table.storageKey),
    check(
      "attachments_phase_check",
      sql`(phase)::text = ANY ((ARRAY['BEFORE'::character varying, 'AFTER'::character varying])::text[])`,
    ),
    check(
      "attachments_content_type_check",
      sql`(content_type)::text = ANY ((ARRAY['image/jpeg'::character varying, 'image/png'::character varying])::text[])`,
    ),
    check(
      "attachments_byte_size_check",
      sql`(byte_size >= 1) AND (byte_size <= 4500000)`,
    ),
  ],
);

export const ticketComments = pgTable(
  "ticket_comments",
  {
    commentId: uuid("comment_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    ticketId: varchar("ticket_id", { length: 15 }).notNull(),
    authorId: uuid("author_id").notNull(),
    body: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [tickets.ticketId],
      name: "ticket_comments_ticket_id_fkey",
    }),
    foreignKey({
      columns: [table.authorId],
      foreignColumns: [users.userId],
      name: "ticket_comments_author_id_fkey",
    }),
    check(
      "ticket_comments_body_check",
      sql`(char_length(body) >= 1) AND (char_length(body) <= 2000)`,
    ),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    notificationId: uuid("notification_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    userId: uuid("user_id").notNull(),
    ticketId: varchar("ticket_id", { length: 15 }),
    eventCode: varchar("event_code", { length: 50 }).notNull(),
    title: varchar({ length: 150 }).notNull(),
    body: text().notNull(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_notifications_user").using(
      "btree",
      table.userId.asc().nullsLast().op("timestamptz_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "notifications_user_id_fkey",
    }),
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [tickets.ticketId],
      name: "notifications_ticket_id_fkey",
    }),
  ],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    deliveryId: uuid("delivery_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    notificationId: uuid("notification_id").notNull(),
    channel: varchar({ length: 10 }).notNull(),
    status: varchar({ length: 20 }).default("PENDING").notNull(),
    attempts: integer().default(0).notNull(),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (table) => [
    foreignKey({
      columns: [table.notificationId],
      foreignColumns: [notifications.notificationId],
      name: "notification_deliveries_notification_id_fkey",
    }),
    unique("notification_deliveries_notification_id_channel_key").on(
      table.notificationId,
      table.channel,
    ),
    check(
      "notification_deliveries_channel_check",
      sql`(channel)::text = ANY ((ARRAY['EMAIL'::character varying, 'SMS'::character varying])::text[])`,
    ),
    check(
      "notification_deliveries_status_check",
      sql`(status)::text = ANY ((ARRAY['PENDING'::character varying, 'TEST_RECORDED'::character varying, 'FAILED'::character varying])::text[])`,
    ),
  ],
);

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    jobId: uuid("job_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    kind: varchar({ length: 30 }).notNull(),
    ticketId: varchar("ticket_id", { length: 15 }),
    ticketVersion: integer("ticket_version"),
    availableAt: timestamp("available_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    status: varchar({ length: 15 }).default("PENDING").notNull(),
    workflowRunId: text("workflow_run_id"),
    attempts: integer().default(0).notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_background_jobs_pending").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
      table.availableAt.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [tickets.ticketId],
      name: "background_jobs_ticket_id_fkey",
    }),
    check(
      "background_jobs_kind_check",
      sql`(kind)::text = ANY ((ARRAY['NOTIFICATIONS'::character varying, 'AUTO_CLOSE'::character varying])::text[])`,
    ),
    check(
      "background_jobs_status_check",
      sql`(status)::text = ANY ((ARRAY['PENDING'::character varying, 'STARTED'::character varying, 'DONE'::character varying, 'FAILED'::character varying])::text[])`,
    ),
  ],
);

export const ticketSubscribers = pgTable(
  "ticket_subscribers",
  {
    ticketId: varchar("ticket_id", { length: 15 }).notNull(),
    userId: uuid("user_id").notNull(),
    subscribedAt: timestamp("subscribed_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index("idx_subscribers_user").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [tickets.ticketId],
      name: "ticket_subscribers_ticket_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "ticket_subscribers_user_id_fkey",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.ticketId, table.userId],
      name: "ticket_subscribers_pkey",
    }),
  ],
);
export const vwActiveDispatchQueue = pgView("vw_active_dispatch_queue", {
  ticketId: varchar("ticket_id", { length: 15 }),
  priority: ticketPriorityEnum(),
  status: ticketStatusEnum(),
  categoryName: varchar("category_name", { length: 60 }),
  facultyCode: varchar("faculty_code", { length: 10 }),
  buildingName: varchar("building_name", { length: 80 }),
  roomNumber: varchar("room_number", { length: 30 }),
  reporterName: varchar("reporter_name", { length: 120 }),
  reporterPhone: varchar("reporter_phone", { length: 20 }),
  assignedTechnician: varchar("assigned_technician", { length: 120 }),
  slaDeadline: timestamp("sla_deadline", {
    withTimezone: true,
    mode: "string",
  }),
  isSlaBreached: boolean("is_sla_breached"),
}).as(
  sql`SELECT t.ticket_id, t.priority, t.status, c.category_name, l.faculty_code, l.building_name, l.room_number, u.full_name AS reporter_name, u.phone_number AS reporter_phone, tech_user.full_name AS assigned_technician, t.sla_deadline, CASE WHEN CURRENT_TIMESTAMP > t.sla_deadline AND (t.status <> ALL (ARRAY['COMPLETED'::ticket_status_enum, 'CLOSED'::ticket_status_enum])) THEN true ELSE false END AS is_sla_breached FROM tickets t JOIN categories c ON t.category_id = c.category_id JOIN locations l ON t.location_id = l.location_id JOIN users u ON t.reporter_id = u.user_id LEFT JOIN users tech_user ON t.assigned_tech_id = tech_user.user_id WHERE t.status = ANY (ARRAY['PENDING'::ticket_status_enum, 'ASSIGNED'::ticket_status_enum, 'IN_PROGRESS'::ticket_status_enum])`,
);

export const vwFacultySlaCompliance = pgView("vw_faculty_sla_compliance", {
  facultyCode: varchar("faculty_code", { length: 10 }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  totalTickets: bigint("total_tickets", { mode: "number" }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  onTimeResolutions: bigint("on_time_resolutions", { mode: "number" }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  overdueResolutions: bigint("overdue_resolutions", { mode: "number" }),
  slaCompliancePercentage: numeric("sla_compliance_percentage"),
}).as(
  sql`SELECT l.faculty_code, count(t.ticket_id) AS total_tickets, count( CASE WHEN (t.status = ANY (ARRAY['COMPLETED'::ticket_status_enum, 'CLOSED'::ticket_status_enum])) AND t.resolved_at <= t.sla_deadline THEN 1 ELSE NULL::integer END) AS on_time_resolutions, count( CASE WHEN (t.status = ANY (ARRAY['COMPLETED'::ticket_status_enum, 'CLOSED'::ticket_status_enum])) AND t.resolved_at > t.sla_deadline THEN 1 ELSE NULL::integer END) AS overdue_resolutions, round(count( CASE WHEN (t.status = ANY (ARRAY['COMPLETED'::ticket_status_enum, 'CLOSED'::ticket_status_enum])) AND t.resolved_at <= t.sla_deadline THEN 1 ELSE NULL::integer END)::numeric / NULLIF(count( CASE WHEN t.status = ANY (ARRAY['COMPLETED'::ticket_status_enum, 'CLOSED'::ticket_status_enum]) THEN 1 ELSE NULL::integer END), 0)::numeric * 100::numeric, 2) AS sla_compliance_percentage FROM tickets t JOIN locations l ON t.location_id = l.location_id GROUP BY l.faculty_code`,
);
````

## src/lib/auth.ts

````ts
import { database, one, rows } from "@/db";
import { compare } from "bcryptjs";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { type User, loginInput } from "./domain";
import { AppError } from "./errors";
import { accountAccess } from "./policies";

export const SESSION_COOKIE = "campusfix_session";
const userColumns = sql`u.user_id,u.institutional_id,u.full_name,u.email,u.phone_number,u.role,u.pref_email,u.pref_sms,u.pref_in_app,u.is_active`;
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function getUser(token?: string): Promise<User | null> {
  const value = token ?? (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value || value.length !== 64) return null;
  const user = await one(
    sql`SELECT ${userColumns} FROM sessions s JOIN users u ON u.user_id=s.user_id WHERE s.token_hash=${hash(value)} AND s.expires_at>NOW() AND u.is_active=TRUE`,
  );
  return (user as unknown as User) ?? null;
}
export async function requireUser(token?: string) {
  const user = await getUser(token);
  if (!user)
    throw new AppError("Please sign in to continue.", 401, "SIGN_IN_REQUIRED");
  return user;
}
export async function login(input: unknown, ip: string | null = null) {
  const data = loginInput.parse(input);
  // Hash work is also performed for an unknown account to reduce timing differences.
  const dummyHash =
    "$2b$12$D8qdUL9pViSSxTMM1cN9BOO6jY6EcA3r82.XW5iiXrRZJnQl7pnO6";
  const result = await database().transaction(async (tx) => {
    const account = await one(
      sql`SELECT * FROM users WHERE LOWER(email)=LOWER(${data.identifier}) OR institutional_id=${data.identifier} FOR UPDATE`,
      tx,
    );
    if (!account) {
      await compare(data.password, dummyHash);
      await rows(
        sql`INSERT INTO audit_logs(event_code,details,ip_address) VALUES ('LOGIN_FAILED','Unknown account',${ip}::inet)`,
        tx,
      );
      return {
        error: "The email, ID, or password is not correct.",
        status: 401,
      };
    }
    const access = accountAccess(
      Boolean(account.is_active),
      account.locked_until as Date | null,
      Date.now(),
    );
    if (access === "INACTIVE")
      return {
        error: "This account is not active. Contact the administrator.",
        status: 403,
      };
    if (access === "LOCKED")
      return {
        error: "This account is locked. Try again after 30 minutes.",
        status: 429,
      };
    const reset =
      account.locked_until &&
      new Date(account.locked_until as string).getTime() <= Date.now();
    const valid = await compare(data.password, account.password_hash as string);
    if (!valid) {
      const failures = reset ? 1 : Number(account.failed_attempts) + 1;
      await rows(
        sql`UPDATE users SET failed_attempts=${failures},is_locked=${failures >= 5},locked_until=CASE WHEN ${failures}>=5 THEN NOW()+INTERVAL '30 minutes' ELSE NULL END WHERE user_id=${account.user_id}::uuid`,
        tx,
      );
      await rows(
        sql`INSERT INTO audit_logs(actor_id,event_code,details,ip_address) VALUES (${account.user_id}::uuid,'LOGIN_FAILED',${failures >= 5 ? "Account locked after five failed attempts" : "Invalid password"},${ip}::inet)`,
        tx,
      );
      return {
        error:
          failures >= 5
            ? "This account is locked. Try again after 30 minutes."
            : "The email, ID, or password is not correct.",
        status: failures >= 5 ? 429 : 401,
      };
    }
    const token = randomBytes(32).toString("hex");
    await rows(
      sql`UPDATE users SET failed_attempts=0,is_locked=FALSE,locked_until=NULL,updated_at=NOW() WHERE user_id=${account.user_id}::uuid`,
      tx,
    );
    await rows(
      sql`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (${hash(token)},${account.user_id}::uuid,NOW()+INTERVAL '120 minutes')`,
      tx,
    );
    await rows(
      sql`INSERT INTO audit_logs(actor_id,event_code,details,ip_address) VALUES (${account.user_id}::uuid,'LOGIN_SUCCESS','Signed in',${ip}::inet)`,
      tx,
    );
    return { token };
  });
  if ("error" in result) throw new AppError(result.error!, result.status);
  return result.token;
}
export async function logout(token: string | undefined) {
  if (token)
    await rows(sql`DELETE FROM sessions WHERE token_hash=${hash(token)}`);
}
````

## src/lib/client.ts

````ts
import { upload } from "@vercel/blob/client";
import { MAX_PHOTO_BYTES } from "./domain";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    cache: "no-store",
  });
  const data = await response
    .json()
    .catch(() => ({ error: "The server response could not be read." }));
  if (!response.ok)
    throw new ApiError(
      data.error ?? "The request could not be completed.",
      response.status,
      data.fields,
    );
  return data;
}
export async function uploadPhoto(
  file: File,
  phase: "BEFORE" | "AFTER",
  driver: string,
): Promise<string> {
  if (file.size < 1 || file.size > MAX_PHOTO_BYTES)
    throw new Error("Choose a photo from 1 byte to 4.5 MB.");
  if (!["image/jpeg", "image/png"].includes(file.type))
    throw new Error("Choose a JPG or PNG photo.");
  if (driver !== "vercel") {
    const form = new FormData();
    form.set("file", file);
    form.set("phase", phase);
    return (
      await api<{ attachment_id: string }>("/api/uploads", {
        method: "POST",
        body: form,
      })
    ).attachment_id;
  }
  const item = await api<{ attachment_id: string; pathname: string }>(
    "/api/uploads/prepare",
    {
      method: "POST",
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type,
        phase,
      }),
    },
  );
  await upload(item.pathname, file, {
    access: "private",
    handleUploadUrl: "/api/uploads/blob",
  });
  await api("/api/uploads/confirm", {
    method: "POST",
    body: JSON.stringify({ attachmentId: item.attachment_id }),
  });
  return item.attachment_id;
}
````

## src/lib/domain.ts

````ts
import { z } from "zod";
import { AppError } from "./errors";
import { priorityHours } from "./policies";

export const ROLES = [
  "STUDENT",
  "STAFF",
  "TECHNICIAN",
  "FMD_DISPATCHER",
  "FMD_ADMIN",
] as const;
export type Role = (typeof ROLES)[number];
export const PRIORITIES = ["P1_CRITICAL", "P2_URGENT", "P3_ROUTINE"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const STATUSES = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
  "DUPLICATE",
  "REJECTED",
] as const;
export type TicketStatus = (typeof STATUSES)[number];
export const TRADES = [
  "ELECTRICAL",
  "PLUMBING",
  "HVAC_AIR_CONDITIONING",
  "CARPENTRY",
  "MASONRY_STRUCTURAL",
  "IT_AUDIOVISUAL",
  "GENERAL_CLEANING",
] as const;
export type Trade = (typeof TRADES)[number];
export const MAX_PHOTO_BYTES = 4_500_000;
export const SLA_HOURS: Record<Priority, number> = {
  P1_CRITICAL: 4,
  P2_URGENT: 24,
  P3_ROUTINE: 72,
};
export const ACTIVE_STATUSES: TicketStatus[] = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
];
export const isManager = (role: Role) =>
  role === "FMD_ADMIN" || role === "FMD_DISPATCHER";
export const isReporter = (role: Role) =>
  role === "STUDENT" || role === "STAFF";
export function slaDeadline(createdAt: Date | string, priority: Priority) {
  return new Date(
    new Date(createdAt).getTime() + priorityHours(priority) * 3_600_000,
  );
}
export const label = (value: string) =>
  ({
    FMD_ADMIN: "Administrator",
    FMD_DISPATCHER: "Dispatcher",
    HVAC_AIR_CONDITIONING: "Air conditioning",
    IT_AUDIOVISUAL: "IT and classroom equipment",
    MASONRY_STRUCTURAL: "Buildings and grounds",
    GENERAL_CLEANING: "Cleaning",
    P1_CRITICAL: "Critical",
    P2_URGENT: "Urgent",
    P3_ROUTINE: "Routine",
  })[value] ??
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
export const facultyLabel: Record<string, string> = {
  FENC: "Engineering and Computing",
  FOBM: "Business and Management",
  FOSS: "Science and Sport",
  COHS: "Health Sciences",
  CML: "Calvin McKain Library",
  RES: "Student residences",
};
export const ticketInput = z.object({
  categoryId: z.uuid(),
  locationId: z.uuid(),
  title: z
    .string()
    .trim()
    .min(1, "Enter a title.")
    .max(150, "Use 150 characters or fewer."),
  description: z
    .string()
    .trim()
    .min(15, "Use at least 15 characters.")
    .max(500, "Use 500 characters or fewer."),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]),
  attachmentId: z.uuid().optional(),
  submissionKey: z.uuid(),
});
export const loginInput = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Enter your email or university ID.")
    .max(150),
  password: z.string().min(1, "Enter your password.").max(128),
});
export const actionInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    version: z.number().int(),
    priority: z.enum(PRIORITIES),
    technicianId: z.union([z.uuid(), z.literal("auto")]),
  }),
  z.object({ action: z.literal("start"), version: z.number().int() }),
  z.object({
    action: z.literal("log"),
    version: z.number().int(),
    notes: z.string().trim().min(3).max(2000),
    parts: z.string().trim().max(1000),
    laborMinutes: z.number().int().min(0).max(1440),
  }),
  z.object({
    action: z.literal("complete"),
    version: z.number().int(),
    notes: z
      .string()
      .trim()
      .min(10, "Use at least 10 characters for repair notes.")
      .max(2000),
    attachmentId: z.uuid(),
  }),
  z.object({ action: z.literal("close"), version: z.number().int() }),
  z.object({
    action: z.literal("dispute"),
    version: z.number().int(),
    reason: z.string().trim().min(10).max(1000),
  }),
  z.object({
    action: z.literal("reject"),
    version: z.number().int(),
    reason: z.string().trim().min(10).max(1000),
  }),
  z.object({
    action: z.literal("merge"),
    version: z.number().int(),
    masterId: z.string().regex(/^CF-\d{4}-\d{4,}$/),
    reason: z.string().trim().min(10).max(1000),
  }),
  z.object({ action: z.literal("follow") }),
  z.object({
    action: z.literal("comment"),
    body: z.string().trim().min(1).max(2000),
  }),
]);
export type TicketAction = z.infer<typeof actionInput>;
export type TicketInput = z.infer<typeof ticketInput>;
export interface User {
  user_id: string;
  institutional_id: string;
  full_name: string;
  email: string;
  role: Role;
  phone_number: string;
  pref_email: boolean;
  pref_sms: boolean;
  pref_in_app: boolean;
  is_active: boolean;
}
export interface Category {
  category_id: string;
  category_name: string;
  trade_specialty: Trade;
  default_priority: Priority;
  is_active: boolean;
}
export interface Location {
  location_id: string;
  faculty_code: string;
  building_name: string;
  room_number: string;
  is_active: boolean;
}
export interface Technician {
  tech_id: string;
  full_name: string;
  trade_specialty: Trade;
  active_workload: number;
  is_available: boolean;
  is_active: boolean;
}
export interface Ticket {
  ticket_id: string;
  reporter_id: string;
  category_id: string;
  location_id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  assigned_tech_id: string | null;
  reporter_urgency: string;
  duplicate_of: string | null;
  version: number;
  created_at: string;
  assigned_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  sla_deadline: string;
  category_name: string;
  faculty_code: string;
  building_name: string;
  room_number: string;
  reporter_name: string;
  technician_name: string | null;
  resolution_notes: string | null;
  is_following?: boolean;
}
export interface TicketDetail {
  ticket: Ticket;
  comments: {
    comment_id: string;
    full_name: string;
    body: string;
    created_at: string;
  }[];
  activity: {
    audit_id: string;
    full_name: string | null;
    event_code: string;
    details: string;
    created_at: string;
  }[];
  logs: {
    log_id: string;
    full_name: string;
    action_description: string;
    parts_consumed: string;
    labor_minutes: number;
    logged_at: string;
  }[];
  attachments: {
    attachment_id: string;
    phase: "BEFORE" | "AFTER";
    original_name: string;
    content_type: string;
    byte_size: number;
  }[];
}
export function canReadTicket(
  user: User,
  ticket: Pick<Ticket, "reporter_id" | "assigned_tech_id">,
  follows: boolean,
) {
  return (
    isManager(user.role) ||
    (user.role === "TECHNICIAN"
      ? ticket.assigned_tech_id === user.user_id
      : ticket.reporter_id === user.user_id || follows)
  );
}
export function validatePhotoSize(size: number) {
  if (!Number.isInteger(size))
    throw new AppError("The photo size must be a whole number of bytes.");
  if (size < 1) throw new AppError("The photo cannot be empty.");
  if (size > MAX_PHOTO_BYTES)
    throw new AppError("The photo must be 4.5 MB or smaller.");
}
export function formatDate(value: string | Date | null) {
  return value
    ? new Intl.DateTimeFormat("en-JM", {
        timeZone: "America/Jamaica",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "Not yet";
}
````

## src/lib/errors.ts

````ts
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "INVALID_REQUEST",
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new AppError(message, status);
}
````

## src/lib/jobs.ts

````ts
import { one, rows } from "@/db";
import { sql } from "drizzle-orm";
import { processTestDeliveries } from "./notifications";
import { autoCloseTicket } from "./tickets";

export async function executeBackgroundJob(id: string) {
  const job = await one<{
    job_id: string;
    kind: string;
    ticket_id: string;
    ticket_version: number;
    status: string;
    available_at: Date;
  }>(sql`SELECT * FROM background_jobs WHERE job_id=${id}::uuid`);
  if (!job || job.status === "DONE") return;
  if (new Date(job.available_at).getTime() > Date.now()) return;
  try {
    if (job.kind === "AUTO_CLOSE")
      await autoCloseTicket(job.ticket_id, job.ticket_version);
    else {
      let processed = 0;
      do {
        processed = await processTestDeliveries();
      } while (processed === 100);
    }
    await rows(
      sql`UPDATE background_jobs SET status='DONE',attempts=attempts+1,last_error=NULL WHERE job_id=${id}::uuid`,
    );
  } catch (error) {
    await rows(
      sql`UPDATE background_jobs SET status='PENDING',attempts=attempts+1,last_error=${error instanceof Error ? error.message : "Background task failed"} WHERE job_id=${id}::uuid`,
    );
    throw error;
  }
}
export async function runDueJobs() {
  const jobs = await rows<{ job_id: string }>(
    sql`SELECT job_id FROM background_jobs WHERE status IN ('PENDING','STARTED') AND available_at<=NOW() AND attempts<5 ORDER BY available_at LIMIT 100`,
  );
  for (const job of jobs) await executeBackgroundJob(job.job_id);
  return jobs.length;
}
export async function launchPendingWorkflows() {
  const { start } = await import("workflow/api");
  const { maintenanceJob } = await import("@/workflows/maintenance");
  // Claims survive a failed start. A later request or the daily recovery job can retry.
  const jobs = await rows<{ job_id: string; available_at: Date }>(
    sql`UPDATE background_jobs SET status='STARTED' WHERE job_id IN (SELECT job_id FROM background_jobs WHERE status='PENDING' AND attempts<5 ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING job_id,available_at`,
  );
  for (const job of jobs) {
    try {
      const run = await start(maintenanceJob, [
        job.job_id,
        new Date(job.available_at).toISOString(),
      ]);
      await rows(
        sql`UPDATE background_jobs SET workflow_run_id=${run.runId} WHERE job_id=${job.job_id}::uuid`,
      );
    } catch (error) {
      await rows(
        sql`UPDATE background_jobs SET status='PENDING',attempts=attempts+1,last_error=${error instanceof Error ? error.message : "Workflow could not start"} WHERE job_id=${job.job_id}::uuid`,
      );
      console.error("Workflow start failed", job.job_id);
    }
  }
}
````

## src/lib/notifications.ts

````ts
import { database, one, rows, type Executor } from "@/db";
import { sql } from "drizzle-orm";
import type { User } from "./domain";
import { deliveryChannels } from "./policies";

export async function notifyTicket(
  ticketId: string,
  event: string,
  title: string,
  body: string,
  tx: Executor,
  extraUserId?: string,
) {
  const recipients = await rows<{
    user_id: string;
    pref_email: boolean;
    pref_sms: boolean;
    pref_in_app: boolean;
  }>(
    sql`
    SELECT DISTINCT u.user_id,u.pref_email,u.pref_sms,u.pref_in_app FROM users u
    WHERE u.is_active AND (u.user_id IN (SELECT reporter_id FROM tickets WHERE ticket_id=${ticketId})
      OR u.user_id IN (SELECT user_id FROM ticket_subscribers WHERE ticket_id=${ticketId})
      OR u.user_id=${extraUserId ?? null}::uuid)`,
    tx,
  );
  for (const recipient of recipients) {
    const notification = await one<{ notification_id: string }>(
      sql`INSERT INTO notifications(user_id,ticket_id,event_code,title,body) VALUES (${recipient.user_id}::uuid,${ticketId},${event},${title},${body}) RETURNING notification_id`,
      tx,
    );
    for (const channel of deliveryChannels(
      recipient.pref_email,
      recipient.pref_sms,
    ))
      await rows(
        sql`INSERT INTO notification_deliveries(notification_id,channel) VALUES (${notification!.notification_id}::uuid,${channel})`,
        tx,
      );
  }
  await rows(
    sql`INSERT INTO background_jobs(kind,ticket_id) VALUES ('NOTIFICATIONS',${ticketId})`,
    tx,
  );
}
export async function processTestDeliveries(fail = false) {
  // The course build uses a test transport. No email or SMS is sent to a person.
  return database().transaction(async (tx) => {
    const deliveries = await rows<{ delivery_id: string }>(
      sql`SELECT delivery_id FROM notification_deliveries WHERE status='PENDING' AND attempts<3 ORDER BY delivery_id FOR UPDATE SKIP LOCKED LIMIT 100`,
      tx,
    );
    for (const item of deliveries) {
      if (fail)
        await rows(
          sql`UPDATE notification_deliveries SET attempts=attempts+1,last_error='Test transport failure',status=CASE WHEN attempts+1>=3 THEN 'FAILED' ELSE 'PENDING' END WHERE delivery_id=${item.delivery_id}::uuid`,
          tx,
        );
      else
        await rows(
          sql`UPDATE notification_deliveries SET status='TEST_RECORDED',attempts=attempts+1,processed_at=NOW(),last_error=NULL WHERE delivery_id=${item.delivery_id}::uuid`,
          tx,
        );
    }
    return deliveries.length;
  });
}
export async function getNotifications(user: User) {
  if (!user.pref_in_app) return [];
  return rows(
    sql`SELECT notification_id,ticket_id,event_code,title,body,read_at,created_at FROM notifications WHERE user_id=${user.user_id}::uuid ORDER BY created_at DESC LIMIT 100`,
  );
}
export async function markNotificationsRead(user: User) {
  await rows(
    sql`UPDATE notifications SET read_at=NOW() WHERE user_id=${user.user_id}::uuid AND read_at IS NULL`,
  );
}
````

## src/lib/offline.ts

````ts
import { openDB } from "idb";
import { api, uploadPhoto } from "./client";
import type { TicketInput, User } from "./domain";
export type Draft = {
  userId: string;
  data: Partial<TicketInput> & { faculty?: string; building?: string };
  photo?: File;
  savedAt: number;
};
type Queued = {
  key: string;
  userId: string;
  data: TicketInput;
  photo?: File;
  driver: string;
  queuedAt: number;
};
const open = () =>
  openDB("campusfix-reports", 1, {
    upgrade(db) {
      db.createObjectStore("drafts");
      db.createObjectStore("submissions", { keyPath: "key" });
    },
  });
export async function saveDraft(draft: Draft) {
  const db = await open();
  await db.put("drafts", draft, draft.userId);
}
export async function readDraft(userId: string): Promise<Draft | undefined> {
  return (await open()).get("drafts", userId);
}
export async function removeDraft(userId: string) {
  await (await open()).delete("drafts", userId);
}
export async function queueReport(item: Omit<Queued, "key" | "queuedAt">) {
  await (
    await open()
  ).put("submissions", {
    ...item,
    key: item.data.submissionKey,
    queuedAt: Date.now(),
  });
  await removeDraft(item.userId);
}
export async function queuedCount(userId: string) {
  return ((await (await open()).getAll("submissions")) as Queued[]).filter(
    (q) => q.userId === userId,
  ).length;
}
let processing = false;
export async function flushReports(
  userId: string,
  onSent?: (id: string) => void,
) {
  if (processing || !navigator.onLine) return;
  processing = true;
  try {
    const { user } = await api<{ user: User }>("/api/session");
    if (user.user_id !== userId) return;
    const db = await open();
    const items = ((await db.getAll("submissions")) as Queued[]).filter(
      (q) => q.userId === userId,
    );
    for (const item of items) {
      if (item.photo && !item.data.attachmentId) {
        item.data.attachmentId = await uploadPhoto(
          item.photo,
          "BEFORE",
          item.driver,
        );
        await db.put("submissions", item);
      }
      const result = await api<{ ticketId: string }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify(item.data),
      });
      await db.delete("submissions", item.key);
      onSent?.(result.ticketId);
    }
  } finally {
    processing = false;
  }
}
````

## src/lib/policies.ts

````ts
import type { Priority, TicketStatus } from "./domain";

// Small decision routines keep the assessed business rules explicit and testable.
export function accountAccess(
  active: boolean,
  lockedUntil: Date | string | null,
  now: number,
): "INACTIVE" | "LOCKED" | "OPEN" {
  if (!active) return "INACTIVE";
  if (lockedUntil === null) return "OPEN";
  if (new Date(lockedUntil).getTime() > now) return "LOCKED";
  return "OPEN";
}
export function priorityHours(priority: Priority) {
  if (priority === "P1_CRITICAL") return 4;
  if (priority === "P2_URGENT") return 24;
  return 72;
}
export function completionDecision(
  assignedTechId: string | null,
  actorId: string,
  status: TicketStatus,
  verifiedPhoto: boolean,
): "FORBIDDEN" | "NOT_STARTED" | "MISSING_PROOF" | "READY" {
  if (assignedTechId !== actorId) return "FORBIDDEN";
  if (status !== "IN_PROGRESS") return "NOT_STARTED";
  if (!verifiedPhoto) return "MISSING_PROOF";
  return "READY";
}
export function deliveryChannels(email: boolean, sms: boolean) {
  const channels: ("EMAIL" | "SMS")[] = [];
  if (email) channels.push("EMAIL");
  if (sms) channels.push("SMS");
  return channels;
}
````

## src/lib/reference.ts

````ts
import { database, one, rows } from "@/db";
import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { PRIORITIES, ROLES, TRADES, isManager, type User } from "./domain";
import { assert } from "./errors";
import { audit } from "./tickets";

export async function referenceData(user: User) {
  const manager = isManager(user.role);
  const [categories, locations, technicians] = await Promise.all([
    rows(
      sql`SELECT * FROM categories WHERE is_active OR ${manager} ORDER BY category_name`,
    ),
    rows(
      sql`SELECT * FROM locations WHERE is_active OR ${manager} ORDER BY faculty_code,building_name,room_number`,
    ),
    rows(
      sql`SELECT p.tech_id,u.full_name,p.trade_specialty,p.active_workload,p.is_available,u.is_active FROM technicians p JOIN users u ON u.user_id=p.tech_id WHERE ${manager} OR p.tech_id=${user.user_id}::uuid ORDER BY u.full_name`,
    ),
  ]);
  return {
    categories,
    locations,
    technicians,
    storageDriver: process.env.STORAGE_DRIVER ?? "local",
    demoMode: process.env.DEMO_MODE === "true",
  };
}
export async function listUsers(user: User) {
  assert(
    user.role === "FMD_ADMIN",
    "Only administrators can manage accounts.",
    403,
  );
  return rows(
    sql`SELECT u.user_id,u.institutional_id,u.full_name,u.email,u.role,u.is_active,u.locked_until,p.trade_specialty,p.is_available,p.active_workload FROM users u LEFT JOIN technicians p ON p.tech_id=u.user_id ORDER BY u.full_name`,
  );
}
const newUser = z.object({
  fullName: z.string().trim().min(2).max(120),
  institutionalId: z.string().trim().min(3).max(20),
  email: z
    .email()
    .regex(
      /@(utech\.edu\.jm|utechstudents\.edu\.jm)$/i,
      "Use an institutional email address.",
    ),
  role: z.enum(ROLES),
  password: z.string().min(12).max(72),
  trade: z.enum(TRADES).optional(),
});
export async function createUser(actor: User, input: unknown) {
  assert(
    actor.role === "FMD_ADMIN",
    "Only administrators can create accounts.",
    403,
  );
  const data = newUser.parse(input);
  assert(
    data.role !== "TECHNICIAN" || data.trade,
    "Select a technician trade.",
  );
  const passwordHash = await hash(data.password, 12);
  return database().transaction(async (tx) => {
    const created = await one<{ user_id: string }>(
      sql`INSERT INTO users(institutional_id,full_name,email,phone_number,password_hash,role) VALUES (${data.institutionalId},${data.fullName},${data.email.toLowerCase()},'',${passwordHash},${data.role}) RETURNING user_id`,
      tx,
    );
    if (data.role === "TECHNICIAN")
      await rows(
        sql`INSERT INTO technicians(tech_id,trade_specialty) VALUES (${created!.user_id}::uuid,${data.trade!})`,
        tx,
      );
    await audit(
      actor.user_id,
      "USER_CREATED",
      null,
      `Created ${data.role} account ${data.institutionalId}.`,
      tx,
    );
    return created;
  });
}
export async function updateUser(actor: User, input: unknown) {
  assert(
    actor.role === "FMD_ADMIN",
    "Only administrators can manage accounts.",
    403,
  );
  const data = z
    .object({
      userId: z.uuid(),
      active: z.boolean().optional(),
      available: z.boolean().optional(),
      unlock: z.boolean().optional(),
    })
    .parse(input);
  assert(
    data.userId !== actor.user_id || data.active !== false,
    "You cannot deactivate your own account.",
  );
  await database().transaction(async (tx) => {
    const target = await one(
      sql`SELECT user_id FROM users WHERE user_id=${data.userId}::uuid FOR UPDATE`,
      tx,
    );
    assert(target, "This account was not found.", 404);
    if (data.active === false) {
      const jobs = await one<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM tickets WHERE assigned_tech_id=${data.userId}::uuid AND status IN ('ASSIGNED','IN_PROGRESS')`,
        tx,
      );
      assert(
        !jobs?.count,
        "Reassign this technician's active jobs before deactivating the account.",
        409,
      );
      await rows(
        sql`DELETE FROM sessions WHERE user_id=${data.userId}::uuid`,
        tx,
      );
    }
    if (data.active !== undefined)
      await rows(
        sql`UPDATE users SET is_active=${data.active},updated_at=NOW() WHERE user_id=${data.userId}::uuid`,
        tx,
      );
    if (data.available !== undefined)
      await rows(
        sql`UPDATE technicians SET is_available=${data.available} WHERE tech_id=${data.userId}::uuid`,
        tx,
      );
    if (data.unlock)
      await rows(
        sql`UPDATE users SET is_locked=FALSE,locked_until=NULL,failed_attempts=0 WHERE user_id=${data.userId}::uuid`,
        tx,
      );
    await audit(
      actor.user_id,
      "USER_UPDATED",
      null,
      `Updated account ${data.userId}.`,
      tx,
    );
  });
  return { ok: true };
}
export async function updateReference(actor: User, input: unknown) {
  assert(
    actor.role === "FMD_ADMIN",
    "Only administrators can manage reference data.",
    403,
  );
  const data = z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("category"),
        id: z.uuid().optional(),
        name: z.string().trim().min(2).max(60),
        trade: z.enum(TRADES),
        priority: z.enum(PRIORITIES),
        active: z.boolean(),
      }),
      z.object({
        kind: z.literal("location"),
        id: z.uuid().optional(),
        faculty: z.enum(["FENC", "FOBM", "FOSS", "COHS", "CML", "RES"]),
        building: z.string().trim().min(2).max(80),
        room: z.string().trim().min(1).max(30),
        active: z.boolean(),
      }),
    ])
    .parse(input);
  await database().transaction(async (tx) => {
    if (data.kind === "category") {
      if (data.id)
        await rows(
          sql`UPDATE categories SET category_name=${data.name},trade_specialty=${data.trade},default_priority=${data.priority},default_sla_hours=${data.priority === "P1_CRITICAL" ? 4 : data.priority === "P2_URGENT" ? 24 : 72},is_active=${data.active} WHERE category_id=${data.id}::uuid`,
          tx,
        );
      else
        await rows(
          sql`INSERT INTO categories(category_name,trade_specialty,default_priority,default_sla_hours,is_active) VALUES (${data.name},${data.trade},${data.priority},${data.priority === "P1_CRITICAL" ? 4 : data.priority === "P2_URGENT" ? 24 : 72},${data.active})`,
          tx,
        );
    } else {
      if (data.id)
        await rows(
          sql`UPDATE locations SET faculty_code=${data.faculty},building_name=${data.building},room_number=${data.room},is_active=${data.active} WHERE location_id=${data.id}::uuid`,
          tx,
        );
      else
        await rows(
          sql`INSERT INTO locations(faculty_code,building_name,room_number,is_active) VALUES (${data.faculty},${data.building},${data.room},${data.active})`,
          tx,
        );
    }
    await audit(
      actor.user_id,
      "REFERENCE_UPDATED",
      null,
      `Updated ${data.kind} reference data.`,
      tx,
    );
  });
  return { ok: true };
}
````

## src/lib/reports.ts

````ts
import { one, rows } from "@/db";
import { sql } from "drizzle-orm";
import { type User, isManager } from "./domain";
import { assert } from "./errors";
import { accessWhere, ticketSelect } from "./tickets";

export async function dashboard(user: User) {
  const where = accessWhere(user);
  const counts = await one(
    sql`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE t.status IN ('PENDING','ASSIGNED','IN_PROGRESS'))::int AS active,COUNT(*) FILTER(WHERE t.status='PENDING')::int AS pending,COUNT(*) FILTER(WHERE t.status IN ('COMPLETED','CLOSED'))::int AS completed,COUNT(*) FILTER(WHERE t.status IN ('PENDING','ASSIGNED','IN_PROGRESS') AND t.sla_deadline<NOW())::int AS overdue,COUNT(*) FILTER(WHERE t.priority='P1_CRITICAL' AND t.status IN ('PENDING','ASSIGNED','IN_PROGRESS'))::int AS critical FROM tickets t WHERE ${where}`,
  );
  const recent = await rows(
    sql`${ticketSelect} WHERE ${where} ORDER BY t.created_at DESC LIMIT 5`,
  );
  const activity = await rows(
    sql`SELECT a.audit_id,a.event_code,a.details,a.ticket_id,a.created_at,u.full_name FROM audit_logs a JOIN tickets t ON t.ticket_id=a.ticket_id LEFT JOIN users u ON u.user_id=a.actor_id WHERE ${where} ORDER BY a.created_at DESC LIMIT 6`,
  );
  const categories = await rows(
    sql`SELECT c.category_name,COUNT(*)::int AS count FROM tickets t JOIN categories c ON c.category_id=t.category_id WHERE ${where} AND t.status IN ('PENDING','ASSIGNED','IN_PROGRESS') GROUP BY c.category_name ORDER BY count DESC`,
  );
  const unread = user.pref_in_app
    ? await one<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id=${user.user_id}::uuid AND read_at IS NULL`,
      )
    : { count: 0 };
  return { counts, recent, activity, categories, unread: unread?.count ?? 0 };
}
export async function reports(
  user: User,
  params: URLSearchParams = new URLSearchParams(),
) {
  assert(
    isManager(user.role),
    "Only facilities staff can view these reports.",
    403,
  );
  const conditions = [sql`t.status NOT IN ('DUPLICATE','REJECTED')`];
  if (params.get("faculty"))
    conditions.push(sql`l.faculty_code=${params.get("faculty")}`);
  for (const key of ["from", "to"])
    if (params.get(key)) {
      assert(
        /^\d{4}-\d{2}-\d{2}$/.test(params.get(key)!),
        "Use a valid report date.",
      );
      conditions.push(
        key === "from"
          ? sql`t.created_at>=(${params.get(key)}::date::timestamp AT TIME ZONE 'America/Jamaica')`
          : sql`t.created_at<((${params.get(key)}::date+1)::timestamp AT TIME ZONE 'America/Jamaica')`,
      );
    }
  const where = sql.join(conditions, sql` AND `);
  const summary = await one(
    sql`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE t.status IN ('PENDING','ASSIGNED','IN_PROGRESS'))::int AS active,COUNT(*) FILTER(WHERE t.status IN ('COMPLETED','CLOSED'))::int AS completed,ROUND(AVG(EXTRACT(EPOCH FROM(t.resolved_at-t.created_at))/3600) FILTER(WHERE t.status IN ('COMPLETED','CLOSED'))::numeric,1) AS mttr_hours,ROUND(100.0*COUNT(*) FILTER(WHERE t.status IN ('COMPLETED','CLOSED') AND t.resolved_at<=t.sla_deadline)/NULLIF(COUNT(*) FILTER(WHERE t.status IN ('COMPLETED','CLOSED')),0),1) AS sla_percent FROM tickets t JOIN locations l ON l.location_id=t.location_id WHERE ${where}`,
  );
  const faculties = await rows(
    sql`SELECT l.faculty_code,COUNT(*)::int AS total,COUNT(*) FILTER(WHERE t.status IN ('COMPLETED','CLOSED'))::int AS completed,COUNT(*) FILTER(WHERE t.status IN ('PENDING','ASSIGNED','IN_PROGRESS') AND t.sla_deadline<NOW())::int AS overdue,ROUND(AVG(EXTRACT(EPOCH FROM(t.resolved_at-t.created_at))/3600) FILTER(WHERE t.status IN ('COMPLETED','CLOSED'))::numeric,1) AS mttr_hours FROM tickets t JOIN locations l ON l.location_id=t.location_id WHERE ${where} GROUP BY l.faculty_code ORDER BY total DESC`,
  );
  const buildings = await rows(
    sql`SELECT l.building_name,c.category_name,COUNT(*)::int AS count FROM tickets t JOIN locations l ON l.location_id=t.location_id JOIN categories c ON c.category_id=t.category_id WHERE ${where} GROUP BY l.building_name,c.category_name ORDER BY count DESC LIMIT 10`,
  );
  const technicians = await rows(
    sql`SELECT u.full_name,COUNT(*)::int AS completed,ROUND(AVG(EXTRACT(EPOCH FROM(t.resolved_at-t.created_at))/3600)::numeric,1) AS mttr_hours FROM tickets t JOIN locations l ON l.location_id=t.location_id JOIN users u ON u.user_id=t.assigned_tech_id WHERE ${where} AND t.status IN ('COMPLETED','CLOSED') GROUP BY u.full_name ORDER BY completed DESC`,
  );
  return { summary, faculties, buildings, technicians };
}
export function csvCell(value: unknown) {
  let text = "";
  if (value != null) text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function exportCsv(user: User, params: URLSearchParams) {
  await reports(user, params);
  const conditions = [sql`TRUE`];
  if (params.get("faculty"))
    conditions.push(sql`l.faculty_code=${params.get("faculty")}`);
  if (params.get("from"))
    conditions.push(
      sql`t.created_at>=(${params.get("from")}::date::timestamp AT TIME ZONE 'America/Jamaica')`,
    );
  if (params.get("to"))
    conditions.push(
      sql`t.created_at<((${params.get("to")}::date+1)::timestamp AT TIME ZONE 'America/Jamaica')`,
    );
  const data = await rows(
    sql`${ticketSelect} WHERE ${sql.join(conditions, sql` AND `)} ORDER BY t.created_at DESC LIMIT 10000`,
  );
  const columns = [
    "ticket_id",
    "title",
    "category_name",
    "faculty_code",
    "building_name",
    "room_number",
    "priority",
    "status",
    "technician_name",
    "created_at",
    "sla_deadline",
    "resolved_at",
  ];
  return [
    columns.map(csvCell).join(","),
    ...data.map((row) =>
      columns
        .map((key) =>
          csvCell(
            row[key] instanceof Date
              ? (row[key] as Date).toISOString()
              : row[key],
          ),
        )
        .join(","),
    ),
  ].join("\r\n");
}
````

## src/lib/storage.ts

````ts
import { one, rows } from "@/db";
import { del, get, head, put } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { MAX_PHOTO_BYTES, validatePhotoSize, type User } from "./domain";
import { AppError, assert } from "./errors";

export const isCloudStorage = () => process.env.STORAGE_DRIVER === "vercel";
const storageDir = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.LOCAL_STORAGE_DIR ??
      ".data/uploads",
  );
function localPath(key: string) {
  const resolved = path.resolve(storageDir(), key);
  assert(resolved.startsWith(storageDir() + path.sep), "Invalid storage path.");
  return resolved;
}
export async function validateImage(bytes: Buffer, declaredType: string) {
  validatePhotoSize(bytes.length);
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  const type = png ? "image/png" : jpeg ? "image/jpeg" : null;
  assert(type && type === declaredType, "Choose a valid JPG or PNG photo.");
  try {
    const image = sharp(bytes, {
      limitInputPixels: 25_000_000,
      failOn: "error",
    }).rotate();
    const metadata = await image.metadata();
    assert(
      metadata.width &&
        metadata.height &&
        metadata.width > 0 &&
        metadata.height > 0,
      "This photo cannot be read.",
    );
    // Decode and re-encode. This also removes EXIF location data and trailing payloads.
    const clean = await (
      type === "image/png" ? image.png() : image.jpeg({ quality: 90 })
    ).toBuffer();
    validatePhotoSize(clean.length);
    return { bytes: clean, contentType: type };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "This photo cannot be read. Choose another JPG or PNG photo.",
    );
  }
}
export async function saveLocalPhoto(
  user: User,
  file: File,
  phase: "BEFORE" | "AFTER",
) {
  assert(
    !isCloudStorage(),
    "Use direct photo uploads for the hosted application.",
  );
  validatePhotoSize(file.size);
  const clean = await validateImage(
    Buffer.from(await file.arrayBuffer()),
    file.type,
  );
  const key = `${user.user_id}/${randomUUID()}.${clean.contentType === "image/png" ? "png" : "jpg"}`;
  await mkdir(path.dirname(localPath(key)), { recursive: true });
  await writeFile(localPath(key), clean.bytes, { flag: "wx" });
  try {
    const row = await one(
      sql`INSERT INTO attachments(owner_id,phase,storage_key,original_name,content_type,byte_size,verified) VALUES (${user.user_id}::uuid,${phase},${key},${file.name.slice(0, 200)},${clean.contentType},${clean.bytes.length},TRUE) RETURNING attachment_id`,
    );
    return row;
  } catch (error) {
    await unlink(localPath(key)).catch(() => {});
    throw error;
  }
}
export async function prepareCloudPhoto(
  user: User,
  input: {
    name: string;
    size: number;
    contentType: string;
    phase: "BEFORE" | "AFTER";
  },
) {
  assert(isCloudStorage(), "Cloud storage is not enabled.");
  validatePhotoSize(input.size);
  assert(
    ["image/jpeg", "image/png"].includes(input.contentType),
    "Choose a JPG or PNG photo.",
  );
  const key = `${user.user_id}/${randomUUID()}.${input.contentType === "image/png" ? "png" : "jpg"}`;
  const row = await one(
    sql`INSERT INTO attachments(owner_id,phase,storage_key,original_name,content_type,byte_size) VALUES (${user.user_id}::uuid,${input.phase},${key},${input.name.slice(0, 200)},${input.contentType},${input.size}) RETURNING attachment_id`,
  );
  return { ...row, pathname: key };
}
export async function confirmCloudPhoto(user: User, id: string) {
  const photo = await one<{
    attachment_id: string;
    storage_key: string;
    verified: boolean;
    content_type: string;
  }>(
    sql`SELECT attachment_id,storage_key,verified,content_type FROM attachments WHERE attachment_id=${id}::uuid AND owner_id=${user.user_id}::uuid`,
  );
  assert(photo, "This upload was not found.", 404);
  if (photo.verified) return { attachment_id: photo.attachment_id };
  const metadata = await head(photo.storage_key);
  validatePhotoSize(metadata.size);
  const object = await get(photo.storage_key, {
    access: "private",
    useCache: false,
  });
  assert(
    object && object.statusCode === 200,
    "This upload has not finished.",
    409,
  );
  try {
    const clean = await validateImage(
      Buffer.from(await new Response(object.stream).arrayBuffer()),
      photo.content_type,
    );
    await put(photo.storage_key, clean.bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: clean.contentType,
    });
    await rows(
      sql`UPDATE attachments SET verified=TRUE,byte_size=${clean.bytes.length},content_type=${clean.contentType} WHERE attachment_id=${id}::uuid AND ticket_id IS NULL`,
    );
    return { attachment_id: photo.attachment_id };
  } catch (error) {
    await del(photo.storage_key).catch(() => {});
    await rows(
      sql`DELETE FROM attachments WHERE attachment_id=${id}::uuid AND ticket_id IS NULL`,
    );
    throw error;
  }
}
export async function photoBytes(key: string) {
  if (!isCloudStorage())
    return readFile(/* turbopackIgnore: true */ localPath(key));
  const object = await get(key, { access: "private", useCache: false });
  assert(object && object.statusCode === 200, "This photo was not found.", 404);
  return Buffer.from(await new Response(object.stream).arrayBuffer());
}
export async function cleanOrphanPhotos() {
  const old = await rows<{ attachment_id: string; storage_key: string }>(
    sql`SELECT attachment_id,storage_key FROM attachments WHERE ticket_id IS NULL AND created_at<NOW()-INTERVAL '24 hours' LIMIT 100`,
  );
  for (const item of old) {
    if (isCloudStorage()) await del(item.storage_key);
    else
      await unlink(localPath(item.storage_key)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    await rows(
      sql`DELETE FROM attachments WHERE attachment_id=${item.attachment_id}::uuid AND ticket_id IS NULL`,
    );
  }
  return old.length;
}
export { MAX_PHOTO_BYTES };
````

## src/lib/tickets.ts

````ts
import { database, one, rows, type Executor } from "@/db";
import { sql, type SQL } from "drizzle-orm";
import {
  actionInput,
  ACTIVE_STATUSES,
  canReadTicket,
  isManager,
  isReporter,
  slaDeadline,
  ticketInput,
  type Priority,
  type Ticket,
  type TicketDetail,
  type User,
} from "./domain";
import { AppError, assert } from "./errors";
import { notifyTicket } from "./notifications";
import { completionDecision } from "./policies";

export const ticketSelect = sql`SELECT t.*,c.category_name,l.faculty_code,l.building_name,l.room_number,r.full_name AS reporter_name,u.full_name AS technician_name
 FROM tickets t JOIN categories c ON c.category_id=t.category_id JOIN locations l ON l.location_id=t.location_id JOIN users r ON r.user_id=t.reporter_id LEFT JOIN users u ON u.user_id=t.assigned_tech_id`;
export function accessWhere(user: User): SQL {
  if (isManager(user.role)) return sql`TRUE`;
  if (user.role === "TECHNICIAN")
    return sql`t.assigned_tech_id=${user.user_id}::uuid`;
  return sql`(t.reporter_id=${user.user_id}::uuid OR EXISTS(SELECT 1 FROM ticket_subscribers s WHERE s.ticket_id=t.ticket_id AND s.user_id=${user.user_id}::uuid))`;
}
export async function audit(
  userId: string | null,
  event: string,
  ticketId: string | null,
  details: string,
  tx: Executor = database(),
) {
  await rows(
    sql`INSERT INTO audit_logs(actor_id,event_code,ticket_id,details) VALUES (${userId}::uuid,${event},${ticketId},${details})`,
    tx,
  );
}
export async function listTickets(
  user: User,
  params: URLSearchParams = new URLSearchParams(),
) {
  const conditions: SQL[] = [accessWhere(user)];
  const search = params.get("search")?.trim().slice(0, 150);
  if (search)
    conditions.push(
      sql`(t.ticket_id ILIKE ${`%${search}%`} OR t.title ILIKE ${`%${search}%`} OR l.building_name ILIKE ${`%${search}%`})`,
    );
  if (params.get("status"))
    conditions.push(sql`t.status::text=${params.get("status")}`);
  if (params.get("priority"))
    conditions.push(sql`t.priority::text=${params.get("priority")}`);
  if (params.get("faculty"))
    conditions.push(sql`l.faculty_code=${params.get("faculty")}`);
  if (params.get("category"))
    conditions.push(sql`t.category_id::text=${params.get("category")}`);
  if (params.get("technician"))
    conditions.push(sql`t.assigned_tech_id::text=${params.get("technician")}`);
  if (params.get("from") && /^\d{4}-\d{2}-\d{2}$/.test(params.get("from")!))
    conditions.push(sql`t.created_at>=${params.get("from")}::date`);
  if (params.get("to") && /^\d{4}-\d{2}-\d{2}$/.test(params.get("to")!))
    conditions.push(
      sql`t.created_at<${params.get("to")}::date+INTERVAL '1 day'`,
    );
  if (params.get("overdue") === "true")
    conditions.push(
      sql`t.sla_deadline<NOW() AND t.status IN ('PENDING','ASSIGNED','IN_PROGRESS')`,
    );
  const where = sql.join(conditions, sql` AND `);
  const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
  const pageSize = 25;
  const tickets = await rows<Ticket>(
    sql`${ticketSelect} WHERE ${where} ORDER BY CASE t.priority WHEN 'P1_CRITICAL' THEN 1 WHEN 'P2_URGENT' THEN 2 ELSE 3 END,t.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  );
  const count = await one<{ total: number }>(
    sql`SELECT COUNT(*)::int AS total FROM tickets t JOIN locations l ON l.location_id=t.location_id WHERE ${where}`,
  );
  return { tickets, total: count?.total ?? 0, page, pageSize };
}
export async function ticketDetail(
  user: User,
  ticketId: string,
): Promise<TicketDetail> {
  const ticket = await one<Ticket>(
    sql`${ticketSelect} WHERE t.ticket_id=${ticketId}`,
  );
  assert(ticket, "This ticket was not found.", 404);
  const subscription = await one(
    sql`SELECT 1 FROM ticket_subscribers WHERE ticket_id=${ticketId} AND user_id=${user.user_id}::uuid`,
  );
  assert(
    canReadTicket(user, ticket, !!subscription),
    "You cannot view this ticket.",
    403,
  );
  const [comments, activity, logs, attachments] = await Promise.all([
    rows<TicketDetail["comments"][number]>(
      sql`SELECT c.comment_id,c.body,c.created_at,u.full_name FROM ticket_comments c JOIN users u ON u.user_id=c.author_id WHERE c.ticket_id=${ticketId} ORDER BY c.created_at`,
    ),
    rows<TicketDetail["activity"][number]>(
      sql`SELECT a.audit_id,a.event_code,a.details,a.created_at,u.full_name FROM audit_logs a LEFT JOIN users u ON u.user_id=a.actor_id WHERE a.ticket_id=${ticketId} ORDER BY a.created_at DESC`,
    ),
    rows<TicketDetail["logs"][number]>(
      sql`SELECT w.*,u.full_name FROM work_order_logs w JOIN users u ON u.user_id=w.tech_id WHERE w.ticket_id=${ticketId} ORDER BY w.logged_at DESC`,
    ),
    rows<TicketDetail["attachments"][number]>(
      sql`SELECT attachment_id,phase,original_name,content_type,byte_size FROM attachments WHERE ticket_id=${ticketId} AND verified ORDER BY phase DESC,created_at`,
    ),
  ]);
  return {
    ticket: { ...ticket, is_following: !!subscription },
    comments,
    activity,
    logs,
    attachments,
  };
}
export async function duplicateSuggestions(
  user: User,
  categoryId: string,
  locationId: string,
) {
  assert(
    isReporter(user.role) || isManager(user.role),
    "You cannot search for duplicate reports.",
    403,
  );
  // Return limited details until the reporter chooses to follow a matching report.
  return rows(
    sql`SELECT ticket_id,title,status,created_at FROM tickets WHERE category_id::text=${categoryId} AND location_id::text=${locationId} AND status IN ('PENDING','ASSIGNED','IN_PROGRESS') AND created_at>=NOW()-INTERVAL '12 hours' ORDER BY created_at DESC LIMIT 5`,
  );
}
export async function claimAttachment(
  id: string,
  user: User,
  ticketId: string,
  phase: "BEFORE" | "AFTER",
  tx: Executor,
) {
  const attachment = await one<{ storage_key: string }>(
    sql`UPDATE attachments SET ticket_id=${ticketId} WHERE attachment_id=${id}::uuid AND owner_id=${user.user_id}::uuid AND phase=${phase} AND verified AND ticket_id IS NULL RETURNING storage_key`,
    tx,
  );
  assert(
    attachment,
    "The photo is missing, was not checked, or is already attached.",
    409,
  );
  return attachment.storage_key;
}
export async function createTicket(user: User, input: unknown) {
  assert(
    isReporter(user.role),
    "Only students and staff can submit reports.",
    403,
  );
  const data = ticketInput.parse(input);
  return database().transaction(async (tx) => {
    // Lock a submission key before checking it. This also covers simultaneous offline retries.
    await rows(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${data.submissionKey},0))`,
      tx,
    );
    const existing = await one<{ ticket_id: string; reporter_id: string }>(
      sql`SELECT ticket_id,reporter_id FROM tickets WHERE submission_key=${data.submissionKey}::uuid`,
      tx,
    );
    if (existing) {
      assert(
        existing.reporter_id === user.user_id,
        "This submission key is already in use.",
        409,
      );
      return { ticketId: existing.ticket_id, replayed: true };
    }
    const category = await one<{ default_priority: Priority }>(
      sql`SELECT default_priority FROM categories WHERE category_id=${data.categoryId}::uuid AND is_active`,
      tx,
    );
    const location = await one(
      sql`SELECT 1 FROM locations WHERE location_id=${data.locationId}::uuid AND is_active`,
      tx,
    );
    assert(
      category && location,
      "Select an active category and campus location.",
    );
    const generated = await one<{ ticket_id: string; now: Date }>(
      sql`SELECT 'CF-'||TO_CHAR(NOW() AT TIME ZONE 'America/Jamaica','YYYY')||'-'||nextval('ticket_number_seq')::text AS ticket_id,NOW() AS now`,
      tx,
    );
    const id = generated!.ticket_id;
    await rows(
      sql`INSERT INTO tickets(ticket_id,reporter_id,category_id,location_id,title,description,priority,reporter_urgency,submission_key,created_at,sla_deadline)
      VALUES (${id},${user.user_id}::uuid,${data.categoryId}::uuid,${data.locationId}::uuid,${data.title},${data.description},${category.default_priority},${data.urgency},${data.submissionKey}::uuid,${generated!.now},${slaDeadline(generated!.now, category.default_priority)})`,
      tx,
    );
    if (data.attachmentId) {
      const key = await claimAttachment(
        data.attachmentId,
        user,
        id,
        "BEFORE",
        tx,
      );
      await rows(
        sql`UPDATE tickets SET before_photo_uri=${key} WHERE ticket_id=${id}`,
        tx,
      );
    }
    await audit(
      user.user_id,
      "TICKET_CREATED",
      id,
      "Report received. Awaiting facilities review.",
      tx,
    );
    await notifyTicket(
      id,
      "TICKET_CREATED",
      "Your report is recorded",
      `${id}: ${data.title}`,
      tx,
    );
    return { ticketId: id, replayed: false };
  });
}
async function recountWorkload(techId: string | null, tx: Executor) {
  if (techId) {
    await rows(
      sql`SELECT tech_id FROM technicians WHERE tech_id=${techId}::uuid FOR UPDATE`,
      tx,
    );
    await rows(
      sql`UPDATE technicians SET active_workload=(SELECT COUNT(*)::int FROM tickets WHERE assigned_tech_id=${techId}::uuid AND status IN ('ASSIGNED','IN_PROGRESS')) WHERE tech_id=${techId}::uuid`,
      tx,
    );
  }
}
export async function ticketAction(
  user: User,
  ticketId: string,
  input: unknown,
) {
  const data = actionInput.parse(input);
  return database().transaction(async (tx) => {
    if (data.action === "merge")
      await rows(sql`SELECT pg_advisory_xact_lock(8024002)`, tx);
    // Serialize all changes to one ticket and verify the version shown to the user.
    const ticket = await one<Ticket>(
      sql`SELECT * FROM tickets WHERE ticket_id=${ticketId} FOR UPDATE`,
      tx,
    );
    assert(ticket, "This ticket was not found.", 404);
    const follows = await one(
      sql`SELECT 1 FROM ticket_subscribers WHERE ticket_id=${ticketId} AND user_id=${user.user_id}::uuid`,
      tx,
    );
    if (data.action === "follow") {
      assert(isReporter(user.role), "Only reporters can follow a report.", 403);
      assert(
        ACTIVE_STATUSES.includes(ticket.status) &&
          new Date(ticket.created_at).getTime() >= Date.now() - 12 * 3600000,
        "This report is no longer available to follow.",
        409,
      );
      await rows(
        sql`INSERT INTO ticket_subscribers(ticket_id,user_id) VALUES (${ticketId},${user.user_id}::uuid) ON CONFLICT DO NOTHING`,
        tx,
      );
      await audit(
        user.user_id,
        "TICKET_FOLLOWED",
        ticketId,
        "Reporter chose to follow this active report.",
        tx,
      );
      return { ticketId };
    }
    assert(
      canReadTicket(user, ticket, !!follows),
      "You cannot change this ticket.",
      403,
    );
    if (data.action === "comment") {
      assert(
        !["CLOSED", "DUPLICATE", "REJECTED"].includes(ticket.status),
        "Comments are closed for this ticket.",
        409,
      );
      await rows(
        sql`INSERT INTO ticket_comments(ticket_id,author_id,body) VALUES (${ticketId},${user.user_id}::uuid,${data.body})`,
        tx,
      );
      await audit(
        user.user_id,
        "COMMENT_ADDED",
        ticketId,
        "A comment was added.",
        tx,
      );
      await notifyTicket(
        ticketId,
        "COMMENT_ADDED",
        "New ticket comment",
        `${user.full_name}: ${data.body}`,
        tx,
        ticket.assigned_tech_id ?? undefined,
      );
      return { ticketId };
    }
    assert(
      data.version === ticket.version,
      "This ticket has changed. Refresh it and try again.",
      409,
    );
    let message = "";
    let event = "TICKET_UPDATED";
    switch (data.action) {
      case "assign": {
        assert(
          isManager(user.role),
          "Only facilities staff can assign jobs.",
          403,
        );
        assert(
          ACTIVE_STATUSES.includes(ticket.status),
          "This ticket cannot be assigned in its current state.",
          409,
        );
        const category = await one<{ trade_specialty: string }>(
          sql`SELECT trade_specialty FROM categories WHERE category_id=${ticket.category_id}::uuid`,
          tx,
        );
        // One lock per trade prevents two concurrent dispatches choosing from stale workloads.
        await rows(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${category!.trade_specialty},1))`,
          tx,
        );
        let tech: { tech_id: string; full_name: string } | undefined;
        if (data.technicianId === "auto") {
          tech = await one(
            sql`SELECT p.tech_id,u.full_name FROM technicians p JOIN users u ON u.user_id=p.tech_id WHERE p.trade_specialty=${category!.trade_specialty} AND p.is_available AND u.is_active ORDER BY (SELECT COUNT(*) FROM tickets w WHERE w.assigned_tech_id=p.tech_id AND w.status IN ('ASSIGNED','IN_PROGRESS')),p.tech_id LIMIT 1 FOR UPDATE OF p`,
            tx,
          );
        } else {
          tech = await one(
            sql`SELECT p.tech_id,u.full_name FROM technicians p JOIN users u ON u.user_id=p.tech_id WHERE p.tech_id=${data.technicianId}::uuid AND p.trade_specialty=${category!.trade_specialty} AND p.is_available AND u.is_active FOR UPDATE OF p`,
            tx,
          );
          assert(
            tech,
            "Select an available technician with the correct trade.",
          );
        }
        const deadline = slaDeadline(ticket.created_at, data.priority);
        await rows(
          sql`UPDATE tickets SET priority=${data.priority},assigned_tech_id=${tech?.tech_id ?? null}::uuid,status=${tech ? "ASSIGNED" : "PENDING"},assigned_at=${tech ? new Date() : null},sla_deadline=${deadline},version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        await recountWorkload(ticket.assigned_tech_id, tx);
        await recountWorkload(tech?.tech_id ?? null, tx);
        event = tech ? "TICKET_ASSIGNED" : "TICKET_UNASSIGNED";
        message = tech
          ? `Assigned to ${tech.full_name}. The deadline is based on the original report time.`
          : "No qualified technician is available. The report remains pending.";
        await notifyTicket(
          ticketId,
          event,
          tech ? "A technician is assigned" : "Facilities review recorded",
          message,
          tx,
          tech?.tech_id,
        );
        break;
      }
      case "start":
        assert(
          user.role === "TECHNICIAN" &&
            ticket.assigned_tech_id === user.user_id,
          "Only the assigned technician can start this job.",
          403,
        );
        assert(
          ticket.status === "ASSIGNED",
          "This job must be assigned before work starts.",
          409,
        );
        await rows(
          sql`UPDATE tickets SET status='IN_PROGRESS',version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        event = "WORK_STARTED";
        message = "The technician started work on this repair.";
        await notifyTicket(ticketId, event, "Work has started", message, tx);
        break;
      case "log":
        assert(
          user.role === "TECHNICIAN" &&
            ticket.assigned_tech_id === user.user_id,
          "Only the assigned technician can record work.",
          403,
        );
        assert(
          ticket.status === "IN_PROGRESS",
          "Start this job before recording work.",
          409,
        );
        await rows(
          sql`INSERT INTO work_order_logs(ticket_id,tech_id,action_description,parts_consumed,labor_minutes) VALUES (${ticketId},${user.user_id}::uuid,${data.notes},${data.parts},${data.laborMinutes})`,
          tx,
        );
        await rows(
          sql`UPDATE tickets SET version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        event = "WORK_LOGGED";
        message = `Work recorded: ${data.notes}`;
        break;
      case "complete": {
        assert(
          user.role === "TECHNICIAN",
          "Only the assigned technician can complete this job.",
          403,
        );
        const proof = await one(
          sql`SELECT attachment_id FROM attachments WHERE attachment_id=${data.attachmentId}::uuid AND owner_id=${user.user_id}::uuid AND phase='AFTER' AND verified AND ticket_id IS NULL`,
          tx,
        );
        const decision = completionDecision(
          ticket.assigned_tech_id,
          user.user_id,
          ticket.status,
          !!proof,
        );
        assert(
          decision !== "FORBIDDEN",
          "Only the assigned technician can complete this job.",
          403,
        );
        assert(
          decision !== "NOT_STARTED",
          "Start this job before marking it complete.",
          409,
        );
        assert(
          decision !== "MISSING_PROOF",
          "The photo is missing, was not checked, or is already attached.",
          409,
        );
        const key = await claimAttachment(
          data.attachmentId,
          user,
          ticketId,
          "AFTER",
          tx,
        );
        await rows(
          sql`UPDATE tickets SET status='COMPLETED',resolution_notes=${data.notes},after_photo_uri=${key},resolved_at=NOW(),version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        await recountWorkload(ticket.assigned_tech_id, tx);
        await rows(
          sql`INSERT INTO background_jobs(kind,ticket_id,ticket_version,available_at) VALUES ('AUTO_CLOSE',${ticketId},${ticket.version + 1},NOW()+INTERVAL '72 hours')`,
          tx,
        );
        event = "WORK_COMPLETED";
        message =
          "Repair complete. The reporter can confirm the repair or report a problem.";
        await notifyTicket(
          ticketId,
          event,
          "Please check your repair",
          message,
          tx,
        );
        break;
      }
      case "close":
        assert(
          user.user_id === ticket.reporter_id || isManager(user.role),
          "Only the reporter or facilities staff can close this ticket.",
          403,
        );
        assert(
          ticket.status === "COMPLETED",
          "The repair must be complete before closure.",
          409,
        );
        await rows(
          sql`UPDATE tickets SET status='CLOSED',closed_at=NOW(),version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        event = "TICKET_CLOSED";
        message = "The repair was confirmed and the ticket was closed.";
        await notifyTicket(ticketId, event, "Ticket closed", message, tx);
        break;
      case "dispute":
        assert(
          user.user_id === ticket.reporter_id,
          "Only the original reporter can dispute this repair.",
          403,
        );
        assert(
          ticket.status === "COMPLETED" && ticket.assigned_tech_id,
          "Only a completed repair can be disputed.",
          409,
        );
        await rows(
          sql`UPDATE tickets SET status='IN_PROGRESS',resolved_at=NULL,closed_at=NULL,version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        await recountWorkload(ticket.assigned_tech_id, tx);
        event = "REPAIR_DISPUTED";
        message = `Repair reopened: ${data.reason}`;
        await rows(
          sql`INSERT INTO ticket_comments(ticket_id,author_id,body) VALUES (${ticketId},${user.user_id}::uuid,${message})`,
          tx,
        );
        await notifyTicket(
          ticketId,
          event,
          "Repair needs another check",
          message,
          tx,
          ticket.assigned_tech_id,
        );
        break;
      case "reject":
        assert(
          isManager(user.role),
          "Only facilities staff can reject a report.",
          403,
        );
        assert(
          ACTIVE_STATUSES.includes(ticket.status),
          "This report is already finished.",
          409,
        );
        await rows(
          sql`UPDATE tickets SET status='REJECTED',version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        await recountWorkload(ticket.assigned_tech_id, tx);
        event = "TICKET_REJECTED";
        message = `Report rejected: ${data.reason}`;
        await notifyTicket(ticketId, event, "Report reviewed", message, tx);
        break;
      case "merge": {
        assert(
          isManager(user.role),
          "Only facilities staff can merge reports.",
          403,
        );
        assert(
          data.masterId !== ticketId,
          "A report cannot be merged into itself.",
        );
        assert(
          ACTIVE_STATUSES.includes(ticket.status),
          "Only active reports can be merged.",
          409,
        );
        const master = await one<Ticket>(
          sql`SELECT * FROM tickets WHERE ticket_id=${data.masterId} FOR UPDATE`,
          tx,
        );
        assert(
          master &&
            ACTIVE_STATUSES.includes(master.status) &&
            !master.duplicate_of,
          "Select an active main report.",
        );
        assert(
          master.category_id === ticket.category_id &&
            master.location_id === ticket.location_id,
          "Merged reports must have the same location and category.",
        );
        await rows(
          sql`INSERT INTO ticket_subscribers(ticket_id,user_id) SELECT ${master.ticket_id},reporter_id FROM tickets WHERE ticket_id=${ticketId} UNION SELECT ${master.ticket_id},user_id FROM ticket_subscribers WHERE ticket_id=${ticketId} ON CONFLICT DO NOTHING`,
          tx,
        );
        await rows(
          sql`UPDATE tickets SET status='DUPLICATE',duplicate_of=${master.ticket_id},version=version+1 WHERE ticket_id=${ticketId}`,
          tx,
        );
        await recountWorkload(ticket.assigned_tech_id, tx);
        event = "TICKET_MERGED";
        message = `Linked to ${master.ticket_id}: ${data.reason}`;
        await audit(
          user.user_id,
          event,
          master.ticket_id,
          `${ticketId} was linked to this report. ${data.reason}`,
          tx,
        );
        await notifyTicket(
          master.ticket_id,
          event,
          "Reports linked",
          message,
          tx,
        );
        break;
      }
      default:
        throw new AppError("This action is not supported.");
    }
    await audit(user.user_id, event, ticketId, message, tx);
    return { ticketId, message };
  });
}
export async function autoCloseTicket(
  ticketId: string,
  expectedVersion: number,
) {
  return database().transaction(async (tx) => {
    const ticket = await one<Ticket>(
      sql`SELECT * FROM tickets WHERE ticket_id=${ticketId} FOR UPDATE`,
      tx,
    );
    if (
      !ticket ||
      ticket.status !== "COMPLETED" ||
      ticket.version !== expectedVersion ||
      !ticket.resolved_at ||
      new Date(ticket.resolved_at).getTime() > Date.now() - 72 * 3600000
    )
      return false;
    await rows(
      sql`UPDATE tickets SET status='CLOSED',closed_at=NOW(),version=version+1 WHERE ticket_id=${ticketId}`,
      tx,
    );
    await audit(
      null,
      "TICKET_AUTO_CLOSED",
      ticketId,
      "No dispute was received within 72 hours of completion.",
      tx,
    );
    await notifyTicket(
      ticketId,
      "TICKET_CLOSED",
      "Ticket closed",
      "The repair was completed more than 72 hours ago. No dispute was received.",
      tx,
    );
    return true;
  });
}
````

## src/workflows/maintenance.ts

````ts
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
````

## tests/browser/application.spec.ts

````ts
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
````

## tests/domain.test.ts

````ts
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  canReadTicket,
  MAX_PHOTO_BYTES,
  slaDeadline,
  ticketInput,
  validatePhotoSize,
  type User,
} from "../src/lib/domain";
import { csvCell } from "../src/lib/reports";
import { validateImage } from "../src/lib/storage";

const valid = {
  categoryId: randomUUID(),
  locationId: randomUUID(),
  title: "Leaking classroom tap",
  description: "Water is leaking onto the classroom floor.",
  urgency: "MEDIUM",
  submissionKey: randomUUID(),
};
describe("Black-box input partitions and boundaries", () => {
  for (const [length, accepted] of [
    [14, false],
    [15, true],
    [16, true],
    [499, true],
    [500, true],
    [501, false],
  ] as const)
    it(`description length ${length} is ${accepted ? "accepted" : "rejected"}`, () => {
      expect(
        ticketInput.safeParse({ ...valid, description: "x".repeat(length) })
          .success,
      ).toBe(accepted);
    });
  for (const [length, accepted] of [
    [0, false],
    [1, true],
    [150, true],
    [151, false],
  ] as const)
    it(`title length ${length}`, () => {
      expect(
        ticketInput.safeParse({ ...valid, title: "x".repeat(length) }).success,
      ).toBe(accepted);
    });
  for (const [size, accepted] of [
    [0, false],
    [1, true],
    [4499999, true],
    [4500000, true],
    [4500001, false],
    [-1, false],
    [1.5, false],
  ] as const)
    it(`photo size ${size} bytes`, () => {
      if (accepted) expect(() => validatePhotoSize(size)).not.toThrow();
      else expect(() => validatePhotoSize(size)).toThrow();
    });
  it("rejects an unknown category ID and urgency", () => {
    expect(
      ticketInput.safeParse({
        ...valid,
        categoryId: "electrical",
        urgency: "EXTREME",
      }).success,
    ).toBe(false);
  });
  it("does not accept an empty or whitespace-only description", () => {
    expect(
      ticketInput.safeParse({ ...valid, description: " ".repeat(20) }).success,
    ).toBe(false);
  });
  it("rejects a one-byte file even though its size alone is allowed", async () => {
    await expect(validateImage(Buffer.from([1]), "image/png")).rejects.toThrow(
      "valid JPG or PNG",
    );
  });
  it("decodes and accepts a real PNG", async () => {
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#557b60" },
    })
      .png()
      .toBuffer();
    expect((await validateImage(image, "image/png")).contentType).toBe(
      "image/png",
    );
  });
  it("rejects a MIME type that does not match the file signature", async () => {
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#557b60" },
    })
      .png()
      .toBuffer();
    await expect(validateImage(image, "image/jpeg")).rejects.toThrow(
      "valid JPG or PNG",
    );
  });
  it("rejects a corrupt PNG with a copied signature", async () => {
    await expect(
      validateImage(
        Buffer.concat([
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
          Buffer.from("not image data"),
        ]),
        "image/png",
      ),
    ).rejects.toThrow("cannot be read");
  });
  it("accepts an exact 4,500,000-byte image input and removes trailing payloads", async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const padded = Buffer.alloc(MAX_PHOTO_BYTES);
    png.copy(padded);
    const clean = await validateImage(padded, "image/png");
    expect(clean.bytes.length).toBeLessThan(1000);
  });
});
describe("Deadlines and data access", () => {
  for (const [priority, hours] of [
    ["P1_CRITICAL", 4],
    ["P2_URGENT", 24],
    ["P3_ROUTINE", 72],
  ] as const)
    it(`${priority} uses ${hours} hours from the original submission`, () => {
      const start = new Date("2026-10-30T10:00:00Z");
      expect(slaDeadline(start, priority).getTime() - start.getTime()).toBe(
        hours * 3600000,
      );
    });
  const user = { user_id: "reporter", role: "STUDENT" } as User;
  const ticket = { reporter_id: "reporter", assigned_tech_id: "tech" };
  it("allows the original reporter", () =>
    expect(canReadTicket(user, ticket, false)).toBe(true));
  it("allows a subscriber", () =>
    expect(canReadTicket({ ...user, user_id: "follower" }, ticket, true)).toBe(
      true,
    ));
  it("blocks an unrelated reporter", () =>
    expect(canReadTicket({ ...user, user_id: "stranger" }, ticket, false)).toBe(
      false,
    ));
  it("allows the assigned technician", () =>
    expect(
      canReadTicket(
        { ...user, user_id: "tech", role: "TECHNICIAN" },
        ticket,
        false,
      ),
    ).toBe(true));
  it("blocks a different technician even if subscribed", () =>
    expect(
      canReadTicket(
        { ...user, user_id: "wrong", role: "TECHNICIAN" },
        ticket,
        true,
      ),
    ).toBe(false));
  for (const role of ["FMD_ADMIN", "FMD_DISPATCHER"] as const)
    it(`allows ${role}`, () =>
      expect(
        canReadTicket({ ...user, user_id: "manager", role }, ticket, false),
      ).toBe(true));
});
describe("CSV export safety", () => {
  it("escapes commas and quotes", () =>
    expect(csvCell('A, "B"')).toBe('"A, ""B"""'));
  it("prevents spreadsheet formula execution", () =>
    expect(csvCell("=HYPERLINK(1)")).toBe('"\'=HYPERLINK(1)"'));
  it("handles missing values", () => expect(csvCell(null)).toBe('""'));
});
````

## tests/integration.test.ts

````ts
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate";
import { seed } from "../scripts/seed";
import { closeDatabase, one, rows } from "../src/db";
import { getUser, login, logout } from "../src/lib/auth";
import type { User } from "../src/lib/domain";
import { processTestDeliveries } from "../src/lib/notifications";
import { createUser, updateReference, updateUser } from "../src/lib/reference";
import { exportCsv, reports } from "../src/lib/reports";
import { photoBytes, saveLocalPhoto } from "../src/lib/storage";
import {
  autoCloseTicket,
  createTicket,
  duplicateSuggestions,
  listTickets,
  ticketAction,
  ticketDetail,
} from "../src/lib/tickets";

config({ path: ".env.local", quiet: true });
let student: User,
  staff: User,
  admin: User,
  dispatcher: User,
  tech: User,
  plumber: User;
let categoryId: string, locationId: string;
let image: Buffer;
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== "/campusfix_test")
    throw new Error(
      "Integration tests require the separate campusfix_test database.",
    );
  await closeDatabase();
  process.env.DATABASE_URL = url;
  process.env.STORAGE_DRIVER = "local";
  process.env.LOCAL_STORAGE_DIR = ".data/test-uploads";
  await migrate(url);
  // The guarded test database is disposable. Reset it so reruns have the same inputs.
  await rows(sql`TRUNCATE TABLE users,locations,categories CASCADE`);
  await rows(sql`ALTER SEQUENCE ticket_number_seq RESTART WITH 1001`);
  await seed();
  const users = await rows<User>(sql`SELECT * FROM users`);
  student = users.find((u) => u.role === "STUDENT")!;
  staff = users.find((u) => u.role === "STAFF")!;
  admin = users.find((u) => u.role === "FMD_ADMIN")!;
  dispatcher = users.find((u) => u.role === "FMD_DISPATCHER")!;
  tech = users.find((u) => u.email === "technician@utech.edu.jm")!;
  plumber = users.find((u) => u.email === "plumber@utech.edu.jm")!;
  categoryId = (await one<{ category_id: string }>(
    sql`SELECT category_id FROM categories WHERE category_name='Electrical'`,
  ))!.category_id;
  locationId = (await one<{ location_id: string }>(
    sql`SELECT location_id FROM locations WHERE room_number='Computer Lab 3'`,
  ))!.location_id;
  image = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "#4d7856" },
  })
    .png()
    .toBuffer();
});
afterAll(closeDatabase);
async function report(
  owner = student,
  overrides: Record<string, unknown> = {},
) {
  return createTicket(owner, {
    categoryId,
    locationId,
    title: "Integration test report",
    description: "A classroom light needs a careful inspection.",
    urgency: "MEDIUM",
    submissionKey: randomUUID(),
    ...overrides,
  });
}
async function current(id: string) {
  return (await ticketDetail(admin, id)).ticket;
}
async function assign(
  id: string,
  priority = "P2_URGENT",
  technicianId = tech.user_id,
) {
  const t = await current(id);
  await ticketAction(dispatcher, id, {
    action: "assign",
    version: t.version,
    priority,
    technicianId,
  });
  return current(id);
}
describe("Authentication and account access", () => {
  it("signs in by institutional ID and revokes the session on logout", async () => {
    const token = await login({
      identifier: student.institutional_id,
      password: "CampusFix2026!",
    });
    expect((await getUser(token))?.user_id).toBe(student.user_id);
    await logout(token);
    expect(await getUser(token)).toBeNull();
  });
  it("uses a generic error for an unknown account", async () => {
    await expect(
      login({
        identifier: "missing@utech.edu.jm",
        password: "NotThePassword!",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("locks after five failed attempts and permits sign-in after expiry", async () => {
    const suffix = randomUUID().slice(0, 8);
    const made = await createUser(admin, {
      fullName: "Lock Test",
      institutionalId: `LOCK${suffix}`,
      email: `lock${suffix}@utech.edu.jm`,
      role: "STAFF",
      password: "ValidPassword2026!",
    });
    for (let i = 1; i <= 5; i++)
      await expect(
        login({ identifier: `LOCK${suffix}`, password: "WrongPassword!" }),
      ).rejects.toMatchObject({ status: i === 5 ? 429 : 401 });
    await expect(
      login({ identifier: `LOCK${suffix}`, password: "ValidPassword2026!" }),
    ).rejects.toMatchObject({ status: 429 });
    await rows(
      sql`UPDATE users SET locked_until=NOW()-INTERVAL '1 minute' WHERE user_id=${made!.user_id}::uuid`,
    );
    const token = await login({
      identifier: `LOCK${suffix}`,
      password: "ValidPassword2026!",
    });
    expect((await getUser(token))?.full_name).toBe("Lock Test");
  });
  it("prevents a reporter from creating admin accounts", async () => {
    await expect(createUser(student, {})).rejects.toMatchObject({
      status: 403,
    });
  });
});
describe("Ticket data and integration boundaries", () => {
  it("stores a real report and its audit record", async () => {
    const { ticketId } = await report();
    const detail = await ticketDetail(student, ticketId);
    expect(detail.ticket.status).toBe("PENDING");
    expect(detail.activity.some((a) => a.event_code === "TICKET_CREATED")).toBe(
      true,
    );
  });
  it("keeps the full ticket number after the sequence passes 9999", async () => {
    await rows(
      sql`SELECT setval('ticket_number_seq',GREATEST((SELECT last_value FROM ticket_number_seq),10000))`,
    );
    const { ticketId } = await report();
    expect(Number(ticketId.split("-")[2])).toBeGreaterThan(10000);
    expect((await current(ticketId)).ticket_id).toBe(ticketId);
  });
  it("keeps offline retries idempotent, including simultaneous submissions", async () => {
    const key = randomUUID();
    const result = await Promise.all([
      report(student, { submissionKey: key }),
      report(student, { submissionKey: key }),
    ]);
    expect(result[0].ticketId).toBe(result[1].ticketId);
    expect(result.filter((r) => r.replayed)).toHaveLength(1);
  });
  it("does not disclose another user's idempotency result", async () => {
    const key = randomUUID();
    await report(student, { submissionKey: key });
    await expect(report(staff, { submissionKey: key })).rejects.toMatchObject({
      status: 409,
    });
  });
  it("blocks unrelated reporters and unassigned technicians", async () => {
    const { ticketId } = await report();
    await expect(ticketDetail(staff, ticketId)).rejects.toMatchObject({
      status: 403,
    });
    await expect(ticketDetail(tech, ticketId)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("limits reporter list queries to owned or followed reports", async () => {
    const { ticketId } = await report(staff);
    expect(
      (await listTickets(student, new URLSearchParams({ search: ticketId })))
        .tickets,
    ).toHaveLength(0);
  });
  it("finds recent duplicates and follows only after an explicit action", async () => {
    const { ticketId } = await report();
    const matches = await duplicateSuggestions(staff, categoryId, locationId);
    expect(matches.some((t) => t.ticket_id === ticketId)).toBe(true);
    await ticketAction(staff, ticketId, { action: "follow" });
    expect((await ticketDetail(staff, ticketId)).ticket.is_following).toBe(
      true,
    );
  });
  it("rejects inactive reference data", async () => {
    const id = randomUUID();
    await rows(
      sql`INSERT INTO locations(location_id,faculty_code,building_name,room_number,is_active) VALUES (${id}::uuid,'FENC','Test block',${id.slice(0, 8)},FALSE)`,
    );
    await expect(report(student, { locationId: id })).rejects.toThrow(
      "active category",
    );
  });
  it("rolls back the report if the photo is not owned or verified", async () => {
    const key = randomUUID();
    await expect(
      report(student, { submissionKey: key, attachmentId: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await one(sql`SELECT 1 FROM tickets WHERE submission_key=${key}::uuid`),
    ).toBeUndefined();
  });
  it("keeps photos private and links a validated image to the report", async () => {
    const file = new File([new Uint8Array(image)], "before.png", {
      type: "image/png",
    });
    const saved = await saveLocalPhoto(student, file, "BEFORE");
    const { ticketId } = await report(student, {
      attachmentId: saved!.attachment_id,
    });
    const detail = await ticketDetail(student, ticketId);
    expect(detail.attachments).toHaveLength(1);
    const row = await one<{ storage_key: string }>(
      sql`SELECT storage_key FROM attachments WHERE attachment_id=${saved!.attachment_id}::uuid`,
    );
    expect((await photoBytes(row!.storage_key)).length).toBeGreaterThan(20);
  });
});
describe("Dispatch and repair lifecycle", () => {
  for (const priority of ["P1_CRITICAL", "P2_URGENT", "P3_ROUTINE"])
    it(`dispatches with ${priority} and retains the original time`, async () => {
      const { ticketId } = await report();
      const before = await current(ticketId);
      await assign(ticketId, priority);
      const after = await current(ticketId);
      expect(new Date(after.created_at).getTime()).toBe(
        new Date(before.created_at).getTime(),
      );
      expect(
        new Date(after.sla_deadline).getTime() -
          new Date(after.created_at).getTime(),
      ).toBe(
        (priority === "P1_CRITICAL" ? 4 : priority === "P2_URGENT" ? 24 : 72) *
          3600000,
      );
    });
  it("rejects a technician with the wrong trade", async () => {
    const { ticketId } = await report();
    await expect(
      assign(ticketId, "P2_URGENT", plumber.user_id),
    ).rejects.toThrow("correct trade");
    expect((await current(ticketId)).status).toBe("PENDING");
  });
  it("keeps the report pending when no qualified technician is available", async () => {
    const c = await one<{ category_id: string }>(
      sql`SELECT category_id FROM categories WHERE trade_specialty='MASONRY_STRUCTURAL'`,
    );
    const { ticketId } = await report(student, { categoryId: c!.category_id });
    await assign(ticketId, "P1_CRITICAL", "auto");
    const t = await current(ticketId);
    expect(t.status).toBe("PENDING");
    expect(t.assigned_tech_id).toBeNull();
    expect(t.priority).toBe("P1_CRITICAL");
  });
  it("selects the least busy available technician from actual active jobs", async () => {
    const { ticketId } = await report();
    const expected = await one<{ tech_id: string }>(
      sql`SELECT p.tech_id FROM technicians p JOIN users u ON u.user_id=p.tech_id WHERE p.trade_specialty='ELECTRICAL' AND p.is_available AND u.is_active ORDER BY(SELECT COUNT(*) FROM tickets t WHERE t.assigned_tech_id=p.tech_id AND t.status IN('ASSIGNED','IN_PROGRESS')),p.tech_id LIMIT 1`,
    );
    await assign(ticketId, "P3_ROUTINE", "auto");
    expect((await current(ticketId)).assigned_tech_id).toBe(expected!.tech_id);
  });
  it("allows exactly one concurrent update from the same ticket version", async () => {
    const { ticketId } = await report();
    const t = await current(ticketId);
    const input = {
      action: "assign",
      version: t.version,
      priority: "P2_URGENT",
      technicianId: tech.user_id,
    };
    const results = await Promise.allSettled([
      ticketAction(dispatcher, ticketId, input),
      ticketAction(dispatcher, ticketId, input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("blocks a reporter from dispatching their own report", async () => {
    const { ticketId } = await report();
    await expect(
      ticketAction(student, ticketId, {
        action: "assign",
        version: 1,
        priority: "P1_CRITICAL",
        technicianId: "auto",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("completes, disputes, repairs again, and closes a report", async () => {
    const { ticketId } = await report();
    let t = await assign(ticketId);
    await ticketAction(tech, ticketId, { action: "start", version: t.version });
    t = await current(ticketId);
    await ticketAction(tech, ticketId, {
      action: "log",
      version: t.version,
      notes: "Checked fittings and tested the circuit.",
      parts: "One replacement lamp",
      laborMinutes: 25,
    });
    t = await current(ticketId);
    await expect(
      ticketAction(tech, ticketId, {
        action: "complete",
        version: t.version,
        notes: "Replaced lamp and tested it.",
        attachmentId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await current(ticketId)).status).toBe("IN_PROGRESS");
    const proof = await saveLocalPhoto(
      tech,
      new File([new Uint8Array(image)], "after.png", { type: "image/png" }),
      "AFTER",
    );
    await ticketAction(tech, ticketId, {
      action: "complete",
      version: t.version,
      notes: "Replaced lamp and tested it.",
      attachmentId: proof!.attachment_id,
    });
    t = await current(ticketId);
    expect(t.status).toBe("COMPLETED");
    await expect(
      ticketAction(plumber, ticketId, { action: "close", version: t.version }),
    ).rejects.toMatchObject({ status: 403 });
    await ticketAction(student, ticketId, {
      action: "dispute",
      version: t.version,
      reason: "The new light is still flickering.",
    });
    t = await current(ticketId);
    expect(t.status).toBe("IN_PROGRESS");
    const proof2 = await saveLocalPhoto(
      tech,
      new File([new Uint8Array(image)], "after-fixed.png", {
        type: "image/png",
      }),
      "AFTER",
    );
    await ticketAction(tech, ticketId, {
      action: "complete",
      version: t.version,
      notes: "Replaced the fitting and checked stability.",
      attachmentId: proof2!.attachment_id,
    });
    t = await current(ticketId);
    await ticketAction(student, ticketId, {
      action: "close",
      version: t.version,
    });
    expect((await current(ticketId)).status).toBe("CLOSED");
    const mismatch = await rows(
      sql`SELECT p.tech_id FROM technicians p WHERE p.active_workload<>(SELECT COUNT(*) FROM tickets t WHERE t.assigned_tech_id=p.tech_id AND t.status IN('ASSIGNED','IN_PROGRESS'))`,
    );
    expect(mismatch).toHaveLength(0);
  });
  it("merges duplicates and carries the reporter to the main ticket", async () => {
    const main = await report();
    const duplicate = await report(staff);
    await ticketAction(dispatcher, duplicate.ticketId, {
      action: "merge",
      version: 1,
      masterId: main.ticketId,
      reason: "The reports describe the same classroom fault.",
    });
    expect((await current(duplicate.ticketId)).status).toBe("DUPLICATE");
    expect((await ticketDetail(staff, main.ticketId)).ticket.is_following).toBe(
      true,
    );
  });
  it("prevents self-merges and merges between different categories", async () => {
    const a = await report();
    await expect(
      ticketAction(dispatcher, a.ticketId, {
        action: "merge",
        version: 1,
        masterId: a.ticketId,
        reason: "This should not be allowed.",
      }),
    ).rejects.toThrow("itself");
    const c = await one<{ category_id: string }>(
      sql`SELECT category_id FROM categories WHERE category_name='Plumbing'`,
    );
    const b = await report(student, { categoryId: c!.category_id });
    await expect(
      ticketAction(dispatcher, a.ticketId, {
        action: "merge",
        version: 1,
        masterId: b.ticketId,
        reason: "This should not be allowed.",
      }),
    ).rejects.toThrow("same location and category");
  });
  it("does not close an active, missing, or newly completed ticket automatically", async () => {
    const a = await report();
    expect(await autoCloseTicket(a.ticketId, 1)).toBe(false);
    expect(await autoCloseTicket("CF-2026-9999", 1)).toBe(false);
  });
});
describe("Notifications, auditing, and reports", () => {
  it("closes only an undisputed repair older than 72 hours with the matching version", async () => {
    const { ticketId } = await report();
    let t = await assign(ticketId);
    await ticketAction(tech, ticketId, { action: "start", version: t.version });
    t = await current(ticketId);
    const proof = await saveLocalPhoto(
      tech,
      new File([new Uint8Array(image)], "automatic-close.png", {
        type: "image/png",
      }),
      "AFTER",
    );
    await ticketAction(tech, ticketId, {
      action: "complete",
      version: t.version,
      notes: "Replaced the fitting and verified stable operation.",
      attachmentId: proof!.attachment_id,
    });
    t = await current(ticketId);
    expect(await autoCloseTicket(ticketId, t.version)).toBe(false);
    await rows(
      sql`UPDATE tickets SET created_at=NOW()-INTERVAL '80 hours',resolved_at=NOW()-INTERVAL '73 hours',sla_deadline=NOW()-INTERVAL '56 hours' WHERE ticket_id=${ticketId}`,
    );
    expect(await autoCloseTicket(ticketId, t.version + 1)).toBe(false);
    expect(await autoCloseTicket(ticketId, t.version)).toBe(true);
    expect((await current(ticketId)).status).toBe("CLOSED");
    expect(await autoCloseTicket(ticketId, t.version)).toBe(false);
  });
  it("rejects completion before work starts and rejects an unrelated technician", async () => {
    const { ticketId } = await report();
    const t = await assign(ticketId);
    await expect(
      ticketAction(tech, ticketId, {
        action: "complete",
        version: t.version,
        notes: "The repair has been completed.",
        attachmentId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      ticketAction(plumber, ticketId, { action: "start", version: t.version }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("records comments and prevents new comments after rejection", async () => {
    const { ticketId } = await report();
    await ticketAction(student, ticketId, {
      action: "comment",
      body: "The switch is beside the classroom door.",
    });
    expect((await ticketDetail(student, ticketId)).comments).toHaveLength(1);
    await ticketAction(dispatcher, ticketId, {
      action: "reject",
      version: 1,
      reason: "The report is outside this demonstration service.",
    });
    await expect(
      ticketAction(student, ticketId, {
        action: "comment",
        body: "Another message",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("revokes existing sessions when an account is deactivated", async () => {
    const suffix = randomUUID().slice(0, 8);
    const id = `SESSION${suffix}`;
    const made = await createUser(admin, {
      fullName: "Session Test",
      institutionalId: id,
      email: `session${suffix}@utech.edu.jm`,
      role: "STAFF",
      password: "ValidPassword2026!",
    });
    const token = await login({
      identifier: id,
      password: "ValidPassword2026!",
    });
    await updateUser(admin, { userId: made!.user_id, active: false });
    expect(await getUser(token)).toBeNull();
    await expect(
      login({ identifier: id, password: "ValidPassword2026!" }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("creates and updates category and location reference data", async () => {
    const suffix = randomUUID().slice(0, 8);
    await updateReference(admin, {
      kind: "category",
      name: `Test category ${suffix}`,
      trade: "ELECTRICAL",
      priority: "P2_URGENT",
      active: true,
    });
    const c = await one<{ category_id: string }>(
      sql`SELECT category_id FROM categories WHERE category_name=${`Test category ${suffix}`}`,
    );
    expect(c).toBeDefined();
    await updateReference(admin, {
      kind: "category",
      id: c!.category_id,
      name: `Test category ${suffix}`,
      trade: "ELECTRICAL",
      priority: "P3_ROUTINE",
      active: false,
    });
    await updateReference(admin, {
      kind: "location",
      faculty: "FENC",
      building: `Test building ${suffix}`,
      room: "Room 1",
      active: true,
    });
    const l = await one<{ location_id: string }>(
      sql`SELECT location_id FROM locations WHERE building_name=${`Test building ${suffix}`}`,
    );
    expect(l).toBeDefined();
    await updateReference(admin, {
      kind: "location",
      id: l!.location_id,
      faculty: "FENC",
      building: `Test building ${suffix}`,
      room: "Room 1",
      active: false,
    });
  });
  it("records test email and SMS delivery without changing the ticket", async () => {
    const { ticketId } = await report();
    await processTestDeliveries();
    const result = await rows(
      sql`SELECT d.status FROM notification_deliveries d JOIN notifications n ON n.notification_id=d.notification_id WHERE n.ticket_id=${ticketId}`,
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.status === "TEST_RECORDED")).toBe(true);
    expect((await current(ticketId)).status).toBe("PENDING");
  });
  it("keeps a failed notification pending for retry without losing the ticket", async () => {
    const { ticketId } = await report();
    await processTestDeliveries(true);
    const failed = await rows(
      sql`SELECT d.status,d.attempts,d.last_error FROM notification_deliveries d JOIN notifications n ON n.notification_id=d.notification_id WHERE n.ticket_id=${ticketId}`,
    );
    expect(failed.some((r) => r.status === "PENDING" && r.attempts === 1)).toBe(
      true,
    );
    await processTestDeliveries();
    expect((await current(ticketId)).status).toBe("PENDING");
  });
  it("makes audit records append-only", async () => {
    const row = await one<{ audit_id: string }>(
      sql`SELECT audit_id FROM audit_logs LIMIT 1`,
    );
    await expect(
      rows(
        sql`UPDATE audit_logs SET details='changed' WHERE audit_id=${row!.audit_id}::uuid`,
      ),
    ).rejects.toThrow();
  });
  it("blocks reporters from facilities reports", async () => {
    await expect(reports(student)).rejects.toMatchObject({ status: 403 });
  });
  it("calculates reports and exports real data", async () => {
    const result = await reports(admin);
    expect(result.summary?.total).toBeGreaterThan(0);
    const csv = await exportCsv(admin, new URLSearchParams());
    expect(csv).toContain('"ticket_id"');
    expect(csv).toContain("CF-2026-");
  });
  it("uses Jamaica calendar dates for report and CSV filters", async () => {
    const { ticketId } = await report();
    await rows(
      sql`UPDATE tickets SET created_at='2020-01-02T02:00:00Z',sla_deadline='2020-01-05T02:00:00Z' WHERE ticket_id=${ticketId}`,
    );
    const params = new URLSearchParams({
      from: "2020-01-01",
      to: "2020-01-01",
    });
    expect((await reports(admin, params)).summary?.total).toBe(1);
    expect(await exportCsv(admin, params)).toContain(ticketId);
    expect(
      (
        await reports(
          admin,
          new URLSearchParams({ from: "2020-01-02", to: "2020-01-02" }),
        )
      ).summary?.total,
    ).toBe(0);
  });
  it("prevents an administrator from deactivating their own account", async () => {
    await expect(
      updateUser(admin, { userId: admin.user_id, active: false }),
    ).rejects.toThrow("own account");
  });
});
````

## tests/policies.test.ts

````ts
import { describe, it, expect } from "vitest";
import {
  accountAccess,
  completionDecision,
  deliveryChannels,
  priorityHours,
} from "../src/lib/policies";
describe("White-box basis paths through production policy routines", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  it("AUTH P1: inactive account", () =>
    expect(accountAccess(false, null, now)).toBe("INACTIVE"));
  it("AUTH P2: active account without a lock", () =>
    expect(accountAccess(true, null, now)).toBe("OPEN"));
  it("AUTH P3: lock is in the future", () =>
    expect(accountAccess(true, "2026-10-30T12:30:00Z", now)).toBe("LOCKED"));
  it("AUTH P4: lock has expired", () =>
    expect(accountAccess(true, "2026-10-30T11:30:00Z", now)).toBe("OPEN"));
  it("AUTH boundary: exact lock expiry permits access", () =>
    expect(accountAccess(true, new Date(now), now)).toBe("OPEN"));
  it("DISPATCH P1: critical priority", () =>
    expect(priorityHours("P1_CRITICAL")).toBe(4));
  it("DISPATCH P2: urgent priority", () =>
    expect(priorityHours("P2_URGENT")).toBe(24));
  it("DISPATCH P3: routine priority", () =>
    expect(priorityHours("P3_ROUTINE")).toBe(72));
  it("REPAIR P1: another technician", () =>
    expect(completionDecision("tech-a", "tech-b", "IN_PROGRESS", true)).toBe(
      "FORBIDDEN",
    ));
  it("REPAIR P2: work has not started", () =>
    expect(completionDecision("tech-a", "tech-a", "ASSIGNED", true)).toBe(
      "NOT_STARTED",
    ));
  it("REPAIR P3: proof is missing", () =>
    expect(completionDecision("tech-a", "tech-a", "IN_PROGRESS", false)).toBe(
      "MISSING_PROOF",
    ));
  it("REPAIR P4: assigned technician, work started, verified proof", () =>
    expect(completionDecision("tech-a", "tech-a", "IN_PROGRESS", true)).toBe(
      "READY",
    ));
  it("NOTIFY P1: neither external test channel", () =>
    expect(deliveryChannels(false, false)).toEqual([]));
  it("NOTIFY P2: email only", () =>
    expect(deliveryChannels(true, false)).toEqual(["EMAIL"]));
  it("NOTIFY P3: SMS only", () =>
    expect(deliveryChannels(false, true)).toEqual(["SMS"]));
  it("NOTIFY additional path: both channels", () =>
    expect(deliveryChannels(true, true)).toEqual(["EMAIL", "SMS"]));
});
````

## tsconfig.json

````json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
````

## vercel.json

````json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "crons": [{ "path": "/api/jobs/recover", "schedule": "0 10 * * *" }]
}
````

## vitest.config.ts

````ts
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
````
