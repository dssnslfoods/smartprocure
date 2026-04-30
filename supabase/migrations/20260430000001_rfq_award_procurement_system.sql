-- ============================================================
-- RFQ-to-Award Procurement System + Vendor Risk Assessment
-- Phase 1: DB Foundation (self-contained)
-- Created: 2026-04-30
-- Target:  Supabase PostgreSQL 15
--
-- Self-contained: recreates base tables with IF NOT EXISTS so
-- it is safe to run on a fresh database OR on top of an existing
-- schema. All DDL is fully idempotent.
--
-- Design rules
--   * CREATE TABLE IF NOT EXISTS  — safe on existing DB
--   * ALTER TABLE … ADD COLUMN IF NOT EXISTS — safe on existing schema
--   * No ALTER TYPE ADD VALUE (cannot run inside a transaction)
--     → extended RFQ workflow states go into workflow_status TEXT
--   * Backfills use UPDATE … FROM subquery (window fn in SET is invalid)
-- ============================================================

-- ============================================================
-- SECTION 1: BASE ENUMS (existing project)
-- ============================================================

DO $$ BEGIN CREATE TYPE public.app_role AS ENUM (
  'admin','moderator','user','procurement_officer','approver','executive','supplier'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.supplier_status AS ENUM (
  'draft','submitted','review','approved','rejected','suspended'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.supplier_tier AS ENUM (
  'critical_tier_1','non_critical_tier_1'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.rfq_status AS ENUM (
  'draft','published','closed','evaluation','awarded'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.bidding_status AS ENUM (
  'scheduled','active','closed','cancelled'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.award_status AS ENUM (
  'pending','approved','rejected','revise'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.price_list_status AS ENUM (
  'draft','submitted','active','expired'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SECTION 2: NEW ENUMS (this migration)
-- ============================================================

DO $$ BEGIN CREATE TYPE public.supplier_type_enum AS ENUM (
  'approved','new','nominated','critical','blocked'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.risk_level_enum AS ENUM (
  'low','medium','high','critical'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.qa_approval_status_enum AS ENUM (
  'not_required','pending','approved','rejected'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.quotation_status_enum AS ENUM (
  'draft','submitted','under_review','awarded','not_awarded','rejected','withdrawn'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.award_lifecycle_status_enum AS ENUM (
  'draft','pending_approval','awarded','cancelled'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.approval_level_enum AS ENUM (
  'buyer','procurement_manager','qa','finance','director'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.approval_decision_enum AS ENUM (
  'pending','approved','rejected','skipped'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SECTION 3: SECURITY DEFINER HELPER (required before RLS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       public.app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============================================================
-- SECTION 4: BASE TABLES (existing schema — IF NOT EXISTS)
-- ============================================================

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  full_name   TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  is_active   BOOLEAN DEFAULT true,
  supplier_id UUID,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- suppliers  (base columns only; new columns added in Section 5)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name   TEXT NOT NULL,
  tax_id         TEXT,
  address        TEXT,
  city           TEXT,
  country        TEXT,
  phone          TEXT,
  email          TEXT,
  website        TEXT,
  status         public.supplier_status DEFAULT 'draft',
  tier           public.supplier_tier,
  notes          TEXT,
  is_preferred   BOOLEAN DEFAULT false,
  is_blacklisted BOOLEAN DEFAULT false,
  created_by     UUID REFERENCES auth.users(id),
  approved_by    UUID REFERENCES auth.users(id),
  approved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- profiles → suppliers FK (deferred)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_profiles_supplier' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT fk_profiles_supplier
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- supplier_contacts
CREATE TABLE IF NOT EXISTS public.supplier_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  position     TEXT,
  email        TEXT,
  phone        TEXT,
  is_primary   BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;

-- supplier_documents
CREATE TABLE IF NOT EXISTS public.supplier_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  document_type TEXT,
  file_url      TEXT,
  file_size     BIGINT,
  uploaded_by   UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_documents ENABLE ROW LEVEL SECURITY;

-- supplier_tiers
CREATE TABLE IF NOT EXISTS public.supplier_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name   TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_tiers ENABLE ROW LEVEL SECURITY;

-- supplier_esg_profiles
CREATE TABLE IF NOT EXISTS public.supplier_esg_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id         UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE UNIQUE,
  esg_score           NUMERIC(5,2) DEFAULT 0,
  compliance_status   TEXT DEFAULT 'pending',
  risk_level          TEXT DEFAULT 'low',
  environmental_score NUMERIC(5,2),
  social_score        NUMERIC(5,2),
  governance_score    NUMERIC(5,2),
  notes               TEXT,
  updated_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_esg_profiles ENABLE ROW LEVEL SECURITY;

-- price_lists
CREATE TABLE IF NOT EXISTS public.price_lists (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  version        INTEGER DEFAULT 1,
  status         public.price_list_status DEFAULT 'draft',
  valid_from     DATE,
  valid_until    DATE,
  payment_terms  TEXT,
  notes          TEXT,
  attachment_url TEXT,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;

-- price_list_items
CREATE TABLE IF NOT EXISTS public.price_list_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  item_name     TEXT NOT NULL,
  description   TEXT,
  unit          TEXT,
  unit_price    NUMERIC(15,2) NOT NULL,
  moq           INTEGER,
  lead_time_days INTEGER,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;

-- rfqs  (base columns; extended in Section 7)
CREATE TABLE IF NOT EXISTS public.rfqs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number  TEXT UNIQUE,
  title       TEXT NOT NULL,
  description TEXT,
  status      public.rfq_status DEFAULT 'draft',
  deadline    TIMESTAMPTZ,
  notes       TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;

-- rfq_items  (base columns; extended in Section 8)
CREATE TABLE IF NOT EXISTS public.rfq_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id       UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  item_name    TEXT NOT NULL,
  description  TEXT,
  quantity     NUMERIC(15,2),
  unit         TEXT,
  specifications TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.rfq_items ENABLE ROW LEVEL SECURITY;

-- rfq_suppliers  (base columns; extended in Section 9)
CREATE TABLE IF NOT EXISTS public.rfq_suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id      UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  invited_at  TIMESTAMPTZ DEFAULT now(),
  responded   BOOLEAN DEFAULT false,
  UNIQUE (rfq_id, supplier_id)
);
ALTER TABLE public.rfq_suppliers ENABLE ROW LEVEL SECURITY;

-- quotations  (base columns; extended in Section 10)
CREATE TABLE IF NOT EXISTS public.quotations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id         UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id    UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  total_amount   NUMERIC(15,2),
  currency       TEXT DEFAULT 'USD',
  payment_terms  TEXT,
  delivery_terms TEXT,
  validity_days  INTEGER,
  notes          TEXT,
  attachment_url TEXT,
  submitted_at   TIMESTAMPTZ,
  revised_at     TIMESTAMPTZ,
  version        INTEGER DEFAULT 1,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

-- quotation_items
CREATE TABLE IF NOT EXISTS public.quotation_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  rfq_item_id  UUID REFERENCES public.rfq_items(id),
  item_name    TEXT NOT NULL,
  quantity     NUMERIC(15,2),
  unit         TEXT,
  unit_price   NUMERIC(15,2) NOT NULL,
  total_price  NUMERIC(15,2),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- bidding_events
CREATE TABLE IF NOT EXISTS public.bidding_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id        UUID REFERENCES public.rfqs(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  status        public.bidding_status DEFAULT 'scheduled',
  start_time    TIMESTAMPTZ,
  end_time      TIMESTAMPTZ,
  max_rounds    INTEGER,
  current_round INTEGER DEFAULT 1,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.bidding_events ENABLE ROW LEVEL SECURITY;

-- bid_entries
CREATE TABLE IF NOT EXISTS public.bid_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bidding_event_id UUID NOT NULL REFERENCES public.bidding_events(id) ON DELETE CASCADE,
  supplier_id      UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  round_number     INTEGER DEFAULT 1,
  bid_amount       NUMERIC(15,2) NOT NULL,
  notes            TEXT,
  submitted_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.bid_entries ENABLE ROW LEVEL SECURITY;

-- final_quotations
CREATE TABLE IF NOT EXISTS public.final_quotations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id           UUID REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id      UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  quotation_id     UUID REFERENCES public.quotations(id),
  bidding_event_id UUID REFERENCES public.bidding_events(id),
  total_amount     NUMERIC(15,2),
  currency         TEXT DEFAULT 'USD',
  payment_terms    TEXT,
  delivery_terms   TEXT,
  attachment_url   TEXT,
  status           TEXT DEFAULT 'pending',
  is_selected      BOOLEAN DEFAULT false,
  ready_for_po     BOOLEAN DEFAULT false,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.final_quotations ENABLE ROW LEVEL SECURITY;

-- awards  (base columns; extended in Section 11)
CREATE TABLE IF NOT EXISTS public.awards (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id             UUID REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id        UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  final_quotation_id UUID REFERENCES public.final_quotations(id),
  amount             NUMERIC(15,2),
  status             public.award_status DEFAULT 'pending',
  recommendation     TEXT,
  decision_reason    TEXT,
  ready_for_po       BOOLEAN DEFAULT false,
  awarded_by         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;

-- approval_logs
CREATE TABLE IF NOT EXISTS public.approval_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  action      TEXT NOT NULL,
  status      TEXT,
  comment     TEXT,
  approved_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.approval_logs ENABLE ROW LEVEL SECURITY;

-- audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  TEXT NOT NULL,
  entity_id    UUID,
  action       TEXT NOT NULL,
  old_values   JSONB,
  new_values   JSONB,
  performed_by UUID REFERENCES auth.users(id),
  ip_address   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- evaluation_templates
CREATE TABLE IF NOT EXISTS public.evaluation_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.evaluation_templates ENABLE ROW LEVEL SECURITY;

-- evaluation_criteria
CREATE TABLE IF NOT EXISTS public.evaluation_criteria (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES public.evaluation_templates(id) ON DELETE CASCADE,
  criteria_name TEXT NOT NULL,
  description   TEXT,
  weight        NUMERIC(5,2) DEFAULT 1.0,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.evaluation_criteria ENABLE ROW LEVEL SECURITY;

-- supplier_evaluations
CREATE TABLE IF NOT EXISTS public.supplier_evaluations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  template_id       UUID REFERENCES public.evaluation_templates(id),
  evaluator_id      UUID REFERENCES auth.users(id),
  evaluation_period TEXT,
  total_score       NUMERIC(5,2),
  status            TEXT DEFAULT 'draft',
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_evaluations ENABLE ROW LEVEL SECURITY;

-- supplier_evaluation_scores
CREATE TABLE IF NOT EXISTS public.supplier_evaluation_scores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.supplier_evaluations(id) ON DELETE CASCADE,
  criteria_id   UUID NOT NULL REFERENCES public.evaluation_criteria(id) ON DELETE CASCADE,
  score         NUMERIC(3,1) NOT NULL CHECK (score >= 1 AND score <= 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_evaluation_scores ENABLE ROW LEVEL SECURITY;

-- supplier_score_summary
CREATE TABLE IF NOT EXISTS public.supplier_score_summary (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id        UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE UNIQUE,
  service_score      NUMERIC(5,2) DEFAULT 0,
  esg_score          NUMERIC(5,2) DEFAULT 0,
  commercial_score   NUMERIC(5,2) DEFAULT 0,
  reliability_score  NUMERIC(5,2) DEFAULT 0,
  overall_score      NUMERIC(5,2) DEFAULT 0,
  risk_flag          TEXT DEFAULT 'low',
  recommendation     TEXT,
  last_calculated_at TIMESTAMPTZ DEFAULT now(),
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_score_summary ENABLE ROW LEVEL SECURITY;

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT,
  type        TEXT DEFAULT 'info',
  is_read     BOOLEAN DEFAULT false,
  entity_type TEXT,
  entity_id   UUID,
  link        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- system_settings
CREATE TABLE IF NOT EXISTS public.system_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 5: SUPPLIERS — new procurement & risk columns
-- ============================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS supplier_code           TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name           TEXT,
  ADD COLUMN IF NOT EXISTS supplier_type           public.supplier_type_enum DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS category                TEXT,
  ADD COLUMN IF NOT EXISTS contact_person          TEXT,
  ADD COLUMN IF NOT EXISTS certificate_type        TEXT,
  ADD COLUMN IF NOT EXISTS certificate_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS qa_approval_status      public.qa_approval_status_enum DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS risk_level              public.risk_level_enum DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS performance_score       NUMERIC(5,2) DEFAULT 0;

-- Backfill supplier_name from company_name.
UPDATE public.suppliers
SET supplier_name = company_name
WHERE supplier_name IS NULL OR supplier_name = '';

-- Generate supplier_code via subquery (avoids window fn in SET).
UPDATE public.suppliers AS s
SET supplier_code = seq.code
FROM (
  SELECT id,
         'SUP-' || LPAD(row_number() OVER (ORDER BY created_at)::TEXT, 5, '0') AS code
  FROM   public.suppliers
  WHERE  supplier_code IS NULL OR supplier_code = ''
) AS seq
WHERE s.id = seq.id;

-- Map legacy is_blacklisted → supplier_type = 'blocked'.
UPDATE public.suppliers
SET supplier_type = 'blocked'
WHERE is_blacklisted = true
  AND (supplier_type IS NULL OR supplier_type <> 'blocked');

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_supplier_code_key
  ON public.suppliers (supplier_code) WHERE supplier_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS suppliers_supplier_type_idx       ON public.suppliers (supplier_type);
CREATE INDEX IF NOT EXISTS suppliers_risk_level_idx          ON public.suppliers (risk_level);
CREATE INDEX IF NOT EXISTS suppliers_certificate_expiry_idx  ON public.suppliers (certificate_expiry_date);

-- ============================================================
-- SECTION 6: SUPPLIER RISK ASSESSMENTS (new table)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.supplier_risk_assessments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id            UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  food_safety_risk       NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (food_safety_risk       BETWEEN 0 AND 10),
  quality_risk           NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (quality_risk           BETWEEN 0 AND 10),
  delivery_risk          NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (delivery_risk          BETWEEN 0 AND 10),
  financial_risk         NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (financial_risk         BETWEEN 0 AND 10),
  certificate_risk       NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (certificate_risk       BETWEEN 0 AND 10),
  food_fraud_risk        NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (food_fraud_risk        BETWEEN 0 AND 10),
  allergen_risk          NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (allergen_risk          BETWEEN 0 AND 10),
  country_risk           NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (country_risk           BETWEEN 0 AND 10),
  critical_material_risk NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (critical_material_risk BETWEEN 0 AND 10),
  ncr_history_risk       NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (ncr_history_risk       BETWEEN 0 AND 10),
  total_risk_score       NUMERIC(6,2) GENERATED ALWAYS AS (
    food_safety_risk + quality_risk + delivery_risk + financial_risk
    + certificate_risk + food_fraud_risk + allergen_risk + country_risk
    + critical_material_risk + ncr_history_risk
  ) STORED,
  notes                  TEXT,
  assessed_by            UUID REFERENCES auth.users(id),
  assessed_at            TIMESTAMPTZ DEFAULT now(),
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_risk_assessments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS sra_supplier_idx    ON public.supplier_risk_assessments (supplier_id);
CREATE INDEX IF NOT EXISTS sra_assessed_at_idx ON public.supplier_risk_assessments (assessed_at DESC);

-- Classify total_risk_score (0–100) → risk_level label.
CREATE OR REPLACE FUNCTION public.classify_risk_level(score NUMERIC)
RETURNS public.risk_level_enum LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN score IS NULL THEN 'low'::public.risk_level_enum
    WHEN score <= 30   THEN 'low'::public.risk_level_enum
    WHEN score <= 60   THEN 'medium'::public.risk_level_enum
    WHEN score <= 80   THEN 'high'::public.risk_level_enum
    ELSE                    'critical'::public.risk_level_enum
  END
$$;

-- Trigger: sync suppliers.risk_level when a risk assessment changes.
CREATE OR REPLACE FUNCTION public.sync_supplier_risk_level()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.suppliers
  SET    risk_level = public.classify_risk_level(NEW.total_risk_score),
         updated_at = now()
  WHERE  id = NEW.supplier_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_supplier_risk_level ON public.supplier_risk_assessments;
CREATE TRIGGER trg_sync_supplier_risk_level
  AFTER INSERT OR UPDATE ON public.supplier_risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_risk_level();

-- ============================================================
-- SECTION 7: RFQs — procurement metadata columns
-- NOTE: rfq_status enum is NOT extended (ALTER TYPE ADD VALUE
-- cannot run in a transaction). Extended states are stored in
-- workflow_status TEXT instead.
-- ============================================================

ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS requester           TEXT,
  ADD COLUMN IF NOT EXISTS requester_id        UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS department          TEXT,
  ADD COLUMN IF NOT EXISTS category            TEXT,
  ADD COLUMN IF NOT EXISTS required_date       DATE,
  ADD COLUMN IF NOT EXISTS budget              NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS currency            TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS submission_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS workflow_status     TEXT DEFAULT 'draft';

UPDATE public.rfqs
SET submission_deadline = deadline
WHERE submission_deadline IS NULL AND deadline IS NOT NULL;

UPDATE public.rfqs
SET workflow_status = status::TEXT
WHERE workflow_status IS NULL OR workflow_status = 'draft';

CREATE INDEX IF NOT EXISTS rfqs_status_idx              ON public.rfqs (status);
CREATE INDEX IF NOT EXISTS rfqs_workflow_status_idx     ON public.rfqs (workflow_status);
CREATE INDEX IF NOT EXISTS rfqs_submission_deadline_idx ON public.rfqs (submission_deadline);
CREATE INDEX IF NOT EXISTS rfqs_category_idx            ON public.rfqs (category);

-- ============================================================
-- SECTION 8: RFQ ITEMS — technical spec columns
-- ============================================================

ALTER TABLE public.rfq_items
  ADD COLUMN IF NOT EXISTS specification         TEXT,
  ADD COLUMN IF NOT EXISTS required_date         DATE,
  ADD COLUMN IF NOT EXISTS estimated_budget      NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS technical_requirement TEXT;

CREATE INDEX IF NOT EXISTS rfq_items_rfq_idx ON public.rfq_items (rfq_id);

-- ============================================================
-- SECTION 9: RFQ_SUPPLIERS — eligibility columns
-- ============================================================

ALTER TABLE public.rfq_suppliers
  ADD COLUMN IF NOT EXISTS eligibility_status   TEXT,
  ADD COLUMN IF NOT EXISTS eligibility_notes    TEXT,
  ADD COLUMN IF NOT EXISTS override_approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS override_approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS rfq_suppliers_rfq_idx      ON public.rfq_suppliers (rfq_id);
CREATE INDEX IF NOT EXISTS rfq_suppliers_supplier_idx ON public.rfq_suppliers (supplier_id);

-- ============================================================
-- SECTION 10: QUOTATIONS — scoring columns
-- ============================================================

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS quotation_no          TEXT,
  ADD COLUMN IF NOT EXISTS price                 NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS discount              NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat                   NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_time_days        INTEGER,
  ADD COLUMN IF NOT EXISTS payment_term          TEXT,
  ADD COLUMN IF NOT EXISTS warranty              TEXT,
  ADD COLUMN IF NOT EXISTS validity_date         DATE,
  ADD COLUMN IF NOT EXISTS spec_compliance_score NUMERIC(5,2) CHECK (spec_compliance_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS technical_score       NUMERIC(5,2) CHECK (technical_score       BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS commercial_score      NUMERIC(5,2) CHECK (commercial_score      BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS risk_score            NUMERIC(5,2) CHECK (risk_score            BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS final_score           NUMERIC(5,2) CHECK (final_score           BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS rank                  INTEGER,
  ADD COLUMN IF NOT EXISTS evaluation_status     public.quotation_status_enum DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS remark                TEXT;

UPDATE public.quotations
SET price = total_amount
WHERE price IS NULL AND total_amount IS NOT NULL;

UPDATE public.quotations
SET payment_term = payment_terms
WHERE payment_term IS NULL AND payment_terms IS NOT NULL;

UPDATE public.quotations AS q
SET quotation_no = seq.qno
FROM (
  SELECT id,
         'QUO-' || LPAD(row_number() OVER (ORDER BY created_at)::TEXT, 6, '0') AS qno
  FROM   public.quotations
  WHERE  quotation_no IS NULL OR quotation_no = ''
) AS seq
WHERE q.id = seq.id;

CREATE UNIQUE INDEX IF NOT EXISTS quotations_quotation_no_key
  ON public.quotations (quotation_no) WHERE quotation_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS quotations_rfq_idx               ON public.quotations (rfq_id);
CREATE INDEX IF NOT EXISTS quotations_supplier_idx          ON public.quotations (supplier_id);
CREATE INDEX IF NOT EXISTS quotations_evaluation_status_idx ON public.quotations (evaluation_status);
CREATE INDEX IF NOT EXISTS quotations_rfq_score_idx         ON public.quotations (rfq_id, final_score DESC NULLS LAST);

-- ============================================================
-- SECTION 11: AWARDS — award metadata columns
-- ============================================================

ALTER TABLE public.awards
  ADD COLUMN IF NOT EXISTS award_no               TEXT,
  ADD COLUMN IF NOT EXISTS winning_quotation_id   UUID REFERENCES public.quotations(id),
  ADD COLUMN IF NOT EXISTS award_reason           TEXT,
  ADD COLUMN IF NOT EXISTS final_amount           NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS award_lifecycle_status public.award_lifecycle_status_enum DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS awarded_at             TIMESTAMPTZ;

UPDATE public.awards
SET final_amount = amount
WHERE final_amount IS NULL AND amount IS NOT NULL;

UPDATE public.awards AS a
SET award_no = seq.ano
FROM (
  SELECT id,
         'AWD-' || LPAD(row_number() OVER (ORDER BY created_at)::TEXT, 6, '0') AS ano
  FROM   public.awards
  WHERE  award_no IS NULL OR award_no = ''
) AS seq
WHERE a.id = seq.id;

CREATE UNIQUE INDEX IF NOT EXISTS awards_award_no_key
  ON public.awards (award_no) WHERE award_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS awards_rfq_idx       ON public.awards (rfq_id);
CREATE INDEX IF NOT EXISTS awards_supplier_idx  ON public.awards (supplier_id);
CREATE INDEX IF NOT EXISTS awards_lifecycle_idx ON public.awards (award_lifecycle_status);

-- ============================================================
-- SECTION 12: NEW TABLES — rfq_evaluations, award_approvals
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rfq_evaluations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  quotation_id          UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  supplier_id           UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  commercial_weight     NUMERIC(5,2) NOT NULL DEFAULT 60,
  technical_weight      NUMERIC(5,2) NOT NULL DEFAULT 25,
  risk_weight           NUMERIC(5,2) NOT NULL DEFAULT 15,
  price_score           NUMERIC(5,2),
  lead_time_score       NUMERIC(5,2),
  payment_term_score    NUMERIC(5,2),
  commercial_score      NUMERIC(5,2),
  technical_score       NUMERIC(5,2),
  risk_score            NUMERIC(5,2),
  final_score           NUMERIC(5,2),
  rank                  INTEGER,
  is_recommended_winner BOOLEAN DEFAULT false,
  warnings              JSONB DEFAULT '[]'::jsonb,
  evaluated_by          UUID REFERENCES auth.users(id),
  evaluated_at          TIMESTAMPTZ DEFAULT now(),
  created_at            TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.rfq_evaluations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS rfq_eval_rfq_idx       ON public.rfq_evaluations (rfq_id);
CREATE INDEX IF NOT EXISTS rfq_eval_quotation_idx ON public.rfq_evaluations (quotation_id);
CREATE INDEX IF NOT EXISTS rfq_eval_supplier_idx  ON public.rfq_evaluations (supplier_id);

CREATE TABLE IF NOT EXISTS public.award_approvals (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                  UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  recommended_supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  quotation_id            UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  approval_level          public.approval_level_enum NOT NULL,
  approver_role           public.app_role,
  approver_id             UUID REFERENCES auth.users(id),
  approval_status         public.approval_decision_enum NOT NULL DEFAULT 'pending',
  approval_comment        TEXT,
  level_order             INTEGER NOT NULL DEFAULT 0,
  required                BOOLEAN NOT NULL DEFAULT true,
  approved_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.award_approvals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS award_approvals_rfq_idx       ON public.award_approvals (rfq_id);
CREATE INDEX IF NOT EXISTS award_approvals_quotation_idx ON public.award_approvals (quotation_id);
CREATE INDEX IF NOT EXISTS award_approvals_status_idx    ON public.award_approvals (approval_status);
CREATE INDEX IF NOT EXISTS award_approvals_rfq_order_idx ON public.award_approvals (rfq_id, level_order);

-- ============================================================
-- SECTION 13: UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sra_updated_at ON public.supplier_risk_assessments;
CREATE TRIGGER trg_sra_updated_at
  BEFORE UPDATE ON public.supplier_risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_award_approvals_updated_at ON public.award_approvals;
CREATE TRIGGER trg_award_approvals_updated_at
  BEFORE UPDATE ON public.award_approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- SECTION 14: ROW LEVEL SECURITY (base tables — idempotent)
-- ============================================================

-- user_roles
DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "New users can insert own role" ON public.user_roles;
CREATE POLICY "New users can insert own role" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- profiles
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "System inserts profiles" ON public.profiles;
CREATE POLICY "System inserts profiles" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (true);

-- suppliers
DROP POLICY IF EXISTS "Internal users read suppliers" ON public.suppliers;
CREATE POLICY "Internal users read suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'executive') OR
    (public.has_role(auth.uid(), 'supplier') AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Admin/proc create suppliers" ON public.suppliers;
CREATE POLICY "Admin/proc create suppliers" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'supplier')
  );

DROP POLICY IF EXISTS "Admin/proc update suppliers" ON public.suppliers;
CREATE POLICY "Admin/proc update suppliers" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer')
  );

-- rfqs
DROP POLICY IF EXISTS "Read RFQs" ON public.rfqs;
CREATE POLICY "Read RFQs" ON public.rfqs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manage RFQs" ON public.rfqs;
CREATE POLICY "Manage RFQs" ON public.rfqs
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer')
  );

-- rfq_items
DROP POLICY IF EXISTS "Read RFQ items" ON public.rfq_items;
CREATE POLICY "Read RFQ items" ON public.rfq_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manage RFQ items" ON public.rfq_items;
CREATE POLICY "Manage RFQ items" ON public.rfq_items
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer')
  );

-- rfq_suppliers
DROP POLICY IF EXISTS "Read RFQ suppliers" ON public.rfq_suppliers;
CREATE POLICY "Read RFQ suppliers" ON public.rfq_suppliers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manage RFQ suppliers" ON public.rfq_suppliers;
CREATE POLICY "Manage RFQ suppliers" ON public.rfq_suppliers
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer')
  );

-- quotations
DROP POLICY IF EXISTS "Read quotations" ON public.quotations;
CREATE POLICY "Read quotations" ON public.quotations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manage quotations" ON public.quotations;
CREATE POLICY "Manage quotations" ON public.quotations
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'supplier')
  );

-- awards
DROP POLICY IF EXISTS "Read awards" ON public.awards;
CREATE POLICY "Read awards" ON public.awards
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manage awards" ON public.awards;
CREATE POLICY "Manage awards" ON public.awards
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver')
  );

-- audit_logs
DROP POLICY IF EXISTS "Read audit logs" ON public.audit_logs;
CREATE POLICY "Read audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer')
  );

DROP POLICY IF EXISTS "Insert audit logs" ON public.audit_logs;
CREATE POLICY "Insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- system_settings
DROP POLICY IF EXISTS "Admins manage settings" ON public.system_settings;
CREATE POLICY "Admins manage settings" ON public.system_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated read settings" ON public.system_settings;
CREATE POLICY "Authenticated read settings" ON public.system_settings
  FOR SELECT TO authenticated USING (true);

-- supplier_risk_assessments
DROP POLICY IF EXISTS "Read supplier risk assessments" ON public.supplier_risk_assessments;
CREATE POLICY "Read supplier risk assessments" ON public.supplier_risk_assessments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manage supplier risk assessments" ON public.supplier_risk_assessments;
CREATE POLICY "Manage supplier risk assessments" ON public.supplier_risk_assessments
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver')
  );

-- rfq_evaluations
DROP POLICY IF EXISTS "Read rfq evaluations" ON public.rfq_evaluations;
CREATE POLICY "Read rfq evaluations" ON public.rfq_evaluations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manage rfq evaluations" ON public.rfq_evaluations;
CREATE POLICY "Manage rfq evaluations" ON public.rfq_evaluations
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver')
  );

-- award_approvals
DROP POLICY IF EXISTS "Read award approvals" ON public.award_approvals;
CREATE POLICY "Read award approvals" ON public.award_approvals
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manage award approvals" ON public.award_approvals;
CREATE POLICY "Manage award approvals" ON public.award_approvals
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'executive')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'executive')
  );

-- ============================================================
-- SECTION 15: SCORING HELPER FUNCTIONS
-- ============================================================

-- risk_level → numeric score (low=100 medium=75 high=50 critical=0)
CREATE OR REPLACE FUNCTION public.risk_level_to_score(level public.risk_level_enum)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE level
    WHEN 'low'      THEN 100
    WHEN 'medium'   THEN  75
    WHEN 'high'     THEN  50
    WHEN 'critical' THEN   0
  END::NUMERIC
$$;

-- Price score: lower price → higher score.
CREATE OR REPLACE FUNCTION public.calc_price_score(candidate_price NUMERIC, min_price NUMERIC)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN candidate_price IS NULL OR candidate_price <= 0 THEN 0
    WHEN min_price IS NULL OR min_price <= 0             THEN 0
    ELSE LEAST(100, GREATEST(0, ROUND((min_price / candidate_price) * 100, 2)))
  END
$$;

-- Lead-time score: shorter days → higher score.
CREATE OR REPLACE FUNCTION public.calc_lead_time_score(candidate_days INTEGER, min_days INTEGER)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN candidate_days IS NULL OR candidate_days <= 0 THEN 0
    WHEN min_days IS NULL OR min_days <= 0             THEN 0
    ELSE LEAST(100, GREATEST(0, ROUND((min_days::NUMERIC / candidate_days::NUMERIC) * 100, 2)))
  END
$$;

-- ============================================================
-- SECTION 16: AUDIT LOG RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.write_audit_log(
  _entity_type TEXT,
  _entity_id   UUID,
  _action      TEXT,
  _old_values  JSONB DEFAULT NULL,
  _new_values  JSONB DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    entity_type, entity_id, action, old_values, new_values, performed_by
  ) VALUES (
    _entity_type, _entity_id, _action, _old_values, _new_values, auth.uid()
  ) RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- Auth trigger: auto-create profile on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT EXECUTE ON FUNCTION public.write_audit_log(TEXT, UUID, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classify_risk_level(NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.risk_level_to_score(public.risk_level_enum) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calc_price_score(NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calc_lead_time_score(INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- SECTION 17: STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-documents', 'supplier-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload supplier docs" ON storage.objects;
CREATE POLICY "Authenticated users can upload supplier docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'supplier-documents');

DROP POLICY IF EXISTS "Authenticated users can read supplier docs" ON storage.objects;
CREATE POLICY "Authenticated users can read supplier docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'supplier-documents');

DROP POLICY IF EXISTS "Authenticated users can delete own supplier docs" ON storage.objects;
CREATE POLICY "Authenticated users can delete own supplier docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'supplier-documents' AND auth.uid() = owner);

-- ============================================================
-- SECTION 18: SEED DATA
-- ============================================================

INSERT INTO public.evaluation_templates (template_name, is_active)
VALUES ('Default Procurement Template', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.supplier_tiers (tier_name, description) VALUES
  ('Critical Tier 1',     'Strategic suppliers critical to operations'),
  ('Non-Critical Tier 1', 'Important but non-critical suppliers')
ON CONFLICT (tier_name) DO NOTHING;

INSERT INTO public.system_settings (key, value)
VALUES ('email_config', '{
  "email_enabled": false, "smtp_host": "", "smtp_port": 587,
  "smtp_user": "", "smtp_password": "",
  "sender_name": "Smart Procurement", "sender_email": ""
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.system_settings (key, value)
VALUES ('procurement_config', '{
  "finance_approval_threshold": 50000,
  "scoring_weights": { "commercial": 60, "technical": 25, "risk": 15 },
  "warn_lowest_price_high_risk": true
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
