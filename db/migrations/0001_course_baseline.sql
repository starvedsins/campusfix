-- =============================================================================
-- UNIVERSITY OF TECHNOLOGY, JAMAICA
-- SCHOOL OF COMPUTING AND INFORMATION TECHNOLOGY
-- MODULE: CIT4001 - SOFTWARE IMPLEMENTATION
-- PROGRAMME MANUAL: DATA DESIGN & DATABASE STRUCTURE [100 MARKS]
-- PROJECT: CAMPUSFIX (UNIVERSITY ISSUES & MAINTENANCE REPORTING SYSTEM)
-- DBMS TARGET: PostgreSQL 16 / Relational SQL Standard
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1.0 ENUM TYPES & DOMAIN CONSTRAINTS
-- -----------------------------------------------------------------------------

CREATE TYPE user_role_enum AS ENUM (
    'STUDENT',
    'STAFF',
    'TECHNICIAN',
    'FMD_DISPATCHER',
    'FMD_ADMIN'
);

CREATE TYPE ticket_priority_enum AS ENUM (
    'P1_CRITICAL',   -- Safety hazard / 4-hour SLA
    'P2_URGENT',     -- Disruptive fault / 24-hour SLA
    'P3_ROUTINE'     -- Standard maintenance / 72-hour SLA
);

CREATE TYPE ticket_status_enum AS ENUM (
    'PENDING',       -- Logged by reporter, awaiting triage
    'ASSIGNED',      -- Allocated to trade technician
    'IN_PROGRESS',   -- Tech on-site, work underway
    'COMPLETED',     -- Work done, awaiting user verification
    'CLOSED',        -- Sign-off confirmed, ticket closed
    'DUPLICATE',     -- Merged into existing master ticket
    'REJECTED'       -- Out of scope or invalid report
);

CREATE TYPE trade_specialty_enum AS ENUM (
    'ELECTRICAL',
    'PLUMBING',
    'HVAC_AIR_CONDITIONING',
    'CARPENTRY',
    'MASONRY_STRUCTURAL',
    'IT_AUDIOVISUAL',
    'GENERAL_CLEANING'
);

-- -----------------------------------------------------------------------------
-- 2.0 RELATIONAL TABLE STRUCTURES
-- -----------------------------------------------------------------------------

-- 2.1 USERS TABLE
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institutional_id VARCHAR(20) NOT NULL UNIQUE,       -- e.g. UTech ID '2401430'
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone_number VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,                -- bcrypt salted hash
    role user_role_enum NOT NULL DEFAULT 'STUDENT',
    failed_attempts INT NOT NULL DEFAULT 0,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    pref_email BOOLEAN NOT NULL DEFAULT TRUE,
    pref_sms BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_email_domain CHECK (email LIKE '%@utech.edu.jm' OR email LIKE '%@utechstudents.edu.jm')
);

-- 2.2 LOCATIONS TABLE (Hierarchical Campus Infrastructure)
CREATE TABLE locations (
    location_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_code VARCHAR(10) NOT NULL,                  -- FENC, FOBM, FOSS, COHS, CML, RES
    building_name VARCHAR(80) NOT NULL,                 -- e.g. 'SCIT Building 2B'
    room_number VARCHAR(30) NOT NULL,                   -- e.g. 'Room 2B-08 (Lab 3)'
    floor_level INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_location UNIQUE (faculty_code, building_name, room_number)
);

-- 2.3 MAINTENANCE CATEGORIES TABLE
CREATE TABLE categories (
    category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(60) NOT NULL UNIQUE,
    trade_specialty trade_specialty_enum NOT NULL,
    default_priority ticket_priority_enum NOT NULL DEFAULT 'P3_ROUTINE',
    default_sla_hours INT NOT NULL DEFAULT 72
);

-- 2.4 TECHNICIANS PROFILE TABLE
CREATE TABLE technicians (
    tech_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    trade_specialty trade_specialty_enum NOT NULL,
    active_workload INT NOT NULL DEFAULT 0,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    license_certification VARCHAR(100),
    CONSTRAINT chk_workload_non_negative CHECK (active_workload >= 0)
);

