# CampusFix group guide

This guide tells each group member how to run CampusFix and prepare the course submission. Read README.md for demo accounts and full setup options.

## Get the project

Install Git and Node.js 24 LTS with npm. Clone this repository with its GitHub Code button URL. Open a terminal inside the campusfix folder.

```text
npm ci
npm run local
```

Open http://localhost:3000. Keep the terminal open. The first start creates the local PostgreSQL database, applies migrations, adds demo accounts, and starts the app and job worker. Each person gets their own local database. Local changes do not change the hosted site or another member's database.

The first install needs internet access. Windows, macOS, and Linux can use the local PostgreSQL option. Docker PostgreSQL is an alternative. See README.md before switching database services. Use one service at a time on port 55432.

Use demo password CampusFix2026! and the role buttons. Test the whole flow: Student reports, Dispatcher assigns, Technician starts and completes with proof, Student confirms or disputes.

## Work as a group

Share the public repository URL in WhatsApp. Everyone can view, clone, or fork it. A public link does not grant write access. Send the repository owner your GitHub username for a collaborator invitation. Accept the invitation in GitHub.

After you have access, pull the latest main branch. Create a branch for your change. Open a pull request and ask another member to review it. Do not commit environment secrets, private photos, personal records, node_modules, or local database files. Use .env.example as the settings template.

Agree on task owners and record each person's actual work. Suggested areas are reporting and interface, dispatch and repairs, data and security, testing and evidence, and manuals and training. These are suggested responsibilities, not a record of contributions.

## Run the checks

```text
npm run verify
npm run test:coverage
npx playwright install chromium firefox webkit
npm run build
npm start
```

Stop the development web server before npm start, which also uses port 3000. Keep the database and worker running. In another terminal, run:

```text
npm run test:e2e
```

Tests reset only the separate campusfix_test database. Do not use it for work you want to keep. The native setup creates it. Docker users must create it once, as shown in README.md.

Firefox could not start on the original Windows test host. On that PC, use `npx playwright test --project=chromium --project=webkit`. Run Firefox on another working host and save the result. Do not describe an unrun browser as passed.

Run npm run test:load against a local production server for the defined 500-request test. Record the environment, data set, failures, and timing results. Do not run this load against the hosted free service. The Docker persistence check uses an isolated container and port 55433; read scripts/docker-check.ts and Test_Plan.md before running it.

## Complete the course requirements

| Requirement | Existing work | Group action before submission |
|---|---|---|
| Working software | Full repair flow and local and hosted copies | Run the demonstration on the actual presentation device |
| Implementation report | docs/CampusFix_Software_Implementation_Report.md and Word copy | Review against the assignment guide; add actual member names, IDs, and contributions |
| Programme manual | Architecture, database design, API, source listing, migrations | Check that the manual matches any group changes |
| User manual | Role instructions and real colour screenshots | Replace screenshots after interface changes |
| White-box tests | Six routines, graphs, three complexity methods, independent paths | Explain E minus N plus 2, predicates plus 1, and regions; rerun path tests after changes |
| Black-box tests | Text and photo boundaries and invalid content | Rerun and record actual outcomes |
| Integration tests | Real PostgreSQL services, storage, failures, concurrency, workloads | Verify changes with the separate test database |
| Browser tests | Repair roles, access checks, phone, keyboard, offline queue | Run on group devices and record browser limits |
| Performance and recovery | Measured load and Docker restart evidence | Repeat under a stated environment if the implementation changes |
| Training | Training_and_UAT.md plan and blank forms | Conduct real role-based sessions and record observations |
| User acceptance | Task list and blank acceptance forms | Have real people complete tasks, record defects, retest, and obtain actual sign-off |
| Presentation | Demonstration_Script.md | Rehearse separate role profiles and prepare the local backup copy |
| Traceability | Requirements_Traceability.md | Link each changed requirement to code and evidence |

Read the original assignment guide and marking rules as the course authority. This checklist supports them and does not replace them. Check any lecturer-specific submission format and deadline.

## Keep evidence accurate

After changes, run the relevant tests, then npm run docs:whitebox, npm run docs:source, and npm run docs:evidence. Keep machine-readable results and useful screenshots. Do not copy old performance numbers into a new test report. Do not mark training, user acceptance, or a campus pilot complete until it happens.

Email and SMS currently store test delivery records. Official university login and live message delivery remain later integrations. Do not claim live campus approval, malware scanning, guaranteed uptime, or a completed 72-hour hosted observation without evidence.

Word copies are in docs/word. Markdown files are the editable source for the manuals. The document build helpers require Python document libraries, and the Windows rendering helper uses Microsoft Word. Review every rendered page after rebuilding Word files. App installation does not require these document tools.
