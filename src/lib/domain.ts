import { z } from "zod";
import { AppError } from "./errors";
import { priorityHours } from "./policies";

export const ROLES = [
  "STUDENT",
  "STAFF",
  "TECHNICIAN",
  "FMD_DISPATCHER",
  "FMD_ADMIN",
] as const;
export type Role = (typeof ROLES)[number];
export const PRIORITIES = ["P1_CRITICAL", "P2_URGENT", "P3_ROUTINE"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const STATUSES = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
  "DUPLICATE",
  "REJECTED",
] as const;
export type TicketStatus = (typeof STATUSES)[number];
export const TRADES = [
  "ELECTRICAL",
  "PLUMBING",
  "HVAC_AIR_CONDITIONING",
  "CARPENTRY",
  "MASONRY_STRUCTURAL",
  "IT_AUDIOVISUAL",
  "GENERAL_CLEANING",
] as const;
export type Trade = (typeof TRADES)[number];
export const MAX_PHOTO_BYTES = 4_500_000;
export const SLA_HOURS: Record<Priority, number> = {
  P1_CRITICAL: 4,
  P2_URGENT: 24,
  P3_ROUTINE: 72,
};
export const ACTIVE_STATUSES: TicketStatus[] = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
];
export const isManager = (role: Role) =>
  role === "FMD_ADMIN" || role === "FMD_DISPATCHER";
export const isReporter = (role: Role) =>
  role === "STUDENT" || role === "STAFF";
export function slaDeadline(createdAt: Date | string, priority: Priority) {
  return new Date(
    new Date(createdAt).getTime() + priorityHours(priority) * 3_600_000,
  );
}
export const label = (value: string) =>
  ({
    FMD_ADMIN: "Administrator",
    FMD_DISPATCHER: "Dispatcher",
    HVAC_AIR_CONDITIONING: "Air conditioning",
    IT_AUDIOVISUAL: "IT and classroom equipment",
    MASONRY_STRUCTURAL: "Buildings and grounds",
    GENERAL_CLEANING: "Cleaning",
    P1_CRITICAL: "Critical",
    P2_URGENT: "Urgent",
    P3_ROUTINE: "Routine",
  })[value] ??
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
export const facultyLabel: Record<string, string> = {
  FENC: "Engineering and Computing",
  FOBM: "Business and Management",
  FOSS: "Science and Sport",
  COHS: "Health Sciences",
  CML: "Calvin McKain Library",
  RES: "Student residences",
};
export const ticketInput = z.object({
  categoryId: z.uuid(),
  locationId: z.uuid(),
  title: z
    .string()
    .trim()
    .min(1, "Enter a title.")
    .max(150, "Use 150 characters or fewer."),
  description: z
    .string()
    .trim()
    .min(15, "Use at least 15 characters.")
    .max(500, "Use 500 characters or fewer."),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]),
  attachmentId: z.uuid().optional(),
  submissionKey: z.uuid(),
});
export const loginInput = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Enter your email or university ID.")
    .max(150),
  password: z.string().min(1, "Enter your password.").max(128),
});
export const actionInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    version: z.number().int(),
    priority: z.enum(PRIORITIES),
    technicianId: z.union([z.uuid(), z.literal("auto")]),
  }),
  z.object({ action: z.literal("start"), version: z.number().int() }),
  z.object({
    action: z.literal("log"),
    version: z.number().int(),
    notes: z.string().trim().min(3).max(2000),
    parts: z.string().trim().max(1000),
    laborMinutes: z.number().int().min(0).max(1440),
  }),
  z.object({
    action: z.literal("complete"),
    version: z.number().int(),
    notes: z
      .string()
      .trim()
      .min(10, "Use at least 10 characters for repair notes.")
      .max(2000),
    attachmentId: z.uuid(),
  }),
  z.object({ action: z.literal("close"), version: z.number().int() }),
  z.object({
    action: z.literal("dispute"),
    version: z.number().int(),
    reason: z.string().trim().min(10).max(1000),
  }),
  z.object({
    action: z.literal("reject"),
    version: z.number().int(),
    reason: z.string().trim().min(10).max(1000),
  }),
  z.object({
    action: z.literal("merge"),
    version: z.number().int(),
    masterId: z.string().regex(/^CF-\d{4}-\d{4,}$/),
    reason: z.string().trim().min(10).max(1000),
  }),
  z.object({ action: z.literal("follow") }),
  z.object({
    action: z.literal("comment"),
    body: z.string().trim().min(1).max(2000),
  }),
]);
export type TicketAction = z.infer<typeof actionInput>;
export type TicketInput = z.infer<typeof ticketInput>;
export interface User {
  user_id: string;
  institutional_id: string;
  full_name: string;
  email: string;
  role: Role;
  phone_number: string;
  pref_email: boolean;
  pref_sms: boolean;
  pref_in_app: boolean;
  is_active: boolean;
}
export interface Category {
  category_id: string;
  category_name: string;
  trade_specialty: Trade;
  default_priority: Priority;
  is_active: boolean;
}
export interface Location {
  location_id: string;
  faculty_code: string;
  building_name: string;
  room_number: string;
  is_active: boolean;
}
export interface Technician {
  tech_id: string;
  full_name: string;
  trade_specialty: Trade;
  active_workload: number;
  is_available: boolean;
  is_active: boolean;
}
export interface Ticket {
  ticket_id: string;
  reporter_id: string;
  category_id: string;
  location_id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  assigned_tech_id: string | null;
  reporter_urgency: string;
  duplicate_of: string | null;
  version: number;
  created_at: string;
  assigned_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  sla_deadline: string;
  category_name: string;
  faculty_code: string;
  building_name: string;
  room_number: string;
  reporter_name: string;
  technician_name: string | null;
  resolution_notes: string | null;
  is_following?: boolean;
}
export interface TicketDetail {
  ticket: Ticket;
  comments: {
    comment_id: string;
    full_name: string;
    body: string;
    created_at: string;
  }[];
  activity: {
    audit_id: string;
    full_name: string | null;
    event_code: string;
    details: string;
    created_at: string;
  }[];
  logs: {
    log_id: string;
    full_name: string;
    action_description: string;
    parts_consumed: string;
    labor_minutes: number;
    logged_at: string;
  }[];
  attachments: {
    attachment_id: string;
    phase: "BEFORE" | "AFTER";
    original_name: string;
    content_type: string;
    byte_size: number;
  }[];
}
export function canReadTicket(
  user: User,
  ticket: Pick<Ticket, "reporter_id" | "assigned_tech_id">,
  follows: boolean,
) {
  return (
    isManager(user.role) ||
    (user.role === "TECHNICIAN"
      ? ticket.assigned_tech_id === user.user_id
      : ticket.reporter_id === user.user_id || follows)
  );
}
export function validatePhotoSize(size: number) {
  if (!Number.isInteger(size))
    throw new AppError("The photo size must be a whole number of bytes.");
  if (size < 1) throw new AppError("The photo cannot be empty.");
  if (size > MAX_PHOTO_BYTES)
    throw new AppError("The photo must be 4.5 MB or smaller.");
}
export function formatDate(value: string | Date | null) {
  return value
    ? new Intl.DateTimeFormat("en-JM", {
        timeZone: "America/Jamaica",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "Not yet";
}
