-- Per-RFQ technical checklist + supplier responses.
--
-- Procurement defines weighted technical criteria for each RFQ; suppliers fill in their
-- spec value per item and mark whether it meets the requirement. The quotation's
-- technical score (stored in quotations.spec_compliance_score) is the weighted % of
-- met criteria, feeding the existing bid-comparison Technical pillar.

-- Generic tenant auto-fill (idempotent; reused by both tables below).
CREATE OR REPLACE FUNCTION public.set_tenant_id_from_user()
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

-- ── 1. rfq_technical_criteria ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rfq_technical_criteria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rfq_id      uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  label       text NOT NULL,
  description text,
  weight      numeric NOT NULL DEFAULT 1 CHECK (weight > 0),
  sort_order  int NOT NULL DEFAULT 0,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rfq_tech_criteria_rfq ON public.rfq_technical_criteria (rfq_id, sort_order);

DROP TRIGGER IF EXISTS trg_set_rfq_tech_tenant ON public.rfq_technical_criteria;
CREATE TRIGGER trg_set_rfq_tech_tenant
  BEFORE INSERT ON public.rfq_technical_criteria
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_from_user();

ALTER TABLE public.rfq_technical_criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read rfq tech criteria" ON public.rfq_technical_criteria;
CREATE POLICY "read rfq tech criteria" ON public.rfq_technical_criteria
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "manage rfq tech criteria" ON public.rfq_technical_criteria;
CREATE POLICY "manage rfq tech criteria" ON public.rfq_technical_criteria
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'procurement_officer'))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'procurement_officer')
  );

-- ── 2. quotation_technical_responses ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotation_technical_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quotation_id  uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  criterion_id  uuid NOT NULL REFERENCES public.rfq_technical_criteria(id) ON DELETE CASCADE,
  value         text,
  is_met        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quotation_id, criterion_id)
);
CREATE INDEX IF NOT EXISTS idx_quote_tech_resp_quote ON public.quotation_technical_responses (quotation_id);

DROP TRIGGER IF EXISTS trg_set_quote_tech_resp_tenant ON public.quotation_technical_responses;
CREATE TRIGGER trg_set_quote_tech_resp_tenant
  BEFORE INSERT ON public.quotation_technical_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_from_user();

ALTER TABLE public.quotation_technical_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read quote tech resp" ON public.quotation_technical_responses;
CREATE POLICY "read quote tech resp" ON public.quotation_technical_responses
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Any authenticated member of the tenant (incl. the supplier submitting the quote, and
-- procurement) may write responses for quotations in their tenant.
DROP POLICY IF EXISTS "write quote tech resp" ON public.quotation_technical_responses;
CREATE POLICY "write quote tech resp" ON public.quotation_technical_responses
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
