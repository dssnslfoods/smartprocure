-- ============================================================
-- BRCGS Food Safety: Nominated Supplier system for Price Lists
-- ------------------------------------------------------------
-- Aligns Price List domain with BRCGS Vendor Risk principles:
--   • Price list "เล่ม" → categorized by material type
--   • Items can be NOMINATED by customer (locked to 1 supplier)
--   • Nominated items track: customer, letter, date, QA workflow
--   • Offers carry BRCGS evidence: Spec, COA, ref quotation
-- ============================================================

-- 1) Price list category (เล่ม)
DO $$ BEGIN
  CREATE TYPE public.price_list_category_enum AS ENUM (
    'raw_material',  -- วัตถุดิบ
    'packaging',     -- บรรจุภัณฑ์
    'service',       -- บริการ
    'other'          -- อื่นๆ
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.price_lists
  ADD COLUMN IF NOT EXISTS category public.price_list_category_enum
    NOT NULL DEFAULT 'other';

CREATE INDEX IF NOT EXISTS idx_price_lists_category
  ON public.price_lists(category);

-- 2) Nomination workflow (BRCGS section 5)
DO $$ BEGIN
  CREATE TYPE public.nomination_status_enum AS ENUM (
    'pending_customer',     -- รอลูกค้ายืนยัน
    'qa_review',            -- QA กำลังตรวจสอบ
    'conditional_approved', -- อนุมัติแบบมีเงื่อนไข
    'approved',             -- อนุมัติเต็มรูปแบบ
    'rejected',             -- ไม่อนุมัติ
    'blocked'               -- ระงับการใช้งาน
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.price_list_items
  ADD COLUMN IF NOT EXISTS is_nominated          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nominated_customer    TEXT,
  ADD COLUMN IF NOT EXISTS nomination_letter_url TEXT,
  ADD COLUMN IF NOT EXISTS nomination_date       DATE,
  ADD COLUMN IF NOT EXISTS nomination_status     public.nomination_status_enum,
  ADD COLUMN IF NOT EXISTS nomination_qa_note    TEXT,
  ADD COLUMN IF NOT EXISTS qa_reviewed_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qa_reviewed_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pli_nominated
  ON public.price_list_items(is_nominated)
  WHERE is_nominated = true;

CREATE INDEX IF NOT EXISTS idx_pli_nomination_status
  ON public.price_list_items(nomination_status)
  WHERE nomination_status IS NOT NULL;

-- Migrate existing "designated" data → BRCGS nomination
-- Items with designated_supplier_id set are pre-existing customer designations.
-- Treat as nominated + approved (legacy approval).
UPDATE public.price_list_items
SET is_nominated = true,
    nomination_status = 'approved',
    nomination_date = COALESCE(designated_at::date, current_date)
WHERE designated_supplier_id IS NOT NULL
  AND is_nominated = false;

COMMENT ON COLUMN public.price_list_items.is_nominated IS
  'BRCGS Nominated Supplier flag. When true, only the designated_supplier_id may have an offer for this item.';

-- 3) Per-offer BRCGS evidence (Spec, COA, reference quotation)
ALTER TABLE public.price_list_item_suppliers
  ADD COLUMN IF NOT EXISTS spec_url                 TEXT,
  ADD COLUMN IF NOT EXISTS coa_url                  TEXT,
  ADD COLUMN IF NOT EXISTS reference_quotation_no   TEXT,
  ADD COLUMN IF NOT EXISTS reference_quotation_date DATE;

COMMENT ON COLUMN public.price_list_item_suppliers.spec_url IS
  'Product specification document (BRCGS Section 5 evidence).';
COMMENT ON COLUMN public.price_list_item_suppliers.coa_url IS
  'Certificate of Analysis (BRCGS Section 5 evidence).';
COMMENT ON COLUMN public.price_list_item_suppliers.reference_quotation_no IS
  'Original quotation reference number used to seed this price.';

-- 4) Audit trigger (re-uses set_updated_at — created in earlier migration)
-- price_list_items already has trg_pli_updated_at from previous migration.
