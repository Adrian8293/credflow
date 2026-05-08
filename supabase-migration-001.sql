-- CredFlow Migration 001: Critical Schema Fixes
-- Run in Supabase SQL Editor
-- Adds: missing columns, missing tables, RLS, indexes, audit immutability

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ADD MISSING COLUMNS TO EXISTING TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- providers: missing columns referenced by mappers.js
ALTER TABLE providers ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS pt_url text;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS pt_status text DEFAULT 'None';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS pt_monthly_fee boolean DEFAULT false;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS pt_notes text;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS opca_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE providers ADD COLUMN IF NOT EXISTS deleted_at timestamptz; -- soft delete
ALTER TABLE providers ADD COLUMN IF NOT EXISTS org_id uuid; -- future multi-tenant

-- tasks: missing dedup_key column (watchdog depends on this)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dedup_key text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- audit_log: missing performed_by and user_email (code already writes these)
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS performed_by uuid;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_email text;

-- enrollments / documents / payers: add updated_at + soft delete
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE payers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE payers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. CREATE MISSING TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Claims
CREATE TABLE IF NOT EXISTS claims (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  prov_id        uuid REFERENCES providers(id) ON DELETE SET NULL,
  payer_id       uuid REFERENCES payers(id) ON DELETE SET NULL,
  patient_name   text NOT NULL,
  dob            date,
  dos            date NOT NULL,
  cpt_codes      text[] DEFAULT '{}',
  diagnosis_codes text[] DEFAULT '{}',
  billed_amount  numeric(10,2) DEFAULT 0,
  allowed_amount numeric(10,2) DEFAULT 0,
  paid_amount    numeric(10,2) DEFAULT 0,
  patient_resp   numeric(10,2) DEFAULT 0,
  status         text DEFAULT 'Submitted',
  claim_num      text,
  submitted_date date,
  paid_date      date,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  deleted_at     timestamptz
);

-- Eligibility Checks
CREATE TABLE IF NOT EXISTS eligibility_checks (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  prov_id        uuid REFERENCES providers(id) ON DELETE SET NULL,
  payer_id       uuid REFERENCES payers(id) ON DELETE SET NULL,
  patient_name   text NOT NULL,
  member_id      text,
  dob            date,
  dos            date,
  status         text DEFAULT 'Pending',
  plan_name      text,
  group_num      text,
  cov_type       text,
  copay          numeric(10,2) DEFAULT 0,
  deductible     numeric(10,2) DEFAULT 0,
  deductible_met numeric(10,2) DEFAULT 0,
  oop_max        numeric(10,2) DEFAULT 0,
  oop_met        numeric(10,2) DEFAULT 0,
  raw_response   jsonb,
  checked_at     timestamptz DEFAULT now(),
  notes          text,
  created_at     timestamptz DEFAULT now()
);

-- Claim Denials
CREATE TABLE IF NOT EXISTS claim_denials (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id       uuid REFERENCES claims(id) ON DELETE CASCADE,
  reason_code    text,
  reason_desc    text,
  denial_date    date,
  appeal_status  text DEFAULT 'Not Started',
  appeal_date    date,
  appeal_notes   text,
  resolution     text,
  resolved_date  date,
  amount_recovered numeric(10,2) DEFAULT 0,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id       uuid REFERENCES claims(id) ON DELETE SET NULL,
  prov_id        uuid REFERENCES providers(id) ON DELETE SET NULL,
  payer_id       uuid REFERENCES payers(id) ON DELETE SET NULL,
  paid_amount    numeric(10,2) DEFAULT 0,
  paid_date      date,
  check_number   text,
  era_number     text,
  payment_method text DEFAULT 'EFT',
  notes          text,
  created_at     timestamptz DEFAULT now()
);

