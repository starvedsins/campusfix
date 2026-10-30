# CampusFix demonstration script

This script demonstrates one real repair across all roles. Allow 15 to 20 minutes. Use test data only. Start the local copy before the session even if the hosted copy is available.

## Prepare

Run `npm run local`. Check http://localhost:3000/api/health. The hosted copy is at https://campusfix-seven-iota.vercel.app. Open three separate browser profiles for student, dispatcher, and technician. Open an administrator profile for the last section. Use password CampusFix2026! and the accounts in README. Prepare two small JPG or PNG test images. Label them as demonstration images.

Keep the local database and worker running. Do not delete data between role changes. Note the new ticket number so every role opens the same report.

## Demonstrate

| Step | Account and action | Expected observation |
|---|---|---|
| 1 | Student signs in using the visible form | Student overview and personal reports |
| 2 | Open Report an issue; choose Electrical, Engineering and Computing, SCIT Building 2B, Computer Lab 3 | Exact category and location controls |
| 3 | Enter a clear title, at least 15 description characters, urgency, and before photo | Validation and preview |
| 4 | Review similar reports; follow one or explicitly choose a separate fault | No automatic merge |
| 5 | Submit | One ticket number, Pending state, history event |
| 6 | Dispatcher opens that ticket, sets P2, selects Morgan Ellis | Assigned state, deadline 24 hours from submission |
| 7 | Technician opens assigned job and starts it | In progress state and workload |
| 8 | Save notes, one test part, and 20 labour minutes | Work record appears |
| 9 | Add repair notes and after photo; complete | Completed state and repair proof |
| 10 | Student reviews and confirms | Closed state and audit event |
| 11 | Dispatcher opens Reports and insights and exports CSV | Matching real report data |
| 12 | Administrator opens accounts, directory, and audit history | Role controls and stored events |
| 13 | Facilities account opens Message delivery | Test recorded labels, no live message claim |

## Show controlled failures

Use a 14-character description to show the minimum error, then restore valid text. Use an invalid image file to show content validation. Open a different user's ticket with an unrelated reporter to show access rejection. Do not deliberately lock the shared demo accounts during the main repair demonstration.

Use a second repair to show a dispute. The original reporter records a reason after completion. Work returns to In progress. Explain that the original 72-hour job cannot close the changed version. Do not claim to have waited 72 hours in the session.

## Show offline recovery

Open a new report while connected and fill valid data. Save a draft. Reload while connected and check that the draft returns. Set the browser network to Offline. Submit the open form and show the queued message. Reconnect and wait for the sent notification. Search the title and confirm there is one report. A full offline page navigation shows help; it does not expose cached private tickets.

## Show repeatable evidence

Open `docs/evidence/Test_Results.md`, the browser report, white-box graphs, and performance JSON. Explain the tested load and its limits. Show `persistence.json` for the isolated Docker restart result. Run the tests again only if time permits. The Firefox Windows startup issue is an environment limit, not a recorded application pass.

## Close

Sign out of each profile. Record the demonstration date, attendees, ticket IDs, any failure, and the evidence file. Use the UAT form only if participants actually complete the assigned tasks. Do not mark a demonstration as campus acceptance or a live pilot.