-- 2.5 TICKETS TABLE (Core Transactional Table)
CREATE TABLE tickets (
    ticket_id VARCHAR(15) PRIMARY KEY,                  -- e.g. 'CF-2026-1049'
    reporter_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES locations(location_id) ON DELETE RESTRICT,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    priority ticket_priority_enum NOT NULL DEFAULT 'P3_ROUTINE',
    status ticket_status_enum NOT NULL DEFAULT 'PENDING',
    assigned_tech_id UUID REFERENCES technicians(tech_id) ON DELETE SET NULL,
    before_photo_uri VARCHAR(500),                      -- Secure Storage path
    after_photo_uri VARCHAR(500),                       -- Proof of completion
    resolution_notes TEXT,
    sla_deadline TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_description_min_length CHECK (LENGTH(description) >= 15)
);

-- 2.6 TICKET SUBSCRIBERS TABLE (Duplicate Report Consolidation)
CREATE TABLE ticket_subscribers (
    ticket_id VARCHAR(15) NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id, user_id)
);

-- 2.7 WORK ORDER LABOR & PARTS LOG
CREATE TABLE work_order_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id VARCHAR(15) NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
    tech_id UUID NOT NULL REFERENCES technicians(tech_id) ON DELETE RESTRICT,
    action_description TEXT NOT NULL,
    parts_consumed TEXT,
    labor_minutes INT NOT NULL DEFAULT 0,
    logged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2.8 AUDIT LOGS TABLE (Regulatory & Security Compliance)
CREATE TABLE audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    event_code VARCHAR(50) NOT NULL,                    -- e.g. 'TICKET_DISPATCHED', 'LOGIN_FAILED'
    ticket_id VARCHAR(15),
    details TEXT NOT NULL,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3.0 INDEXES FOR QUERY OPTIMIZATION
-- -----------------------------------------------------------------------------

CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_location ON tickets(location_id);
CREATE INDEX idx_tickets_tech ON tickets(assigned_tech_id);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_locations_faculty ON locations(faculty_code);
CREATE INDEX idx_users_email ON users(email);

-- -----------------------------------------------------------------------------
-- 4.0 ANALYTICAL REPORTING VIEWS
-- -----------------------------------------------------------------------------

-- 4.1 ACTIVE DISPATCH QUEUE VIEW
CREATE OR REPLACE VIEW vw_active_dispatch_queue AS
SELECT 
    t.ticket_id,
    t.priority,
    t.status,
    c.category_name,
    l.faculty_code,
    l.building_name,
    l.room_number,
    u.full_name AS reporter_name,
    u.phone_number AS reporter_phone,
    tech_user.full_name AS assigned_technician,
    t.sla_deadline,
    CASE 
        WHEN CURRENT_TIMESTAMP > t.sla_deadline AND t.status NOT IN ('COMPLETED', 'CLOSED') 
        THEN TRUE ELSE FALSE 
    END AS is_sla_breached
FROM tickets t
JOIN categories c ON t.category_id = c.category_id
JOIN locations l ON t.location_id = l.location_id
JOIN users u ON t.reporter_id = u.user_id
LEFT JOIN users tech_user ON t.assigned_tech_id = tech_user.user_id
WHERE t.status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS');

-- 4.2 SLA COMPLIANCE SUMMARY BY FACULTY
CREATE OR REPLACE VIEW vw_faculty_sla_compliance AS
SELECT 
    l.faculty_code,
    COUNT(t.ticket_id) AS total_tickets,
    COUNT(CASE WHEN t.status IN ('COMPLETED', 'CLOSED') AND t.resolved_at <= t.sla_deadline THEN 1 END) AS on_time_resolutions,
    COUNT(CASE WHEN t.status IN ('COMPLETED', 'CLOSED') AND t.resolved_at > t.sla_deadline THEN 1 END) AS overdue_resolutions,
    ROUND(
        (COUNT(CASE WHEN t.status IN ('COMPLETED', 'CLOSED') AND t.resolved_at <= t.sla_deadline THEN 1 END)::NUMERIC / 
        NULLIF(COUNT(CASE WHEN t.status IN ('COMPLETED', 'CLOSED') THEN 1 END), 0)::NUMERIC) * 100, 2
    ) AS sla_compliance_percentage
FROM tickets t
JOIN locations l ON t.location_id = l.location_id
GROUP BY l.faculty_code;

-- =============================================================================
-- END OF DATABASE DATA DESIGN SPECIFICATION
-- =============================================================================
