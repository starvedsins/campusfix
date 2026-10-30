import {
  pgTable,
  text,
  timestamp,
  foreignKey,
  check,
  uuid,
  integer,
  boolean,
  varchar,
  index,
  unique,
  inet,
  char,
  primaryKey,
  pgView,
  bigint,
  numeric,
  pgSequence,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const ticketPriorityEnum = pgEnum("ticket_priority_enum", [
  "P1_CRITICAL",
  "P2_URGENT",
  "P3_ROUTINE",
]);
export const ticketStatusEnum = pgEnum("ticket_status_enum", [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
  "DUPLICATE",
  "REJECTED",
]);
export const tradeSpecialtyEnum = pgEnum("trade_specialty_enum", [
  "ELECTRICAL",
  "PLUMBING",
  "HVAC_AIR_CONDITIONING",
  "CARPENTRY",
  "MASONRY_STRUCTURAL",
  "IT_AUDIOVISUAL",
  "GENERAL_CLEANING",
]);
export const userRoleEnum = pgEnum("user_role_enum", [
  "STUDENT",
  "STAFF",
  "TECHNICIAN",
  "FMD_DISPATCHER",
  "FMD_ADMIN",
]);

export const ticketNumberSeq = pgSequence("ticket_number_seq", {
  startWith: "1001",
  increment: "1",
  minValue: "1",
  maxValue: "9223372036854775807",
  cache: "1",
  cycle: false,
});

export const campusfixMigrations = pgTable("campusfix_migrations", {
  name: text().primaryKey().notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
});

export const technicians = pgTable(
  "technicians",
  {
    techId: uuid("tech_id").primaryKey().notNull(),
    tradeSpecialty: tradeSpecialtyEnum("trade_specialty").notNull(),
    activeWorkload: integer("active_workload").default(0).notNull(),
    isAvailable: boolean("is_available").default(true).notNull(),
    licenseCertification: varchar("license_certification", { length: 100 }),
  },
  (table) => [
    foreignKey({
      columns: [table.techId],
      foreignColumns: [users.userId],
      name: "technicians_tech_id_fkey",
    }).onDelete("cascade"),
    check("chk_workload_non_negative", sql`active_workload >= 0`),
  ],
);

export const users = pgTable(
  "users",
  {
    userId: uuid("user_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    institutionalId: varchar("institutional_id", { length: 20 }).notNull(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    email: varchar({ length: 150 }).notNull(),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: userRoleEnum().default("STUDENT").notNull(),
    failedAttempts: integer("failed_attempts").default(0).notNull(),
    isLocked: boolean("is_locked").default(false).notNull(),
    prefEmail: boolean("pref_email").default(true).notNull(),
    prefSms: boolean("pref_sms").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    lockedUntil: timestamp("locked_until", {
      withTimezone: true,
      mode: "string",
    }),
    isActive: boolean("is_active").default(true).notNull(),
    prefInApp: boolean("pref_in_app").default(true).notNull(),
  },
  (table) => [
    index("idx_users_email").using(
      "btree",
      table.email.asc().nullsLast().op("text_ops"),
    ),
    unique("users_institutional_id_key").on(table.institutionalId),
    unique("users_email_key").on(table.email),
    check(
      "chk_email_domain",
      sql`((email)::text ~~ '%@utech.edu.jm'::text) OR ((email)::text ~~ '%@utechstudents.edu.jm'::text)`,
    ),
  ],
);

export const locations = pgTable(
  "locations",
  {
    locationId: uuid("location_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    facultyCode: varchar("faculty_code", { length: 10 }).notNull(),
    buildingName: varchar("building_name", { length: 80 }).notNull(),
    roomNumber: varchar("room_number", { length: 30 }).notNull(),
    floorLevel: integer("floor_level").default(1).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [
    index("idx_locations_faculty").using(
      "btree",
      table.facultyCode.asc().nullsLast().op("text_ops"),
    ),
    unique("uq_location").on(
      table.facultyCode,
      table.buildingName,
      table.roomNumber,
    ),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    ticketId: varchar("ticket_id", { length: 15 }).primaryKey().notNull(),
    reporterId: uuid("reporter_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    locationId: uuid("location_id").notNull(),
    title: varchar({ length: 150 }).notNull(),
    description: text().notNull(),
    priority: ticketPriorityEnum().default("P3_ROUTINE").notNull(),
    status: ticketStatusEnum().default("PENDING").notNull(),
    assignedTechId: uuid("assigned_tech_id"),
    beforePhotoUri: varchar("before_photo_uri", { length: 500 }),
    afterPhotoUri: varchar("after_photo_uri", { length: 500 }),
    resolutionNotes: text("resolution_notes"),
    slaDeadline: timestamp("sla_deadline", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    assignedAt: timestamp("assigned_at", {
      withTimezone: true,
      mode: "string",
    }),
    resolvedAt: timestamp("resolved_at", {
      withTimezone: true,
      mode: "string",
    }),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    reporterUrgency: varchar("reporter_urgency", { length: 10 })
      .default("LOW")
      .notNull(),
    duplicateOf: varchar("duplicate_of", { length: 15 }),
    version: integer().default(1).notNull(),
    submissionKey: uuid("submission_key"),
  },
  (table) => [
    index("idx_tickets_created_at").using(
      "btree",
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("idx_tickets_duplicate_search")
      .using(
        "btree",
        table.locationId.asc().nullsLast().op("uuid_ops"),
        table.categoryId.asc().nullsLast().op("uuid_ops"),
        table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
      )
      .where(
        sql`(status = ANY (ARRAY['PENDING'::ticket_status_enum, 'ASSIGNED'::ticket_status_enum, 'IN_PROGRESS'::ticket_status_enum]))`,
      ),
    index("idx_tickets_location").using(
      "btree",
      table.locationId.asc().nullsLast().op("uuid_ops"),
    ),
    index("idx_tickets_priority").using(
      "btree",
      table.priority.asc().nullsLast().op("enum_ops"),
    ),
    index("idx_tickets_status").using(
      "btree",
      table.status.asc().nullsLast().op("enum_ops"),
    ),
    index("idx_tickets_tech").using(
      "btree",
      table.assignedTechId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.reporterId],
      foreignColumns: [users.userId],
      name: "tickets_reporter_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.categoryId],
      name: "tickets_category_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.locationId],
      foreignColumns: [locations.locationId],
      name: "tickets_location_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.assignedTechId],
      foreignColumns: [technicians.techId],
      name: "tickets_assigned_tech_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.duplicateOf],
      foreignColumns: [table.ticketId],
      name: "tickets_duplicate_of_fkey",
    }),
    unique("tickets_submission_key_key").on(table.submissionKey),
    check("chk_description_min_length", sql`length(description) >= 15`),
    check(
      "tickets_reporter_urgency_check",
      sql`(reporter_urgency)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying])::text[])`,
    ),
    check(
      "chk_description_length",
      sql`(char_length(description) >= 15) AND (char_length(description) <= 500)`,
    ),
    check(
      "chk_title_length",
      sql`(char_length((title)::text) >= 1) AND (char_length((title)::text) <= 150)`,
    ),
    check(
      "chk_not_self_duplicate",
      sql`(duplicate_of)::text IS DISTINCT FROM (ticket_id)::text`,
    ),
    check(
      "chk_assigned_state",
      sql`(status <> ALL (ARRAY['ASSIGNED'::ticket_status_enum, 'IN_PROGRESS'::ticket_status_enum])) OR (assigned_tech_id IS NOT NULL)`,
    ),
    check(
      "chk_completion",
      sql`(status <> ALL (ARRAY['COMPLETED'::ticket_status_enum, 'CLOSED'::ticket_status_enum])) OR ((resolved_at IS NOT NULL) AND (after_photo_uri IS NOT NULL) AND (char_length(resolution_notes) >= 10))`,
    ),
  ],
);

export const workOrderLogs = pgTable(
  "work_order_logs",
  {
    logId: uuid("log_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    ticketId: varchar("ticket_id", { length: 15 }).notNull(),
    techId: uuid("tech_id").notNull(),
    actionDescription: text("action_description").notNull(),
    partsConsumed: text("parts_consumed"),
    laborMinutes: integer("labor_minutes").default(0).notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [tickets.ticketId],
      name: "work_order_logs_ticket_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.techId],
      foreignColumns: [technicians.techId],
      name: "work_order_logs_tech_id_fkey",
    }).onDelete("restrict"),
    check("chk_labor", sql`(labor_minutes >= 0) AND (labor_minutes <= 1440)`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    auditId: uuid("audit_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    actorId: uuid("actor_id"),
    eventCode: varchar("event_code", { length: 50 }).notNull(),
    ticketId: varchar("ticket_id", { length: 15 }),
    details: text().notNull(),
    ipAddress: inet("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index("idx_audit_login_ip")
      .using(
        "btree",
        table.ipAddress.asc().nullsLast().op("timestamptz_ops"),
        table.createdAt.asc().nullsLast().op("inet_ops"),
      )
      .where(sql`((event_code)::text = 'LOGIN_FAILED'::text)`),
    index("idx_audit_ticket").using(
      "btree",
      table.ticketId.asc().nullsLast().op("timestamptz_ops"),
      table.createdAt.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [users.userId],
      name: "audit_logs_actor_id_fkey",
    }).onDelete("set null"),
  ],
);

export const categories = pgTable(
  "categories",
  {
    categoryId: uuid("category_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    categoryName: varchar("category_name", { length: 60 }).notNull(),
    tradeSpecialty: tradeSpecialtyEnum("trade_specialty").notNull(),
    defaultPriority: ticketPriorityEnum("default_priority")
      .default("P3_ROUTINE")
      .notNull(),
    defaultSlaHours: integer("default_sla_hours").default(72).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [unique("categories_category_name_key").on(table.categoryName)],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionId: uuid("session_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    userId: uuid("user_id").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_sessions_expiry").using(
      "btree",
      table.expiresAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "sessions_user_id_fkey",
    }).onDelete("cascade"),
    unique("sessions_token_hash_key").on(table.tokenHash),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    attachmentId: uuid("attachment_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    ownerId: uuid("owner_id").notNull(),
    ticketId: varchar("ticket_id", { length: 15 }),
    phase: varchar({ length: 10 }).notNull(),
    storageKey: text("storage_key").notNull(),
    originalName: varchar("original_name", { length: 200 }).notNull(),
    contentType: varchar("content_type", { length: 30 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    verified: boolean().default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_attachments_ticket").using(
      "btree",
      table.ticketId.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [users.userId],
      name: "attachments_owner_id_fkey",
    }),
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [tickets.ticketId],
      name: "attachments_ticket_id_fkey",
    }),
    unique("attachments_storage_key_key").on(table.storageKey),
    check(
      "attachments_phase_check",
      sql`(phase)::text = ANY ((ARRAY['BEFORE'::character varying, 'AFTER'::character varying])::text[])`,
    ),
    check(
      "attachments_content_type_check",
      sql`(content_type)::text = ANY ((ARRAY['image/jpeg'::character varying, 'image/png'::character varying])::text[])`,
    ),
    check(
      "attachments_byte_size_check",
      sql`(byte_size >= 1) AND (byte_size <= 4500000)`,
    ),
  ],
);

export const ticketComments = pgTable(
  "ticket_comments",
  {
    commentId: uuid("comment_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    ticketId: varchar("ticket_id", { length: 15 }).notNull(),
    authorId: uuid("author_id").notNull(),
    body: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [tickets.ticketId],
      name: "ticket_comments_ticket_id_fkey",
    }),
    foreignKey({
      columns: [table.authorId],
      foreignColumns: [users.userId],
      name: "ticket_comments_author_id_fkey",
    }),
    check(
      "ticket_comments_body_check",
      sql`(char_length(body) >= 1) AND (char_length(body) <= 2000)`,
    ),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    notificationId: uuid("notification_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    userId: uuid("user_id").notNull(),
    ticketId: varchar("ticket_id", { length: 15 }),
    eventCode: varchar("event_code", { length: 50 }).notNull(),
    title: varchar({ length: 150 }).notNull(),
    body: text().notNull(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_notifications_user").using(
      "btree",
      table.userId.asc().nullsLast().op("timestamptz_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "notifications_user_id_fkey",
    }),
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [tickets.ticketId],
      name: "notifications_ticket_id_fkey",
    }),
  ],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    deliveryId: uuid("delivery_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    notificationId: uuid("notification_id").notNull(),
    channel: varchar({ length: 10 }).notNull(),
    status: varchar({ length: 20 }).default("PENDING").notNull(),
    attempts: integer().default(0).notNull(),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (table) => [
    foreignKey({
      columns: [table.notificationId],
      foreignColumns: [notifications.notificationId],
      name: "notification_deliveries_notification_id_fkey",
    }),
    unique("notification_deliveries_notification_id_channel_key").on(
      table.notificationId,
      table.channel,
    ),
    check(
      "notification_deliveries_channel_check",
      sql`(channel)::text = ANY ((ARRAY['EMAIL'::character varying, 'SMS'::character varying])::text[])`,
    ),
    check(
      "notification_deliveries_status_check",
      sql`(status)::text = ANY ((ARRAY['PENDING'::character varying, 'TEST_RECORDED'::character varying, 'FAILED'::character varying])::text[])`,
    ),
  ],
);

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    jobId: uuid("job_id")
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    kind: varchar({ length: 30 }).notNull(),
    ticketId: varchar("ticket_id", { length: 15 }),
    ticketVersion: integer("ticket_version"),
    availableAt: timestamp("available_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    status: varchar({ length: 15 }).default("PENDING").notNull(),
    workflowRunId: text("workflow_run_id"),
    attempts: integer().default(0).notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_background_jobs_pending").using(
      "btree",
      table.status.asc().nullsLast().op("text_ops"),
      table.availableAt.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [tickets.ticketId],
      name: "background_jobs_ticket_id_fkey",
    }),
    check(
      "background_jobs_kind_check",
      sql`(kind)::text = ANY ((ARRAY['NOTIFICATIONS'::character varying, 'AUTO_CLOSE'::character varying])::text[])`,
    ),
    check(
      "background_jobs_status_check",
      sql`(status)::text = ANY ((ARRAY['PENDING'::character varying, 'STARTED'::character varying, 'DONE'::character varying, 'FAILED'::character varying])::text[])`,
    ),
  ],
);

export const ticketSubscribers = pgTable(
  "ticket_subscribers",
  {
    ticketId: varchar("ticket_id", { length: 15 }).notNull(),
    userId: uuid("user_id").notNull(),
    subscribedAt: timestamp("subscribed_at", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index("idx_subscribers_user").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [tickets.ticketId],
      name: "ticket_subscribers_ticket_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "ticket_subscribers_user_id_fkey",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.ticketId, table.userId],
      name: "ticket_subscribers_pkey",
    }),
  ],
);
export const vwActiveDispatchQueue = pgView("vw_active_dispatch_queue", {
  ticketId: varchar("ticket_id", { length: 15 }),
  priority: ticketPriorityEnum(),
  status: ticketStatusEnum(),
  categoryName: varchar("category_name", { length: 60 }),
  facultyCode: varchar("faculty_code", { length: 10 }),
  buildingName: varchar("building_name", { length: 80 }),
  roomNumber: varchar("room_number", { length: 30 }),
  reporterName: varchar("reporter_name", { length: 120 }),
  reporterPhone: varchar("reporter_phone", { length: 20 }),
  assignedTechnician: varchar("assigned_technician", { length: 120 }),
  slaDeadline: timestamp("sla_deadline", {
    withTimezone: true,
    mode: "string",
  }),
  isSlaBreached: boolean("is_sla_breached"),
}).as(
  sql`SELECT t.ticket_id, t.priority, t.status, c.category_name, l.faculty_code, l.building_name, l.room_number, u.full_name AS reporter_name, u.phone_number AS reporter_phone, tech_user.full_name AS assigned_technician, t.sla_deadline, CASE WHEN CURRENT_TIMESTAMP > t.sla_deadline AND (t.status <> ALL (ARRAY['COMPLETED'::ticket_status_enum, 'CLOSED'::ticket_status_enum])) THEN true ELSE false END AS is_sla_breached FROM tickets t JOIN categories c ON t.category_id = c.category_id JOIN locations l ON t.location_id = l.location_id JOIN users u ON t.reporter_id = u.user_id LEFT JOIN users tech_user ON t.assigned_tech_id = tech_user.user_id WHERE t.status = ANY (ARRAY['PENDING'::ticket_status_enum, 'ASSIGNED'::ticket_status_enum, 'IN_PROGRESS'::ticket_status_enum])`,
);

