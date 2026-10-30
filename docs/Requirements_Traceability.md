# CampusFix requirements traceability

This table links the approved build rules to source and evidence. Automated checks are completed only where the saved results show a pass. Human acceptance and training are pending.

| ID | Requirement | Main source | Verification |
|---|---|---|---|
| R01 | Working local and hosted application | app, scripts/local.ts, vercel.json | Production build, hosted health, browser repair flow |
| R02 | PostgreSQL migrations preserve course design | db/migrations, scripts/migrate.ts | Applied locally, in Docker, and in Neon; source hash check |
| R03 | Bcrypt login and database roles | lib/auth.ts, lib/reference.ts | Login, session, forbidden browser API tests |
| R04 | Five failures lock for 30 minutes | lib/auth.ts, lib/policies.ts | Integration lock and expiry; AUTH paths |
| R05 | Accounts and technician availability | lib/reference.ts, components/management.tsx | Create and deactivate tests; session revocation |
| R06 | Complete report with exact campus location | components/new-report.tsx, lib/tickets.ts | Browser form and database creation |
| R07 | Description 15 to 500, title 1 to 150 | lib/domain.ts, migration 0002 | Black-box boundaries and constraints |
| R08 | JPG or PNG up to 4,500,000 bytes | lib/storage.ts, lib/domain.ts | Size, MIME, signature, corrupt image, exact-limit tests |
| R09 | Private photo access and validated attachment | API route, lib/storage.ts | Owned proof tests; forbidden evidence API; hosted direct uploads |
| R10 | Reporter owns or follows accessible reports | lib/tickets.ts, lib/domain.ts | Scoping and unrelated-account rejection tests |
| R11 | Comments and activity history | lib/tickets.ts, components/ticket-page.tsx | Comment and immutable audit integration tests |
| R12 | Qualified manual and automatic allocation | lib/tickets.ts | Trade, no available technician, least-workload tests |
| R13 | State and workload changes are atomic | lib/tickets.ts | Full service flow, concurrency, rollback, workload tests |
| R14 | Notes, parts, labour, and after proof | lib/tickets.ts, components/ticket-page.tsx | Browser repair and proof validation tests |
| R15 | Confirm, dispute, and 72-hour closure | lib/tickets.ts, workflows/maintenance.ts | Dispute and closure version tests; hosted Workflow scheduled |
| R16 | 12-hour duplicate suggestion and confirmed merge | lib/tickets.ts, components/new-report.tsx | Explicit follow, match, merge, and invalid merge tests |
| R17 | P1 4h, P2 24h, P3 72h from submission | lib/policies.ts, lib/tickets.ts | Three priority and reassignment deadline tests |
| R18 | No available technician means Pending and NULL | lib/tickets.ts | No-qualified-technician database test |
| R19 | UTC storage and Jamaica display | schema, lib/domain.ts, lib/reports.ts | UI screenshots; Jamaica date and CSV regression |
| R20 | In-app notices and test email/SMS records | lib/notifications.ts, lib/jobs.ts | Delivery retry tests; hosted Done jobs and Test recorded rows |
| R21 | Totals, overdue, MTTR, SLA, building counts | lib/reports.ts, components/management.tsx | Aggregate and export tests; screenshot 09 |
| R22 | CSV and printable reports | lib/reports.ts, management.tsx, globals.css | Browser export and CSV safety tests; print stylesheet review |
| R23 | Installable PWA and offline draft queue | public, lib/offline.ts | Manifest and icons; offline browser recovery case |
| R24 | Session check and idempotent reconnect | lib/offline.ts, lib/tickets.ts | Queue code review; browser single submission; concurrent same-key test |
| R25 | Phone controls, keyboard, status text | globals.css, shared UI | 390 px browser case, focus assertions, axe attachments |
| R26 | White-box graphs and three complexity methods | lib/policies.ts, domain.ts, reports.ts | White_Box_Tests.md and policy/domain suites |
| R27 | Measured performance and restart persistence | scripts/load.ts, scripts/docker-check.ts | performance.json, persistence.json |
| R28 | Source, database, manuals, screenshots | docs, source-listing.ts | Source listing and colour screenshot files |
| R29 | Training plan and truthful user results | docs/Training_and_UAT.md | Plan and blank forms supplied; sessions not performed |
| R30 | Demo directory and future official integration | seed.ts, login UI, help page | Demo labels and role accounts; no SSO or live SMS claim |

Paths in this table are relative to `src/` unless a different folder is shown. Read the evidence summary for exact counts and scope. The hosted delayed closure job was scheduled, not observed over a full 72-hour wait during this build.
