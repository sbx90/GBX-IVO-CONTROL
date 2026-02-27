-- =============================================================
-- IVO-KIT Inventory Management System — Full Database Schema
-- Run this entire script in the Supabase SQL Editor
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- SECTION A: ENUMS
-- ─────────────────────────────────────────────────────────────

CREATE TYPE kit_type AS ENUM ('NEW', 'RETURN');

CREATE TYPE kit_status AS ENUM ('OK', 'TICKET', 'DEAD');

CREATE TYPE component_type AS ENUM (
  'ENCLOSURE',
  'MAIN_BOARD',
  'CAMERA_A_140',
  'CAMERA_B_140',
  'CAMERA_C_70',
  'POWER_SUPPLY',
  'WIFI_ANTENNA',
  'CELL_ANTENNA',
  'DOOR_LOCK_CABLE'
);

CREATE TYPE component_status AS ENUM ('OK', 'FAULTY', 'REPLACED', 'DEAD');

CREATE TYPE mainboard_section AS ENUM (
  'CM4',
  'POWER_MAIN',
  'POWER_2',
  'USB3_1',
  'USB3_2',
  'USB3_3',
  'USB2_1',
  'USB2_2',
  'USB2_3',
  'CELL_MODULE',
  'WIFI_BT',
  'IO_LOCK',
  'HDMI',
  'TOP_CONNECTORS'
);

CREATE TYPE issue_category AS ENUM (
  'USB',
  'POWER',
  'CAMERA',
  'WIFI',
  'CELLULAR',
  'DOOR_LOCK',
  'CM4_PROCESSOR',
  'ENCLOSURE',
  'FIRMWARE',
  'WRONG_CONNECTOR',
  'OTHER'
);

CREATE TYPE ticket_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

CREATE TYPE ticket_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE production_status AS ENUM ('QUEUED', 'ACTIVE', 'COMPLETE', 'CANCELLED');

CREATE TYPE production_step_status AS ENUM ('PENDING', 'ACTIVE', 'DONE', 'SKIPPED');


-- ─────────────────────────────────────────────────────────────
-- SECTION B: TABLES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE kits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT NOT NULL UNIQUE,
  type          kit_type NOT NULL DEFAULT 'NEW',
  status        kit_status NOT NULL DEFAULT 'OK',
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kit_components (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id         UUID NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  component_type component_type NOT NULL,
  status         component_status NOT NULL DEFAULT 'OK',
  fault_category issue_category,
  serial_number  TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kit_id, component_type)
);

CREATE TABLE mainboard_sections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id   UUID NOT NULL REFERENCES kit_components(id) ON DELETE CASCADE,
  section_name   mainboard_section NOT NULL,
  status         component_status NOT NULL DEFAULT 'OK',
  issue_category issue_category,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(component_id, section_name)
);

CREATE TABLE tickets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number        SERIAL NOT NULL,
  kit_id               UUID NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  component_id         UUID REFERENCES kit_components(id) ON DELETE SET NULL,
  mainboard_section_id UUID REFERENCES mainboard_sections(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  priority             ticket_priority NOT NULL DEFAULT 'MEDIUM',
  status               ticket_status NOT NULL DEFAULT 'OPEN',
  issue_category       issue_category NOT NULL DEFAULT 'OTHER',
  assigned_to          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ticket_comments (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ticket_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  comment_id  UUID REFERENCES ticket_comments(id) ON DELETE SET NULL,
  file_url    TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  file_type   TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE production_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  quantity     INTEGER NOT NULL DEFAULT 1,
  status       production_status NOT NULL DEFAULT 'QUEUED',
  current_step INTEGER NOT NULL DEFAULT 1,
  target_date  DATE,
  notes        TEXT,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE production_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  step_number  INTEGER NOT NULL,
  step_name    TEXT NOT NULL,
  description  TEXT,
  status       production_step_status NOT NULL DEFAULT 'PENDING',
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id, step_number)
);

