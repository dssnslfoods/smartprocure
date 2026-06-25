-- BRC-style risk criteria + catalog access gating.
--
-- Concept:
--   * risk_criteria  — admin-configurable checklist, scoped by catalog category + risk dimension.
--     A supplier "meets" a criterion when they hold a matching (non-expired) certificate or document.
--   * Per dimension, risk = (1 - metWeight/totalWeight) * 10  (higher = worse).
--       - any mandatory criterion unmet  => dimension forced to 10 (highest risk).
--       - no criteria defined            => dimension not assessed (null), not gated.
--   * price_lists.access_risk_rules — jsonb {dimension: maxAllowedRisk}. A supplier may see the
--     catalog only when every listed dimension score is <= its threshold.
--   * supplier_risk_assessments.manual_overrides — jsonb {dimension: value} for QA overrides; the
--     dimension columns store the effective (auto-or-override) score.

-- ── 1. risk_criteria ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.risk_criteria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category      text CHECK (category IN ('raw_material','packaging','service','other')), -- NULL = all categories
  dimension     text NOT NULL,                          -- matches RISK_FACTORS keys (e.g. food_safety_risk)
  code          text,
  name_th       text NOT NULL,
  description   text,
  weight        numeric NOT NULL DEFAULT 1 CHECK (weight > 0),
  match_type    text NOT NULL DEFAULT 'certificate' CHECK (match_type IN ('certificate','document')),
  match_keywords text[] NOT NULL DEFAULT '{}',          -- ILIKE-matched against cert/doc type or name
  is_mandatory  boolean NOT NULL DEFAULT false,
  sort_order    int NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_criteria_tenant_cat_dim
  ON public.risk_criteria (tenant_id, category, dimension);

-- Auto-set tenant_id from the inserting user (mirrors set_supplier_tenant_id).
CREATE OR REPLACE FUNCTION public.set_risk_criteria_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := get_user_tenant_id(auth.uid());
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required — user has no tenant assigned';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_risk_criteria_tenant_id ON public.risk_criteria;
CREATE TRIGGER trg_set_risk_criteria_tenant_id
  BEFORE INSERT ON public.risk_criteria
  FOR EACH ROW EXECUTE FUNCTION public.set_risk_criteria_tenant_id();

ALTER TABLE public.risk_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read risk criteria" ON public.risk_criteria;
CREATE POLICY "read risk criteria" ON public.risk_criteria
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "manage risk criteria" ON public.risk_criteria;
CREATE POLICY "manage risk criteria" ON public.risk_criteria
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'procurement_officer'))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'procurement_officer')
  );

-- ── 2. catalog access rules + assessment overrides ──────────────────────────────
ALTER TABLE public.price_lists
  ADD COLUMN IF NOT EXISTS access_risk_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.supplier_risk_assessments
  ADD COLUMN IF NOT EXISTS manual_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── 3. seed a default BRC-style criteria set for the primary tenant ──────────────
-- Keywords are matched case-insensitively (ILIKE %kw%) against certificate_type /
-- document_type / document_name, so both English acronyms and Thai labels are listed.
INSERT INTO public.risk_criteria
  (tenant_id, category, dimension, code, name_th, description, weight, match_type, match_keywords, is_mandatory, sort_order)