-- OPCA Profiles
CREATE TABLE IF NOT EXISTS opca_profiles (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id               uuid REFERENCES providers(id) ON DELETE CASCADE,
  form_version              text DEFAULT '2025',
  source                    text DEFAULT 'uploaded',

  -- Practitioner Info
  last_name                 text,
  first_name                text,
  middle_name               text,
  degree                    text,
  other_names               text,
  home_address              text,
  home_phone                text,
  mobile_phone              text,
  home_email                text,
  home_city                 text,
  home_state                text,
  home_zip                  text,
  birth_date                text,
  birth_place               text,
  citizenship               text,
  gender                    text,
  ecfmg_number              text,
  reald_race                text,
  reald_ethnicity           text,
  reald_language            text,
  reald_disability          text,

  -- Specialty
  principal_specialty       text,
  taxonomy_code             text,
  additional_specialties    text,
  is_pcp                    boolean DEFAULT false,

  -- Certifications (JSON arrays)
  board_certs               jsonb DEFAULT '[]'::jsonb,
  other_certs               jsonb DEFAULT '[]'::jsonb,

  -- Practice
  primary_practice_name     text,
  primary_practice_address  text,
  primary_practice_city     text,
  primary_practice_state    text,
  primary_practice_zip      text,
  primary_practice_phone    text,
  primary_practice_fax      text,
  primary_npi_group         text,
  billing_address           text,
  office_manager            text,
  office_manager_phone      text,
  credentialing_contact     text,
  federal_tax_id            text,  -- encrypted at rest via Supabase Vault recommended
  tax_id_name               text,
  secondary_practices       jsonb DEFAULT '[]'::jsonb,

  -- Call Coverage
  call_coverage             jsonb DEFAULT '[]'::jsonb,

  -- Education
  undergraduate_school      text,
  undergraduate_degree      text,
  undergraduate_start       text,
  undergraduate_end         text,
  graduate_school           text,
  graduate_degree           text,
  graduate_start            text,
  graduate_end              text,
  professional_schools      jsonb DEFAULT '[]'::jsonb,
  internship                jsonb DEFAULT '{}'::jsonb,
  residencies               jsonb DEFAULT '[]'::jsonb,
  fellowships               jsonb DEFAULT '[]'::jsonb,

  -- Licensure
  oregon_license_number     text,
  oregon_license_type       text,
  oregon_license_exp        text,
  dea_number                text,
  dea_issue_date            text,
  dea_exp                   text,
  csr_number                text,
  csr_issue_date            text,
  individual_npi            text,
  medicare_number           text,
  oregon_medicaid_number    text,
  pa_collaborating_physician text,
  other_licenses            jsonb DEFAULT '[]'::jsonb,

  -- Affiliations
  current_affiliations      jsonb DEFAULT '[]'::jsonb,
  pending_applications      jsonb DEFAULT '[]'::jsonb,
  previous_affiliations     jsonb DEFAULT '[]'::jsonb,

  -- Work History
  work_history              jsonb DEFAULT '[]'::jsonb,
  work_history_gaps         jsonb DEFAULT '[]'::jsonb,

  -- References, CME, Malpractice, Attestation
  peer_references           jsonb DEFAULT '[]'::jsonb,
  cme_activities            jsonb DEFAULT '[]'::jsonb,
  current_malpractice       jsonb DEFAULT '{}'::jsonb,
  prior_malpractice         jsonb DEFAULT '[]'::jsonb,
  attestation               jsonb DEFAULT '{}'::jsonb,

  -- Raw extraction
  raw_extraction            jsonb,

  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Dedup index for watchdog (only enforce uniqueness on open/in-progress tasks)
CREATE UNIQUE INDEX IF NOT EXISTS tasks_dedup_key_open_idx
  ON tasks (dedup_key)
  WHERE dedup_key IS NOT NULL AND status IN ('Open', 'In Progress');

-- Claims indexes
CREATE INDEX IF NOT EXISTS claims_prov_id_idx ON claims(prov_id);
CREATE INDEX IF NOT EXISTS claims_payer_id_idx ON claims(payer_id);
CREATE INDEX IF NOT EXISTS claims_dos_idx ON claims(dos DESC);
CREATE INDEX IF NOT EXISTS claims_status_idx ON claims(status);
CREATE UNIQUE INDEX IF NOT EXISTS claims_claim_num_idx ON claims(claim_num) WHERE claim_num IS NOT NULL;

-- Eligibility indexes
CREATE INDEX IF NOT EXISTS eligibility_prov_id_idx ON eligibility_checks(prov_id);
CREATE INDEX IF NOT EXISTS eligibility_checked_at_idx ON eligibility_checks(checked_at DESC);

-- Denials indexes
CREATE INDEX IF NOT EXISTS denials_claim_id_idx ON claim_denials(claim_id);
CREATE INDEX IF NOT EXISTS denials_date_idx ON claim_denials(denial_date DESC);

-- Payments indexes
CREATE INDEX IF NOT EXISTS payments_claim_id_idx ON payments(claim_id);
CREATE INDEX IF NOT EXISTS payments_paid_date_idx ON payments(paid_date DESC);

-- OPCA indexes
CREATE INDEX IF NOT EXISTS opca_provider_id_idx ON opca_profiles(provider_id);

-- Provider NPI index (for fast lookups)
-- NOTE: Not unique because existing data has duplicates.
-- Run this query to find and manually merge duplicates:
--   SELECT npi, array_agg(id), array_agg(fname || ' ' || lname)
--   FROM providers WHERE npi IS NOT NULL AND npi != ''
--   GROUP BY npi HAVING count(*) > 1;
-- After cleaning duplicates, upgrade to unique:
--   DROP INDEX IF EXISTS providers_npi_idx;
--   CREATE UNIQUE INDEX providers_npi_unique_idx ON providers (npi)
--     WHERE npi IS NOT NULL AND npi != '';
CREATE INDEX IF NOT EXISTS providers_npi_idx
  ON providers (npi)
  WHERE npi IS NOT NULL AND npi != '';

-- Audit log: index on performed_by for user activity queries
CREATE INDEX IF NOT EXISTS audit_log_performed_by_idx ON audit_log(performed_by);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payers ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE eligibility_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_denials ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE opca_profiles ENABLE ROW LEVEL SECURITY;

-- Phase 1 policy: authenticated users get full access
-- This is safe for single-org deployment. Phase 5 adds org-based isolation.
CREATE POLICY "auth_full_access" ON providers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON payers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON enrollments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON claims FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON eligibility_checks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON claim_denials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON opca_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Audit log: authenticated can INSERT and SELECT only (no UPDATE or DELETE)
CREATE POLICY "audit_read" ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
-- No UPDATE or DELETE policy = immutable audit log for authenticated users
-- Service role (admin) can still manage via supabaseAdmin

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. REALTIME
-- ═══════════════════════════════════════════════════════════════════════════════

-- Only add tables not already in the publication (prevents error 42710)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['providers','payers','enrollments','documents','tasks']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. AUTO-UPDATE updated_at TRIGGER
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS providers_updated_at ON providers;
CREATE TRIGGER providers_updated_at BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS enrollments_updated_at ON enrollments;
CREATE TRIGGER enrollments_updated_at BEFORE UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS documents_updated_at ON documents;
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS claims_updated_at ON claims;
CREATE TRIGGER claims_updated_at BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS opca_profiles_updated_at ON opca_profiles;
CREATE TRIGGER opca_profiles_updated_at BEFORE UPDATE ON opca_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS claim_denials_updated_at ON claim_denials;
CREATE TRIGGER claim_denials_updated_at BEFORE UPDATE ON claim_denials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
