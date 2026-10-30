# CampusFix

**Group members: start with [the group setup and course checklist](docs/Group_Start_Here.md).**

CampusFix is a working CIT4001 course application. Students and staff report campus faults. Facilities staff assign work. Technicians record repairs and photo proof. The reporter can confirm or dispute a repair.

**Hosted application:** https://campusfix-seven-iota.vercel.app

This is a course demonstration. Accounts and campus records are test data. The application has no official university login connection. Email and SMS use a clearly labelled test transport. The parent course files are unchanged.

## Run the local copy

Use Node.js 22 or later and npm. The first install needs an internet connection. Recorded local tests used Node.js 26.12.1.

```powershell
cd "C:\Users\nazir\Downloads\Software Implementation Group Project\campusfix"
npm ci
npm run local
```

Open http://localhost:3000. The `local` command creates `.env.local` if needed. It starts private PostgreSQL 16 on port 55432 if needed, applies migrations, adds demo data, and starts the web server and job worker. Keep the terminal open. Use Ctrl+C to stop it. Data remains in `.data/postgres`. Private photos remain in `.data/uploads`.

## Use Docker for the team database

Docker is an alternative to native PostgreSQL. Use one service at a time on port 55432.

```powershell
Copy-Item .env.example .env.local
npm run db:docker
npm run db:prepare
docker compose exec db psql -U campusfix -d postgres -c "CREATE DATABASE campusfix_test;"
npm run local
```

Copy `.env.example` only for a new setup. Keep existing settings if `.env.local` exists. Create the test database once. The native database script creates it itself. Docker uses a named volume. `docker compose stop` preserves it. Do not delete the volume unless you intend to delete its data. To use another port, set `CAMPUSFIX_DB_PORT` and change both database URLs to match.

For separate native terminals, run `npm run db:start`, then `npm run db:prepare`. Run `npm run dev` and `npm run jobs` in separate terminals.

## Demo accounts

All demo passwords are **CampusFix2026!**. These are public test accounts for the course demonstration.

| Role | Email | ID |
|---|---|---|
| Student | student@utech.edu.jm | 2601001 |
| Staff | staff@utech.edu.jm | STF1001 |
| Electrical technician | technician@utech.edu.jm | TEC1001 |
| Plumbing technician | plumber@utech.edu.jm | TEC1002 |
| HVAC technician | hvac@utech.edu.jm | TEC1003 |
| Carpentry technician | carpenter@utech.edu.jm | TEC1004 |
| IT technician | it@utech.edu.jm | TEC1005 |
| Second electrical technician | electrical2@utech.edu.jm | TEC1006 |
| Dispatcher | dispatcher@utech.edu.jm | FMD1001 |
| Administrator | admin@utech.edu.jm | ADM1001 |

Use separate browser profiles for each role during a demonstration. A new sign-in in the same profile replaces that profile's active session.

## Rules

- Titles contain 1 to 150 characters. Descriptions contain 15 to 500 characters after trimming.
- Photos are JPG or PNG, up to 4,500,000 bytes. The server checks signature, size, and image decoding. It removes EXIF data and extra trailing data. The pixel limit is 25 million.
- Main states are Pending, Assigned, In progress, Completed, and Closed. Duplicate and Rejected are review outcomes. A dispute returns the repair to In progress.
- P1 is 4 hours, P2 is 24 hours, and P3 is 72 hours from submission. Reassignment does not reset the deadline.
- If no qualified technician is available, the report stays Pending and unassigned.
- Completion requires repair notes and an after photo. Undisputed repairs close after 72 hours.
- The database stores UTC timestamps. The interface shows Jamaica time.
- Drafts and queues stay on the device. Queued reports need the same account's active session.

## Run checks

```powershell
npm run verify
npm run test:coverage
npx playwright install chromium firefox webkit
npm run test:e2e
npm run build
npm start
```

Browser tests use the prepared local presentation database. Integration tests use the separate `campusfix_test` database. See [recorded results](docs/evidence/Test_Results.md) for actual outcomes and limits.

Firefox could not start on the recorded Windows host. To repeat the working local engines on this PC, use `npx playwright test --project=chromium --project=webkit`. Keep the Firefox project for a working host. The test plan records this limit.

Run `npm run test:load` against a local production server. It sends 500 simultaneous dashboard requests and refuses hosted URLs. This scenario does not prove campus capacity.

## Deploy on Vercel

The deployment uses the `campusfix7` Hobby team, Neon Free in iad1, private Vercel Blob in iad1, and Vercel Workflows. No paid plan was selected. Free service limits apply.

For a new account, sign in and link a Vercel project. Install Neon with `free_v3` and accept its Marketplace terms in the browser. Create a private Blob store. Connect both to production. Set `STORAGE_DRIVER=vercel`, `DEMO_MODE=true`, `DEMO_PASSWORD`, and a random `CRON_SECRET`. The integrations set `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`.

```powershell
npx vercel login
npx vercel link
npx vercel env pull .env.vercel.local --environment production
npx tsx scripts/cloud-prepare.ts
npx vercel --prod
```

The helper accepts a Neon hostname, applies migrations, and adds demo data. It does not print credentials. `.env.vercel.local` is ignored by Git and uploads. Do not name it `.env.production.local` for local work, as Next.js loads that name automatically. Keep local and cloud settings separate. Use the Vercel dashboard for environment changes under another team.

Vercel Workflows schedule completion checks and test deliveries. The daily protected recovery route retries work and removes unattached photos older than 24 hours. The local worker uses the same durable job table.

## Course deliverables

Editable Word copies: [Development report](docs/word/CampusFix_Software_Implementation_Report.docx), [Programme manual](docs/word/CampusFix_Programme_Manual.docx), and [User manual](docs/word/CampusFix_User_Manual.docx). Keep the companion source listing and evidence folders with these files.

- [Development report](docs/CampusFix_Software_Implementation_Report.md)
- [Programme manual](docs/CampusFix_Programme_Manual.md)
- [User manual with colour screenshots](docs/CampusFix_User_Manual.md)
- [Full source listing](docs/Programme_Source_Listing.md)
- [White-box graphs and paths](docs/White_Box_Tests.md)
- [Requirements traceability](docs/Requirements_Traceability.md)
- [Test plan](docs/Test_Plan.md)
- [Demonstration script](docs/Demonstration_Script.md)
- [Training and user acceptance forms](docs/Training_and_UAT.md)
- [Recorded results](docs/evidence/Test_Results.md)

Run `npm run docs:source`, `npm run docs:whitebox`, and `npm run docs:evidence` after code and test updates. Keep evidence with the submitted source.

## Backup and recovery

Back up the database and private photos together. For Docker, use `pg_dump` through a binary-safe output tool. Do not send a custom-format dump through Windows PowerShell text redirection. For native PostgreSQL, stop the server before copying `.data/postgres`. Copy `.data/uploads` at the same time. Restore to a separate database and check ticket, photo, and audit links first. Hosted backups must include both Neon data and Blob photos. No backup schedule or recovery time guarantee is claimed.
