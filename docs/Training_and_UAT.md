# CampusFix training and user acceptance plan

This is a proposed training and acceptance plan. No human session, campus pilot, or approval was completed during the automated build. Fill the records below only after real participants finish the tasks.

## Training plan

| Audience | Time | Tasks | Material | Success measure |
|---|---|---|---|---|
| Students and staff | 20 minutes | Sign in, report, follow, comment, review repair, recover draft | User manual and test account | Participant submits and reviews one report without help |
| Technicians | 25 minutes | Open assignment, start work, record parts and time, submit proof | Phone, sample photos, assigned test job | Complete correct job with valid evidence |
| Dispatchers | 25 minutes | Review, prioritise, assign, merge, export | Work queue and duplicate test pair | Correct trade and deadline; merge reason recorded |
| Administrators | 25 minutes | Create account, set availability, deactivate, unlock, edit directory, read audit | Administrator test account and programme manual | Controls work without changing unrelated records |
| Group operators | 30 minutes | Start local copy, apply migration, inspect jobs, back up and restore test data | README and programme manual | Restore check completed in an isolated environment |

Before training, prepare a working local copy, test photos, separate browser profiles, accessible seating and devices, and a backup presenter. Explain that the system is a course demo. Use fictional data. Ask participants what access support they need. Record any task that needs help and improve the manual before the next session.

## Acceptance tasks

| ID | Participant role | Task | Pass condition |
|---|---|---|---|
| UAT01 | Reporter | Submit a valid fault with photo | Ticket number appears and record can be reopened |
| UAT02 | Reporter | Enter invalid text and photo | Clear error, no partial report |
| UAT03 | Dispatcher | Set P2 and assign correct trade | Correct technician and original-time deadline |
| UAT04 | Technician | Start, log parts and time, complete with proof | Correct state and history |
| UAT05 | Reporter | Confirm one repair and dispute another | Closed and reopened results match actions |
| UAT06 | Facilities | Merge two matching reports | Main ticket retains followers and reason |
| UAT07 | Administrator | Create, unlock, and deactivate a test account | Access changes and audit events are correct |
| UAT08 | Reporter | Save draft, queue offline, reconnect | One report is sent for the correct account |
| UAT09 | Facilities | Filter and export report data | CSV agrees with selected records |
| UAT10 | Keyboard and phone user | Complete the main task with chosen input method | No task blocker; labels and focus are usable |

## Session record

| Field | Entry |
|---|---|
| Date and environment | Not yet recorded |
| Application build or deployment | Not yet recorded |
| Facilitator | Not yet recorded |
| Participant code and role | Not yet recorded |
| Consent for feedback and screenshots | Not yet recorded |
| Device, browser, and access needs | Not yet recorded |

Use participant codes in the report. Keep names and consent records separately when needed. Do not include personal details in public screenshots.

## Observation record

| Task ID | Completed | Time | Help needed | Defect or comment | Evidence |
|---|---|---|---|---|---|
| To be entered | Not tested | Not measured | Not recorded | Not recorded | Not recorded |

Ask whether the location choices, status labels, next actions, and errors are clear. Ask what blocked the task. Record exact observations without inventing quotes or scores. Link each accepted defect to a correction and retest.

## Acceptance decision

| Field | Entry |
|---|---|
| Decision | Pending real user testing |
| Open critical defects | Not assessed by participants |
| Required corrections and owners | To be recorded |
| Reviewer and date | To be recorded |
| Approval scope | Course demonstration only unless separately authorised |

## Proposed rollout

After successful user tests, propose a small faculty pilot for university review. Obtain identity, privacy, support, and operational approval before real campus use. Start with a limited group, review defects and workload, then decide whether to expand. This proposed sequence is not evidence that a pilot has happened.
