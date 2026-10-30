# Recorded test results

Generated: 2026-10-30T20:48:49.043Z.

These are automated checks. They are not a user acceptance test or proof of live campus use.

## Unit and database tests

91 passed, 0 failed, 0 pending. Source: vitest-results.json.

Coverage scope: the service and policy files listed in vitest.config.ts. UI, API routes, jobs, and Workflow files are outside this coverage figure.

| Measure | Result |
|---|---|
| lines | 84.11% |
| statements | 83.14% |
| functions | 75.8% |
| branches | 74.43% |

## Browser checks

| Engine | Passed | Failed | Skipped |
|---|---|---|---|
| chromium | 5 | 0 | 0 |
| webkit | 5 | 0 | 0 |

See playwright-results.json and browser-report/index.html for steps, errors, and accessibility attachments. Automated axe checks cover the named screens and rule tags in application.spec.ts. They do not establish full WCAG conformance. The keyboard and phone cases cover the tested controls and 390 px viewport.

## Hosted browser checks

Chromium: 5 passed, 0 failed, 0 skipped. The suite used the public Vercel URL, Neon, and private Blob. Source: playwright-hosted-results.json.

Firefox could not start on this Windows host. Windows reported a missing side-by-side mozglue assembly. Reinstalling the current browser did not correct it. No Firefox application pass is claimed. See browser-environment.md.

## Performance

Environment: win32, AMD Ryzen 5 7535HS with Radeon Graphics        , 12 logical CPUs, 31 GB RAM, Node v26.12.1, PostgreSQL 16.15. Mode: local production build.

500 simultaneous authenticated dashboard requests. Clients share one demo account. No login load or hosted load was tested.

| Check | Samples | Median ms | 95th percentile ms | Target ms | Target met |
|---|---|---|---|---|---|
| api | 500 | 1281 | 1342 | 2000 | Yes |
| database | 100 | 0 | 1 | 500 | Yes |
| navigation | 5 | 112 | 435 | 2000 | Yes |

Failed dashboard requests: 0. This small seeded data set does not prove campus-scale capacity. Source: performance.json.

## Human review

User acceptance sessions: not performed. Training sessions: not performed. Campus pilot: not performed. Use Training_and_UAT.md to record real sessions. Deployment and persistence evidence are separate files.