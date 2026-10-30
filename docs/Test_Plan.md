# CampusFix test plan

The objective is to verify the implemented course requirements with repeatable checks. This plan separates automated results from human acceptance. The final evidence is in [Recorded Test Results](evidence/Test_Results.md).

## Test environment and order

Use a clean dependency install and PostgreSQL 16. Set `TEST_DATABASE_URL` to the separate database named `campusfix_test`. Integration setup refuses another database name. It resets that disposable test database before seeding, so reruns have the same starting data. The presentation and hosted databases are not reset by integration tests.

1. Run `npm run typecheck` and `npm run lint`.
2. Run `npm run test:coverage` for pure rules and real database services.
3. Run browser scenarios against a prepared local server.
4. Run `npm run build`, then `npm start` for the production copy.
5. Run `npm run test:load` locally.
6. Run the isolated Docker persistence check if Docker is available.
7. Deploy and run the hosted browser checks. Do not run the 500-client load against hosted free services.
8. Generate the evidence summary and review screenshots.

## White-box checks

The assessed modules are authentication, report validation, dispatch, repair, notifications, and reports. Each has a production decision routine, a control flow graph, three cyclomatic complexity calculations, and feasible independent paths. See [White Box Tests](White_Box_Tests.md). Tests call these routines and also exercise their surrounding database services. Routine path coverage does not imply full application branch coverage.

## Black-box partitions and boundaries

| Input or rule | Valid partition | Invalid partition and boundaries |
|---|---|---|
| Description | 15 through 500 characters | 14 and 501; empty and spaces only |
| Title | 1 through 150 | 0 and 151 |
| Photo input size | 1 through 4,500,000 whole bytes | 0, negative, fractional, 4,500,001 |
| Photo content | Decodable PNG or JPEG with matching declared type | Wrong type, corrupt copied signature, arbitrary bytes |
| Exact photo limit | Padded valid PNG input at 4,500,000 accepted and cleaned | Oversize rejected before decode |
| Priority deadline | P1 4h, P2 24h, P3 72h from original submission | Reassignment cannot restart the clock |
| Account access | Active account, no current lock | Inactive, five failures, future lock |
| Lock expiry | Expired or exact expiry permits access | Future lock blocks access |
| Completion | Assigned technician, started work, notes, verified after photo | Wrong technician, wrong state, missing or unowned proof |
| Report access | Owner, explicit follower, assigned technician, facilities role | Unrelated reporter and technician |
| CSV | Null, ordinary text, commas, quotes | Formula-leading text is escaped |
| Calendar date | Jamaica start and end of day | UTC-next-day record must stay in its Jamaica day |

## Database and storage integration

| Area | Check |
|---|---|
| Transactions | Failed attachment claim does not create a ticket |
| Idempotency | Concurrent same-key requests return one ticket; another owner cannot reuse the result |
| Concurrency | One of two same-version ticket mutations succeeds; the other receives a conflict |
| Allocation | Trade, availability, and actual active workload control the selected technician |
| Workload | Assignment, dispute, completion, merge, and reassignment keep counts correct |
| Duplicates | Suggestions respect location and category; follow is explicit; merge transfers followers; invalid merges fail |
| Audit | Real changes insert events; UPDATE and DELETE are blocked |
| Photos | Validate real bytes, ownership, phase, and decoding; retrieve only through authorised routes |
| Failure | Invalid upload leaves no partial report; failed test delivery keeps retry information without losing a ticket |
| Closure | An old undisputed completion closes; new, active, missing, and changed-version tickets do not |
| Accounts | Deactivation revokes a session; own administrator deactivation is blocked |
| Reference data | Create, update, and deactivate categories and locations |
| Reports | Compute real totals and export matching records; Jamaica dates use correct boundaries |

## Browser scenarios

The five scenarios cover visible sign-in, the full repair path across three roles, forbidden API and cross-site actions, a 390 px phone layout with keyboard focus, and draft plus offline queue recovery. Local Chromium and WebKit are tested. Hosted Chromium uses real Neon and private Blob. Firefox remains in the configuration for a working host. Its Windows startup failure is recorded separately.

The repair scenario uploads real generated PNG bytes before and after work. It saves notes, parts, and labour, confirms closure, and exports CSV. The offline case saves a draft, reloads while connected, queues while offline, then verifies one report after reconnect. It does not claim a private page can fully reload offline.

Axe scans use WCAG 2 A, AA, and 2.1 AA tags on named screens. Attachments list any rule violations. Automated scans and a limited keyboard case do not replace human accessibility review.

## Performance and persistence

Performance targets are 2,000 ms at the 95th percentile for dashboard API and browser load, and 500 ms for the joined ticket query. The local production test uses 500 simultaneous dashboard requests from one signed-in account, 100 database query samples, and five browser loads. Record the CPU, RAM, operating system, Node and database versions, data size, failures, and percentiles. Do not copy draft performance claims.

The Docker check uses a separate `campusfix-check` project on port 55433. It creates a ticket and photo, reads them, stops the app, restarts PostgreSQL, starts a new app process, and compares the same record, persisted session, and image hash. It does not stop or reset the main database.

## Entry and exit conditions

Entry requires installed dependencies, a prepared database, working storage, and known demo accounts. Exit requires no unresolved critical defect in the tested core flow, passing type and lint checks, recorded automated results, a successful production build, and a documented list of remaining limits. Human user acceptance needs separate real sessions and approval. Failed environment checks must remain visible in the report.

## Defect record template

| Field | Record |
|---|---|
| ID and title | To be entered |
| Build and environment | To be entered |
| Steps and expected result | To be entered |
| Actual result and evidence | To be entered |
| Severity and owner | To be entered |
| Correction and retest result | To be entered |

Store a screenshot, trace, or log with each observed defect. Never mark a human test passed before the participant completes it.
