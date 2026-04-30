-- ============================================================
-- Migration 004: Add missing ENUMs, columns, and tables
-- These were in migration 001 which was marked applied without running.
-- All statements use IF NOT EXISTS / EXCEPTION guards — safe to re-run.
-- ============================================================

-- ============================================================
-- SECTION 1: ENUMS
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
-- SECTION 2: SUPPLIERS — new columns
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

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_supplier_code_key
  ON public.suppliers (supplier_code) WHERE supplier_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS suppliers_supplier_type_idx       ON public.suppliers (supplier_type);
CREATE INDEX IF NOT EXISTS suppliers_risk_level_idx          ON public.suppliers (risk_level);
CREATE INDEX IF NOT EXISTS suppliers_certificate_expiry_idx  ON public.suppliers (certificate_expiry_date);

-- ============================================================
-- SECTION 3: RFQs — new columns
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

CREATE INDEX IF NOT EXISTS rfqs_status_idx          ON public.rfqs (status);
CREATE INDEX IF NOT EXISTS rfqs_workflow_status_idx ON public.rfqs (workflow_status);

-- ============================================================
-- SECTION 4: RFQ_ITEMS — new columns
-- ============================================================
ALTER TABLE public.rfq_items
  ADD COLUMN IF NOT EXISTS specification         TEXT,
  ADD COLUMN IF NOT EXISTS required_date         DATE,
  ADD COLUMN IF NOT EXISTS estimated_budget      NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS technical_requirement TEXT;

-- ============================================================
-- SECTION 5: RFQ_SUPPLIERS — new columns
-- ============================================================
ALTER TABLE public.rfq_suppliers
  ADD COLUMN IF NOT EXISTS eligibility_status   TEXT,
  ADD COLUMN IF NOT EXISTS eligibility_notes    TEXT,
  ADD COLUMN IF NOT EXISTS override_approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS override_approved_at TIMESTAMPTZ;

-- ============================================================
-- SECTION 6: QUOTATIONS — new columns
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

CREATE INDEX IF NOT EXISTS quotations_rfq_idx               ON public.quotations (rfq_id);
CREATE INDEX IF NOT EXISTS quotations_supplier_idx          ON public.quotations (supplier_id);
CREATE INDEX IF NOT EXISTS quotations_evaluation_status_idx ON public.quotations (evaluation_status);

-- ============================================================
-- SECTION 7: AWARDS — new columns
-- ============================================================
ALTER TABLE public.awards
  ADD COLUMN IF NOT EXISTS award_no               TEXT,
  ADD COLUMN IF NOT EXISTS winning_quotation_id   UUID REFERENCES public.quotations(id),
  ADD COLUMN IF NOT EXISTS award_reason           TEXT,
  ADD COLUMN IF NOT EXISTS final_amount           NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS award_lifecycle_status public.award_lifecycle_status_enum DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS awarded_at             TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS awards_rfq_idx       ON public.awards (rfq_id);
CREATE INDEX IF NOT EXISTS awards_supplier_idx  ON public.awards (supplier_id);
CREATE INDEX IF NOT EXISTS awards_lifecycle_idx ON public.awards (award_lifecycle_status);

-- ============================================================
-- SECTION 8: SUPPLIER_RISK_ASSESSMENTS (new table)
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

DO $$ BEGIN
  CREATE POLICY "Authenticated users can manage risk assessments"
    ON public.supplier_risk_assessments FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SECTION 9: RFQ_EVALUATIONS (new table)
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

CREATE INDEX IF NOT EXISTS rfq_eval_rfq_idx  ON public.rfq_evaluations (rfq_id);
CREATE INDEX IF NOT EXISTS rfq_eval_quot_idx ON public.rfq_evaluations (quotation_id);

DO $$ BEGIN
  CREATE POLICY "Authenticated users can manage rfq evaluations"
    ON public.rfq_evaluations FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SECTION 10: AWARD_APPROVALS (new table)
-- ============================================================
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

CREATE INDEX IF NOT EXISTS award_approvals_rfq_idx ON public.award_approvals (rfq_id);

DO $$ BEGIN
  CREATE POLICY "Authenticated users can manage award approvals"
    ON public.award_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SECTION 11: FUNCTIONS
-- ============================================================
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

CREATE OR REPLACE FUNCTION public.sync_supplier_risk_level()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.suppliers
  SET risk_level = public.classify_risk_level(NEW.total_risk_score)
  WHERE id = NEW.supplier_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_supplier_risk ON public.supplier_risk_assessments;
CREATE TRIGGER trg_sync_supplier_risk
  AFTER INSERT OR UPDATE ON public.supplier_risk_assessments
  FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_risk_level();
