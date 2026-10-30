# White-box test evidence

Scope: one production decision routine from each assessed module. These graphs do not describe the complexity of the whole application. The routines are called by the production services. The tests also exercise the full services with PostgreSQL.

Method 1: V(G) = E - N + 2. Method 2: V(G) = P + 1, where P is the count of binary decision nodes. Method 3: V(G) is the number of graph regions, including the outside region. Each graph below is connected and has one exit. Throw and return edges both lead to that exit.

## AUTH: accountAccess

Source: [src/lib/policies.ts:4](../src/lib/policies.ts).

![AUTH control flow graph](graphs/auth.png)

```mermaid
flowchart TD
  n1([1 Start])
  n2{2 Inactive?}
  n3[3 INACTIVE]
  n4{4 No lock?}
  n5[5 OPEN]
  n6{6 Lock is in future?}
  n7[7 LOCKED]
  n8[8 OPEN]
  n9([9 Exit])
  n1 --> n2
  n2 -->|Yes| n3
  n2 -->|No| n4
  n3 --> n9
  n4 -->|Yes| n5
  n4 -->|No| n6
  n5 --> n9
  n6 -->|Yes| n7
  n6 -->|No| n8
  n7 --> n9
  n8 --> n9
```

N = 9, E = 11, P = 3.

1. Edges and nodes: 11 - 9 + 2 = **4**.
2. Predicate nodes: 3 + 1 = **4**.
3. Regions: 3 bounded regions + 1 outside region = **4**.

| Path | Nodes | Test input and expected result |
|---|---|---|
| AUTH P1 | 1,2,3,9 | Inactive account |
| AUTH P2 | 1,2,4,5,9 | Active, no lock |
| AUTH P3 | 1,2,4,6,7,9 | Active, future lock |
| AUTH P4 | 1,2,4,6,8,9 | Active, expired lock |

Pseudocode:

```text
START
IF Inactive? THEN RETURN INACTIVE
IF No lock? THEN RETURN OPEN
IF Lock is in future? THEN RETURN LOCKED
RETURN OPEN
END
```

Production routine:

```typescript
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
```

## PHOTO: validatePhotoSize

Source: [src/lib/domain.ts:258](../src/lib/domain.ts).

![PHOTO control flow graph](graphs/photo.png)

```mermaid
flowchart TD
  n1([1 Start])
  n2{2 Size is not an integer?}
  n3[3 Reject]
  n4{4 Size below 1?}
  n5[5 Reject]
  n6{6 Size above 4500000?}
  n7[7 Reject]
  n8[8 Accept size]
  n9([9 Exit])
  n1 --> n2
  n2 -->|Yes| n3
  n2 -->|No| n4
  n3 --> n9
  n4 -->|Yes| n5
  n4 -->|No| n6
  n5 --> n9
  n6 -->|Yes| n7
  n6 -->|No| n8
  n7 --> n9
  n8 --> n9
```

N = 9, E = 11, P = 3.

1. Edges and nodes: 11 - 9 + 2 = **4**.
2. Predicate nodes: 3 + 1 = **4**.
3. Regions: 3 bounded regions + 1 outside region = **4**.

| Path | Nodes | Test input and expected result |
|---|---|---|
| PHOTO P1 | 1,2,3,9 | 1.5 bytes |
| PHOTO P2 | 1,2,4,5,9 | 0 bytes |
| PHOTO P3 | 1,2,4,6,7,9 | 4500001 bytes |
| PHOTO P4 | 1,2,4,6,8,9 | 4500000 bytes |

Pseudocode:

```text
START
IF Size is not an integer? THEN REJECT input and exit
IF Size below 1? THEN REJECT input and exit
IF Size above 4500000? THEN REJECT input and exit
ACCEPT the size
END
```

Production routine:

```typescript
export function validatePhotoSize(size: number) {
  if (!Number.isInteger(size))
    throw new AppError("The photo size must be a whole number of bytes.");
  if (size < 1) throw new AppError("The photo cannot be empty.");
  if (size > MAX_PHOTO_BYTES)
    throw new AppError("The photo must be 4.5 MB or smaller.");
}
```

## DISPATCH: priorityHours

Source: [src/lib/policies.ts:14](../src/lib/policies.ts).

![DISPATCH control flow graph](graphs/dispatch.png)

```mermaid
flowchart TD
  n1([1 Start])
  n2{2 Priority P1?}
  n3[3 4 hours]
  n4{4 Priority P2?}
  n5[5 24 hours]
  n6[6 72 hours]
  n7([7 Exit])
  n1 --> n2
  n2 -->|Yes| n3
  n2 -->|No| n4
  n3 --> n7
  n4 -->|Yes| n5
  n4 -->|No| n6
  n5 --> n7
  n6 --> n7
```

N = 7, E = 8, P = 2.

1. Edges and nodes: 8 - 7 + 2 = **3**.
2. Predicate nodes: 2 + 1 = **3**.
3. Regions: 2 bounded regions + 1 outside region = **3**.

| Path | Nodes | Test input and expected result |
|---|---|---|
| DISPATCH P1 | 1,2,3,7 | P1_CRITICAL |
| DISPATCH P2 | 1,2,4,5,7 | P2_URGENT |
| DISPATCH P3 | 1,2,4,6,7 | P3_ROUTINE |

Pseudocode:

```text
START
IF Priority P1? THEN RETURN 4 hours
IF Priority P2? THEN RETURN 24 hours
RETURN 72 hours
END
```

