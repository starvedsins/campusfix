ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN pref_in_app BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tickets ADD COLUMN reporter_urgency VARCHAR(10) NOT NULL DEFAULT 'LOW' CHECK (reporter_urgency IN ('LOW','MEDIUM','HIGH'));
ALTER TABLE tickets ADD COLUMN duplicate_of VARCHAR(15) REFERENCES tickets(ticket_id);
ALTER TABLE tickets ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE tickets ADD COLUMN submission_key UUID UNIQUE;
ALTER TABLE tickets ADD CONSTRAINT chk_description_length CHECK (char_length(description) BETWEEN 15 AND 500);
ALTER TABLE tickets ADD CONSTRAINT chk_title_length CHECK (char_length(title) BETWEEN 1 AND 150);
ALTER TABLE tickets ADD CONSTRAINT chk_not_self_duplicate CHECK (duplicate_of IS DISTINCT FROM ticket_id);
ALTER TABLE tickets ADD CONSTRAINT chk_assigned_state CHECK (status NOT IN ('ASSIGNED','IN_PROGRESS') OR assigned_tech_id IS NOT NULL);
ALTER TABLE tickets ADD CONSTRAINT chk_completion CHECK (status NOT IN ('COMPLETED','CLOSED') OR (resolved_at IS NOT NULL AND after_photo_uri IS NOT NULL AND char_length(resolution_notes) >= 10));
ALTER TABLE work_order_logs ADD CONSTRAINT chk_labor CHECK (labor_minutes BETWEEN 0 AND 1440);
ALTER TABLE categories ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE SEQUENCE ticket_number_seq START 1001;

CREATE TABLE sessions (
  session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE attachments (
  attachment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(user_id),
  ticket_id VARCHAR(15) REFERENCES tickets(ticket_id),
  phase VARCHAR(10) NOT NULL CHECK (phase IN ('BEFORE','AFTER')),
  storage_key TEXT NOT NULL UNIQUE,
  original_name VARCHAR(200) NOT NULL,
  content_type VARCHAR(30) NOT NULL CHECK (content_type IN ('image/jpeg','image/png')),
  byte_size INT NOT NULL CHECK (byte_size BETWEEN 1 AND 4500000),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_attachments_ticket ON attachments(ticket_id);
CREATE TABLE ticket_comments (
  comment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id VARCHAR(15) NOT NULL REFERENCES tickets(ticket_id),
  author_id UUID NOT NULL REFERENCES users(user_id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  ticket_id VARCHAR(15) REFERENCES tickets(ticket_id),
  event_code VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id,created_at DESC);
CREATE TABLE notification_deliveries (
  delivery_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID NOT NULL REFERENCES notifications(notification_id),
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('EMAIL','SMS')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','TEST_RECORDED','FAILED')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  UNIQUE(notification_id,channel)
);
CREATE TABLE background_jobs (
  job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind VARCHAR(30) NOT NULL CHECK (kind IN ('NOTIFICATIONS','AUTO_CLOSE')),
  ticket_id VARCHAR(15) REFERENCES tickets(ticket_id),
  ticket_version INT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(15) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','STARTED','DONE','FAILED')),
  workflow_run_id TEXT,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_background_jobs_pending ON background_jobs(status,available_at);
CREATE INDEX idx_tickets_duplicate_search ON tickets(location_id,category_id,created_at DESC) WHERE status IN ('PENDING','ASSIGNED','IN_PROGRESS');
CREATE INDEX idx_subscribers_user ON ticket_subscribers(user_id);
CREATE INDEX idx_audit_ticket ON audit_logs(ticket_id,created_at);
CREATE INDEX idx_audit_login_ip ON audit_logs(ip_address,created_at) WHERE event_code='LOGIN_FAILED';

CREATE OR REPLACE FUNCTION prevent_audit_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit records cannot be changed or removed'; END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_audit_changes();
