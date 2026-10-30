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