Production routine:

```typescript
export function priorityHours(priority: Priority) {
  if (priority === "P1_CRITICAL") return 4;
  if (priority === "P2_URGENT") return 24;
  return 72;
}
```

## REPAIR: completionDecision

Source: [src/lib/policies.ts:19](../src/lib/policies.ts).

![REPAIR control flow graph](graphs/repair.png)

```mermaid
flowchart TD
  n1([1 Start])
  n2{2 Another technician?}
  n3[3 FORBIDDEN]
  n4{4 Work not started?}
  n5[5 NOT_STARTED]
  n6{6 No verified proof?}
  n7[7 MISSING_PROOF]
  n8[8 READY]
  n9([9 Exit])
  n1 --> n2
  n2 -->|Yes| n3
  n2 -->|No| n4
  n3 --> n9
  n4 -->|Yes| n5
  n4 -->|No| n6
  n5 --> n9
  n6 -->|Yes| n7
  n6 -->|No| n8
  n7 --> n9
  n8 --> n9
```

N = 9, E = 11, P = 3.

1. Edges and nodes: 11 - 9 + 2 = **4**.
2. Predicate nodes: 3 + 1 = **4**.
3. Regions: 3 bounded regions + 1 outside region = **4**.

| Path | Nodes | Test input and expected result |
|---|---|---|
| REPAIR P1 | 1,2,3,9 | Other technician |
| REPAIR P2 | 1,2,4,5,9 | Assigned state |
| REPAIR P3 | 1,2,4,6,7,9 | In progress, no proof |
| REPAIR P4 | 1,2,4,6,8,9 | In progress, proof present |

Pseudocode:

```text
START
IF Another technician? THEN RETURN FORBIDDEN
IF Work not started? THEN RETURN NOT_STARTED
IF No verified proof? THEN RETURN MISSING_PROOF
RETURN READY
END
```

Production routine:

```typescript
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
```

## NOTIFY: deliveryChannels

Source: [src/lib/policies.ts:30](../src/lib/policies.ts).

![NOTIFY control flow graph](graphs/notify.png)

```mermaid
flowchart TD
  n1([1 Start])
  n2{2 Email enabled?}
  n3[3 Append EMAIL]
  n4{4 SMS enabled?}
  n5[5 Append SMS]
  n6[6 Return channels]
  n7([7 Exit])
  n1 --> n2
  n2 -->|Yes| n3
  n2 -->|No| n4
  n3 --> n4
  n4 -->|Yes| n5
  n4 -->|No| n6
  n5 --> n6
  n6 --> n7
```

N = 7, E = 8, P = 2.

1. Edges and nodes: 8 - 7 + 2 = **3**.
2. Predicate nodes: 2 + 1 = **3**.
3. Regions: 2 bounded regions + 1 outside region = **3**.

| Path | Nodes | Test input and expected result |
|---|---|---|
| NOTIFY P1 | 1,2,4,6,7 | false, false => [] |
| NOTIFY P2 | 1,2,3,4,6,7 | true, false => EMAIL |
| NOTIFY P3 | 1,2,4,5,6,7 | false, true => SMS |

Pseudocode:

```text
SET channels to an empty list
IF Email enabled? THEN Append EMAIL
IF SMS enabled? THEN Append SMS
Return channels
END
```

Production routine:

```typescript
export function deliveryChannels(email: boolean, sms: boolean) {
  const channels: ("EMAIL" | "SMS")[] = [];
  if (email) channels.push("EMAIL");
  if (sms) channels.push("SMS");
  return channels;
}
```

## CSV: csvCell

Source: [src/lib/reports.ts:67](../src/lib/reports.ts).

![CSV control flow graph](graphs/csv.png)

```mermaid
flowchart TD
  n1([1 Start])
  n2{2 Value present?}
  n3[3 Convert to text]
  n4{4 Formula prefix?}
  n5[5 Add apostrophe]
  n6[6 Quote and escape]
  n7([7 Exit])
  n1 --> n2
  n2 -->|Yes| n3
  n2 -->|No| n4
  n3 --> n4
  n4 -->|Yes| n5
  n4 -->|No| n6
  n5 --> n6
  n6 --> n7
```

N = 7, E = 8, P = 2.

1. Edges and nodes: 8 - 7 + 2 = **3**.
2. Predicate nodes: 2 + 1 = **3**.
3. Regions: 2 bounded regions + 1 outside region = **3**.

| Path | Nodes | Test input and expected result |
|---|---|---|
| CSV P1 | 1,2,4,6,7 | null => empty quoted cell |
| CSV P2 | 1,2,3,4,6,7 | Plain text => quoted text |
| CSV P3 | 1,2,3,4,5,6,7 | =HYPERLINK(1) => escaped formula |

Pseudocode:

```text
SET text to an empty string
IF Value present? THEN Convert to text
IF Formula prefix? THEN Add apostrophe
Quote and escape
END
```

Production routine:

```typescript
export function csvCell(value: unknown) {
  let text = "";
  if (value != null) text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
```

The NOTIFY suite also tests both channels together. The CSV formula path passes through the value conversion node before the formula guard. The empty-value path cannot reach the formula branch because its text is empty. The tests include exact lock expiry and the full description and image boundaries.

Run `npm run docs:whitebox`, then `npm run test:coverage`. See [test results](evidence/Test_Results.md). A failed test or changed decision count requires a new review.