export const vwFacultySlaCompliance = pgView("vw_faculty_sla_compliance", {
  facultyCode: varchar("faculty_code", { length: 10 }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  totalTickets: bigint("total_tickets", { mode: "number" }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  onTimeResolutions: bigint("on_time_resolutions", { mode: "number" }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  overdueResolutions: bigint("overdue_resolutions", { mode: "number" }),
  slaCompliancePercentage: numeric("sla_compliance_percentage"),
}).as(
  sql`SELECT l.faculty_code, count(t.ticket_id) AS total_tickets, count( CASE WHEN (t.status = ANY (ARRAY['COMPLETED'::ticket_status_enum, 'CLOSED'::ticket_status_enum])) AND t.resolved_at <= t.sla_deadline THEN 1 ELSE NULL::integer END) AS on_time_resolutions, count( CASE WHEN (t.status = ANY (ARRAY['COMPLETED'::ticket_status_enum, 'CLOSED'::ticket_status_enum])) AND t.resolved_at > t.sla_deadline THEN 1 ELSE NULL::integer END) AS overdue_resolutions, round(count( CASE WHEN (t.status = ANY (ARRAY['COMPLETED'::ticket_status_enum, 'CLOSED'::ticket_status_enum])) AND t.resolved_at <= t.sla_deadline THEN 1 ELSE NULL::integer END)::numeric / NULLIF(count( CASE WHEN t.status = ANY (ARRAY['COMPLETED'::ticket_status_enum, 'CLOSED'::ticket_status_enum]) THEN 1 ELSE NULL::integer END), 0)::numeric * 100::numeric, 2) AS sla_compliance_percentage FROM tickets t JOIN locations l ON t.location_id = l.location_id GROUP BY l.faculty_code`,
);