CREATE TABLE known_issues (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  solution       TEXT NOT NULL,
  board_section  mainboard_section,
  issue_category issue_category NOT NULL,
  component_type component_type,
  frequency      TEXT NOT NULL DEFAULT 'LOW' CHECK (frequency IN ('LOW', 'MEDIUM', 'HIGH')),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────
-- SECTION C: UPDATED_AT TRIGGERS
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kits_updated_at
  BEFORE UPDATE ON kits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER kit_components_updated_at
  BEFORE UPDATE ON kit_components
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER mainboard_sections_updated_at
  BEFORE UPDATE ON mainboard_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER production_orders_updated_at
  BEFORE UPDATE ON production_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER production_steps_updated_at
  BEFORE UPDATE ON production_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─────────────────────────────────────────────────────────────
-- SECTION D: BUSINESS LOGIC TRIGGERS
-- ─────────────────────────────────────────────────────────────

-- Auto-create 9 components when a kit is inserted
CREATE OR REPLACE FUNCTION auto_create_kit_components()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO kit_components (kit_id, component_type) VALUES
    (NEW.id, 'ENCLOSURE'),
    (NEW.id, 'MAIN_BOARD'),
    (NEW.id, 'CAMERA_A_140'),
    (NEW.id, 'CAMERA_B_140'),
    (NEW.id, 'CAMERA_C_70'),
    (NEW.id, 'POWER_SUPPLY'),
    (NEW.id, 'WIFI_ANTENNA'),
    (NEW.id, 'CELL_ANTENNA'),
    (NEW.id, 'DOOR_LOCK_CABLE');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kits_auto_create_components
  AFTER INSERT ON kits
  FOR EACH ROW EXECUTE FUNCTION auto_create_kit_components();


-- Auto-create 13 mainboard sections when a MAIN_BOARD component is inserted
CREATE OR REPLACE FUNCTION auto_create_mainboard_sections()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.component_type = 'MAIN_BOARD' THEN
    INSERT INTO mainboard_sections (component_id, section_name) VALUES
      (NEW.id, 'CM4'),
      (NEW.id, 'POWER_MAIN'),
      (NEW.id, 'POWER_2'),
      (NEW.id, 'USB3_1'),
      (NEW.id, 'USB3_2'),
      (NEW.id, 'USB3_3'),
      (NEW.id, 'USB2_1'),
      (NEW.id, 'USB2_2'),
      (NEW.id, 'USB2_3'),
      (NEW.id, 'CELL_MODULE'),
      (NEW.id, 'WIFI_BT'),
      (NEW.id, 'IO_LOCK'),
      (NEW.id, 'HDMI'),
      (NEW.id, 'TOP_CONNECTORS');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kit_components_auto_create_sections
  AFTER INSERT ON kit_components
  FOR EACH ROW EXECUTE FUNCTION auto_create_mainboard_sections();


-- Auto-create 10 production steps when an order is inserted
CREATE OR REPLACE FUNCTION auto_create_production_steps()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO production_steps (order_id, step_number, step_name, description) VALUES
    (NEW.id, 1,  'Component Sourcing',      'Gather and verify all required components for the batch'),
    (NEW.id, 2,  'PCB Assembly',            'Assemble the main PCB with all surface-mount components'),
    (NEW.id, 3,  'CM4 Module Install',      'Install and seat the Compute Module 4 onto the carrier board'),
    (NEW.id, 4,  'Camera Integration',      'Connect and test all three cameras (A 140°, B 140°, C 70°)'),
    (NEW.id, 5,  'Antenna Installation',    'Install WiFi/BT and cellular antennas, verify signal'),
    (NEW.id, 6,  'Power & Cabling',         'Install power supply and all internal cables. VERIFY: LEFT connector only (POWER_MAIN)'),
    (NEW.id, 7,  'Enclosure Assembly',      'Mount all components into the enclosure and secure'),
    (NEW.id, 8,  'Firmware Flash',          'Flash latest firmware and verify boot sequence'),
    (NEW.id, 9,  'QA Testing',              'Run full diagnostic suite: cameras, connectivity, door lock'),
    (NEW.id, 10, 'Final Inspection & Pack', 'Visual inspection, serial label, pack for shipping');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER production_orders_auto_create_steps
  AFTER INSERT ON production_orders
  FOR EACH ROW EXECUTE FUNCTION auto_create_production_steps();


-- ─────────────────────────────────────────────────────────────
-- SECTION E: ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

ALTER TABLE kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE mainboard_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE known_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON kits
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON kit_components
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON mainboard_sections
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON tickets
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON ticket_comments
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON ticket_attachments
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON production_orders
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON production_steps
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON known_issues
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');


-- ─────────────────────────────────────────────────────────────
-- SECTION F: STORAGE
-- ─────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;

CREATE POLICY "Authenticated users can upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ticket-attachments');

CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'ticket-attachments');

