-- FreightBid Platform — Complete PostgreSQL Schema
-- Run: psql $DATABASE_URL -f 001_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── ENUMS ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM('super_admin','procurement_manager','logistics_team','finance_team','vendor_user','management_viewer');
  EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE vendor_status AS ENUM('pending','active','blocked','suspended');
  EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE rfq_status AS ENUM('draft','open','bidding','bid_closed','awarded','po_issued','cancelled');
  EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE po_status AS ENUM('draft','pending_approval','approved','sent_to_vendor','confirmed','in_transit','delivered','closed','cancelled');
  EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE award_status AS ENUM('pending_approval','approved','po_generated','vendor_confirmed','dispatched','delivered','cancelled');
  EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── USERS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_code         VARCHAR(30) UNIQUE,
  full_name             VARCHAR(120) NOT NULL,
  email                 VARCHAR(200) NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  role                  user_role NOT NULL DEFAULT 'logistics_team',
  department            VARCHAR(80),
  mobile                VARCHAR(20),
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at         TIMESTAMPTZ,
  password_reset_token  TEXT,
  password_reset_expires TIMESTAMPTZ,
  sap_user_id           VARCHAR(50),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── VENDORS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_code       VARCHAR(30) UNIQUE,
  vendor_name       VARCHAR(200) NOT NULL,
  contact_person    VARCHAR(120),
  mobile            VARCHAR(20),
  email             VARCHAR(200) NOT NULL UNIQUE,
  alternate_email   VARCHAR(200),
  gst_number        VARCHAR(22) UNIQUE,
  pan_number        VARCHAR(15),
  address_line1     VARCHAR(200),
  city              VARCHAR(80),
  state             VARCHAR(80),
  pincode           VARCHAR(10),
  payment_terms     VARCHAR(80) DEFAULT 'Net 30',
  performance_rating NUMERIC(3,2) DEFAULT 0,
  status            vendor_status NOT NULL DEFAULT 'pending',
  is_blacklisted    BOOLEAN NOT NULL DEFAULT FALSE,
  blacklist_reason  TEXT,
  onboarded_at      TIMESTAMPTZ,
  onboarded_by      UUID REFERENCES users(id),
  sap_vendor_id     VARCHAR(20),
  portal_user_id    UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── VEHICLE TYPES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_types (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category      VARCHAR(30) NOT NULL UNIQUE,
  display_name  VARCHAR(80) NOT NULL,
  capacity_tons NUMERIC(8,2),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── LOCATIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(120) NOT NULL,
  city        VARCHAR(80) NOT NULL,
  state       VARCHAR(80) NOT NULL,
  pincode     VARCHAR(10),
  sap_plant_id VARCHAR(10),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── APPROVAL MATRIX ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_matrix (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module        VARCHAR(50) NOT NULL,
  amount_from   NUMERIC(14,2),
  amount_to     NUMERIC(14,2),
  approver_role user_role NOT NULL,
  level         INT NOT NULL DEFAULT 1,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── RFQ HEADER ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfq_header (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_number              VARCHAR(25) UNIQUE,
  shipment_date           DATE,
  dispatch_location_id    UUID REFERENCES locations(id),
  dispatch_location_text  VARCHAR(200) NOT NULL,
  delivery_location_id    UUID REFERENCES locations(id),
  delivery_location_text  VARCHAR(200) NOT NULL,
  vehicle_type_id         UUID REFERENCES vehicle_types(id),
  vehicle_type_text       VARCHAR(80),
  material_type           VARCHAR(120),
  quantity                NUMERIC(12,3),
  quantity_unit           VARCHAR(20) DEFAULT 'MT',
  weight_mt               NUMERIC(12,3),
  special_handling        TEXT,
  expected_dispatch_time  TIMESTAMPTZ,
  bid_open_time           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bid_close_time          TIMESTAMPTZ NOT NULL,
  target_budget           NUMERIC(14,2),
  internal_remarks        TEXT,
  status                  rfq_status NOT NULL DEFAULT 'draft',
  min_decrement           NUMERIC(14,2) DEFAULT 500,
  max_revisions_per_vendor INT DEFAULT 5,
  l1_visibility           VARCHAR(30) DEFAULT 'rank_only',
  auto_extend_minutes     INT DEFAULT 5,
  created_by              UUID NOT NULL REFERENCES users(id),
  closed_by               UUID REFERENCES users(id),
  closed_at               TIMESTAMPTZ,
  sap_rfq_number          VARCHAR(20),
  sap_pr_number           VARCHAR(20),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RFQ VENDOR MAPPING ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfq_vendor_mapping (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id          UUID NOT NULL REFERENCES rfq_header(id) ON DELETE CASCADE,
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invite_sent     BOOLEAN DEFAULT FALSE,
  email_sent_at   TIMESTAMPTZ,
  viewed_at       TIMESTAMPTZ,
  is_participating BOOLEAN DEFAULT FALSE,
  declined        BOOLEAN DEFAULT FALSE,
  UNIQUE(rfq_id, vendor_id)
);

-- ── BID TRANSACTIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS bid_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id          UUID NOT NULL REFERENCES rfq_header(id),
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  quote_amount    NUMERIC(14,2) NOT NULL CHECK(quote_amount > 0),
  revision_number INT NOT NULL DEFAULT 1,
  is_current      BOOLEAN NOT NULL DEFAULT TRUE,
  rank            INT,
  previous_amount NUMERIC(14,2),
  decrement_amount NUMERIC(14,2),
  remarks         TEXT,
  ip_address      VARCHAR(45),
  quoted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AWARD DETAILS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS award_details (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id          UUID NOT NULL REFERENCES rfq_header(id) UNIQUE,
  winning_bid_id  UUID NOT NULL REFERENCES bid_transactions(id),
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  awarded_amount  NUMERIC(14,2) NOT NULL,
  budget_amount   NUMERIC(14,2),
  savings_amount  NUMERIC(14,2),
  savings_pct     NUMERIC(6,3),
  status          award_status NOT NULL DEFAULT 'pending_approval',
  awarded_by      UUID REFERENCES users(id),
  awarded_at      TIMESTAMPTZ DEFAULT NOW(),
  remarks         TEXT,
  sap_po_number   VARCHAR(20),
  sap_sync_status VARCHAR(30) DEFAULT 'not_synced',
  sap_sync_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PURCHASE ORDERS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number       VARCHAR(25) UNIQUE,
  award_id        UUID NOT NULL REFERENCES award_details(id),
  rfq_id          UUID NOT NULL REFERENCES rfq_header(id),
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  po_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  po_amount       NUMERIC(14,2) NOT NULL,
  gst_amount      NUMERIC(14,2) DEFAULT 0,
  total_amount    NUMERIC(14,2) NOT NULL,
  payment_terms   VARCHAR(100),
  status          po_status NOT NULL DEFAULT 'pending_approval',
  issued_by       UUID REFERENCES users(id),
  issued_at       TIMESTAMPTZ,
  vendor_ack_at   TIMESTAMPTZ,
  expected_delivery DATE,
  actual_delivery DATE,
  remarks         TEXT,
  sap_po_number   VARCHAR(20),
  sap_sync_status VARCHAR(30) DEFAULT 'not_synced',
  sap_sync_payload JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SHIPMENT TRACKING ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipment_tracking (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id       UUID NOT NULL REFERENCES purchase_orders(id),
  status      VARCHAR(60) NOT NULL,
  location    VARCHAR(200),
  remarks     TEXT,
  updated_by  UUID REFERENCES users(id),
  tracked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── APPROVAL LOGS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module          VARCHAR(50) NOT NULL,
  reference_id    UUID NOT NULL,
  reference_type  VARCHAR(50) NOT NULL,
  level           INT NOT NULL DEFAULT 1,
  approver_id     UUID NOT NULL REFERENCES users(id),
  action          VARCHAR(20) NOT NULL DEFAULT 'pending',
  remarks         TEXT,
  acted_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SAP SYNC LOG ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sap_sync_log (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  direction        VARCHAR(10) NOT NULL,
  object_type      VARCHAR(50) NOT NULL,
  local_id         UUID NOT NULL,
  sap_object_id    VARCHAR(40),
  endpoint         VARCHAR(300),
  http_status      INT,
  request_payload  JSONB,
  response_payload JSONB,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  retry_count      INT DEFAULT 0,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

-- ── AUDIT TRAIL ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_trail (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name  VARCHAR(80) NOT NULL,
  record_id   UUID NOT NULL,
  action      VARCHAR(10) NOT NULL,
  changed_by  UUID REFERENCES users(id),
  old_values  JSONB,
  new_values  JSONB,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_vendors_code      ON vendors(vendor_code);
CREATE INDEX IF NOT EXISTS idx_vendors_email     ON vendors(email);
CREATE INDEX IF NOT EXISTS idx_vendors_status    ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_rfq_number        ON rfq_header(rfq_number);
CREATE INDEX IF NOT EXISTS idx_rfq_status        ON rfq_header(status);
CREATE INDEX IF NOT EXISTS idx_rfq_bid_close     ON rfq_header(bid_close_time);
CREATE INDEX IF NOT EXISTS idx_bid_rfq           ON bid_transactions(rfq_id);
CREATE INDEX IF NOT EXISTS idx_bid_vendor        ON bid_transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_bid_current       ON bid_transactions(rfq_id, vendor_id, is_current) WHERE is_current=TRUE;
CREATE INDEX IF NOT EXISTS idx_bid_time          ON bid_transactions(quoted_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_number         ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_po_status         ON purchase_orders(status);

-- ── SEQUENCES ──────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS rfq_seq  START 2001;
CREATE SEQUENCE IF NOT EXISTS po_seq   START 1001;
CREATE SEQUENCE IF NOT EXISTS vnd_seq  START 10001;

-- ── TRIGGERS ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_upd    ON users;
DROP TRIGGER IF EXISTS trg_vendors_upd  ON vendors;
DROP TRIGGER IF EXISTS trg_rfq_upd      ON rfq_header;
DROP TRIGGER IF EXISTS trg_award_upd    ON award_details;
DROP TRIGGER IF EXISTS trg_po_upd       ON purchase_orders;

CREATE TRIGGER trg_users_upd   BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_vendors_upd BEFORE UPDATE ON vendors         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_rfq_upd     BEFORE UPDATE ON rfq_header      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_award_upd   BEFORE UPDATE ON award_details   FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_po_upd      BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE FUNCTION fn_auto_rfq_number() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rfq_number IS NULL THEN
    NEW.rfq_number := 'RFQ-' || TO_CHAR(NOW(),'YYMM') || '-' || LPAD(NEXTVAL('rfq_seq')::TEXT,4,'0');
  END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_rfq_number ON rfq_header;
CREATE TRIGGER trg_rfq_number BEFORE INSERT ON rfq_header FOR EACH ROW EXECUTE FUNCTION fn_auto_rfq_number();

CREATE OR REPLACE FUNCTION fn_auto_po_number() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.po_number IS NULL THEN
    NEW.po_number := 'PO-' || TO_CHAR(NOW(),'YYMM') || '-' || LPAD(NEXTVAL('po_seq')::TEXT,4,'0');
  END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_po_number ON purchase_orders;
CREATE TRIGGER trg_po_number BEFORE INSERT ON purchase_orders FOR EACH ROW EXECUTE FUNCTION fn_auto_po_number();

CREATE OR REPLACE FUNCTION fn_auto_vendor_code() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vendor_code IS NULL THEN
    NEW.vendor_code := 'VND-' || NEXTVAL('vnd_seq')::TEXT;
  END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_vendor_code ON vendors;
CREATE TRIGGER trg_vendor_code BEFORE INSERT ON vendors FOR EACH ROW EXECUTE FUNCTION fn_auto_vendor_code();

CREATE OR REPLACE FUNCTION fn_rank_bids() RETURNS TRIGGER AS $$
BEGIN
  UPDATE bid_transactions SET is_current=FALSE
  WHERE rfq_id=NEW.rfq_id AND vendor_id=NEW.vendor_id AND id!=NEW.id;
  UPDATE bid_transactions bt SET rank=ranked.rn
  FROM (SELECT id, ROW_NUMBER() OVER(ORDER BY quote_amount ASC) AS rn
        FROM bid_transactions WHERE rfq_id=NEW.rfq_id AND is_current=TRUE) ranked
  WHERE bt.id=ranked.id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_rank_bids ON bid_transactions;
CREATE TRIGGER trg_rank_bids AFTER INSERT ON bid_transactions FOR EACH ROW EXECUTE FUNCTION fn_rank_bids();

CREATE OR REPLACE FUNCTION fn_calc_savings() RETURNS TRIGGER AS $$
DECLARE v_budget NUMERIC(14,2);
BEGIN
  SELECT target_budget INTO v_budget FROM rfq_header WHERE id=NEW.rfq_id;
  IF v_budget IS NOT NULL AND v_budget > 0 THEN
    NEW.savings_amount := v_budget - NEW.awarded_amount;
    NEW.savings_pct    := ROUND(((v_budget - NEW.awarded_amount)/v_budget)*100, 3);
    NEW.budget_amount  := v_budget;
  END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_calc_savings ON award_details;
CREATE TRIGGER trg_calc_savings BEFORE INSERT OR UPDATE ON award_details FOR EACH ROW EXECUTE FUNCTION fn_calc_savings();

-- ── SEED DATA ──────────────────────────────────────────────
INSERT INTO vehicle_types (category, display_name, capacity_tons) VALUES
  ('mini_2t',       'Mini Truck 2T',    2.0),
  ('truck_7_5t',    'Truck 7.5T',       7.5),
  ('truck_10t',     'Truck 10T',       10.0),
  ('trailer_20t',   'Trailer 20T',     20.0),
  ('reefer_12t',    'Reefer 12T',      12.0),
  ('container_14t', 'Container 14T',   14.0),
  ('flatbed',       'Flatbed Truck',   16.0),
  ('tanker',        'Tanker',          20.0)
ON CONFLICT (category) DO NOTHING;

INSERT INTO approval_matrix (module, amount_from, amount_to, approver_role, level) VALUES
  ('rfq_award', 0,      50000,  'procurement_manager', 1),
  ('rfq_award', 50000,  200000, 'procurement_manager', 1),
  ('rfq_award', 50000,  200000, 'finance_team',        2),
  ('rfq_award', 200000, NULL,   'procurement_manager', 1),
  ('rfq_award', 200000, NULL,   'finance_team',        2),
  ('po_approval', 0,    100000, 'procurement_manager', 1),
  ('po_approval', 100000, NULL, 'finance_team',        1)
ON CONFLICT DO NOTHING;
