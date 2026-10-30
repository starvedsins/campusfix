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