CREATE POLICY "Authenticated users can delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'ticket-attachments');


-- ─────────────────────────────────────────────────────────────
-- SECTION G: SEED DATA — KNOWN ISSUES
-- ─────────────────────────────────────────────────────────────

INSERT INTO known_issues (title, description, solution, board_section, issue_category, component_type, frequency) VALUES
(
  'Wrong Power Connector Installation',
  'Technician plugs the power cable into the right-side connector (POWER_2) instead of the left-side connector (POWER_MAIN). This is the most common installation error and can damage the board.',
  'Unplug immediately. The correct connector is POWER_MAIN — the LEFT connector when the board is oriented with connectors facing you. POWER_2 (right side) is NOT the power input. Verify the cable is firmly seated in POWER_MAIN before powering on.',
  'POWER_2',
  'WRONG_CONNECTOR',
  'MAIN_BOARD',
  'HIGH'
),
(
  'Camera Not Detected — USB Port Issue',
  'One or more cameras fail to appear in device list. Often caused by wrong USB port assignment or loose connection.',
  'Verify USB port mapping: Camera A (140°) → USB2_3 (Green cable), Camera B (140°) → USB3_2 (Purple cable), Camera C (70°) → USB3_1 (Yellow cable). Check cables are fully seated. Try reseating the camera ribbon connector.',
  NULL,
  'CAMERA',
  'CAMERA_A_140',
  'MEDIUM'
),
(
  'CM4 Boot Failure — No Output',
  'The Compute Module 4 fails to boot, no HDMI output, no network activity. Usually related to power delivery or SD card issues.',
  'Check POWER_MAIN connection first. Verify CM4 is fully seated in the connector (press firmly until click). Check if SD card/eMMC has valid firmware. Inspect for bent pins on CM4 socket.',
  'CM4',
  'CM4_PROCESSOR',
  'MAIN_BOARD',
  'LOW'
),
(
  'WiFi Module Weak Signal or Not Detected',
  'WiFi connectivity is intermittent or the module fails to appear. Usually an antenna connection issue.',
  'Check antenna cable is connected to WIFI_BT section. Ensure antenna is positioned away from metal surfaces. Verify the cable connector is clicked into the module. Test with an external USB WiFi adapter to isolate the issue.',
  'WIFI_BT',
  'WIFI',
  'WIFI_ANTENNA',
  'LOW'
),
(
  'Door Lock Cable Not Triggering',
  'Door lock mechanism does not respond to software trigger. IO_LOCK section may have a loose connection or incorrect cable.',
  'Inspect IO_LOCK connector for secure seating. Verify cable polarity (red = positive). Test with a multimeter: 12V should appear on the output when triggered via software. Check that the door lock cable is the correct model (IVO-DL-v2 or later).',
  'IO_LOCK',
  'DOOR_LOCK',
  'DOOR_LOCK_CABLE',
  'LOW'
);