VALUES
  -- Global (all categories): financial + company standing + valid certification on file
  ('00000000-0000-0000-0000-000000000001', NULL, 'financial_risk', 'FIN-01', 'หนังสือรับรองบริษัท / ทะเบียนพาณิชย์',
     'เอกสารจดทะเบียนนิติบุคคลที่ยังเป็นปัจจุบัน', 2, 'document', ARRAY['หนังสือรับรอง','ทะเบียน','registration','ใบรับรองบริษัท','dbd'], true, 10),
  ('00000000-0000-0000-0000-000000000001', NULL, 'financial_risk', 'FIN-02', 'งบการเงิน / สถานะการเงิน',
     'งบการเงินล่าสุดเพื่อประเมินความมั่นคงทางการเงิน', 1, 'document', ARRAY['งบการเงิน','financial','statement','balance'], false, 20),
  ('00000000-0000-0000-0000-000000000001', NULL, 'certificate_risk', 'CERT-01', 'มีใบรับรองที่ยังไม่หมดอายุ',
     'มีใบรับรองมาตรฐานอย่างน้อย 1 ฉบับที่ยังมีผล', 2, 'certificate', ARRAY['iso','haccp','gmp','brc','fssc','halal','gหนังสือรับรอง','ใบรับรอง'], true, 10),

  -- Raw material: BRC food-safety pillars
  ('00000000-0000-0000-0000-000000000001', 'raw_material', 'food_safety_risk', 'FS-01', 'แผน HACCP',
     'ระบบวิเคราะห์อันตรายและจุดวิกฤต (HACCP) — ข้อกำหนดบังคับตาม BRC', 3, 'certificate', ARRAY['haccp'], true, 10),
  ('00000000-0000-0000-0000-000000000001', 'raw_material', 'food_safety_risk', 'FS-02', 'GMP / สุขลักษณะที่ดี',
     'หลักเกณฑ์วิธีการที่ดีในการผลิต (GMP/GHP)', 2, 'certificate', ARRAY['gmp','ghp','สุขลักษณะ'], false, 20),
  ('00000000-0000-0000-0000-000000000001', 'raw_material', 'food_safety_risk', 'FS-03', 'มาตรฐานความปลอดภัยอาหาร (BRCGS / ISO 22000 / FSSC 22000)',
     'การรับรองระบบความปลอดภัยอาหารระดับสากล', 2, 'certificate', ARRAY['brc','brcgs','iso 22000','iso22000','fssc'], false, 30),
  ('00000000-0000-0000-0000-000000000001', 'raw_material', 'allergen_risk', 'ALG-01', 'แผนจัดการสารก่อภูมิแพ้',
     'การควบคุมการปนเปื้อนข้ามของสารก่อภูมิแพ้', 2, 'document', ARRAY['allergen','สารก่อภูมิแพ้','ภูมิแพ้'], false, 10),
  ('00000000-0000-0000-0000-000000000001', 'raw_material', 'food_fraud_risk', 'VF-01', 'แผนป้องกันการปลอมปน (VACCP / Food Fraud)',
     'การประเมินและป้องกันการปลอมปนอาหาร', 2, 'document', ARRAY['vaccp','food fraud','ปลอมปน','authenticity'], false, 10),
  ('00000000-0000-0000-0000-000000000001', 'raw_material', 'quality_risk', 'QA-01', 'ใบรับรองผลวิเคราะห์ (COA)',
     'Certificate of Analysis แสดงคุณภาพสินค้า', 1, 'document', ARRAY['coa','certificate of analysis','ผลวิเคราะห์'], false, 10),

  -- Packaging: food-contact safety + quality system
  ('00000000-0000-0000-0000-000000000001', 'packaging', 'food_safety_risk', 'PKG-01', 'รับรองวัสดุสัมผัสอาหาร (Food Contact)',
     'เอกสารรับรองความปลอดภัยของวัสดุสัมผัสอาหาร', 3, 'document', ARRAY['food contact','สัมผัสอาหาร','migration','fda'], true, 10),
  ('00000000-0000-0000-0000-000000000001', 'packaging', 'quality_risk', 'PKG-02', 'ระบบบริหารคุณภาพ ISO 9001',
     'การรับรองระบบบริหารงานคุณภาพ', 2, 'certificate', ARRAY['iso 9001','iso9001'], false, 20),
  ('00000000-0000-0000-0000-000000000001', 'packaging', 'food_safety_risk', 'PKG-03', 'GMP บรรจุภัณฑ์',
     'หลักเกณฑ์การผลิตที่ดีสำหรับบรรจุภัณฑ์', 1, 'certificate', ARRAY['gmp','brc packaging','brcgs packaging'], false, 30),

  -- Service: quality management
  ('00000000-0000-0000-0000-000000000001', 'service', 'quality_risk', 'SVC-01', 'ระบบบริหารคุณภาพ ISO 9001',
     'การรับรองระบบบริหารงานคุณภาพของผู้ให้บริการ', 2, 'certificate', ARRAY['iso 9001','iso9001'], false, 10);
