-- NCR (Non-Conformance Report) Module
-- Tracks supplier non-conformance events, severity, CAPA, and feeds the
-- ncr_history_risk factor inside the Vendor Risk Assessment.

DO $$ BEGIN CREATE TYPE public.ncr_severity_enum AS ENUM (
  'minor','major','critical'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.ncr_status_enum AS ENUM (
  'open','in_progress','closed','cancelled'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.supplier_ncrs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ncr_number           TEXT UNIQUE,
  supplier_id          UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  category             TEXT NOT NULL,
  severity             public.ncr_severity_enum NOT NULL DEFAULT 'minor',
  product_description  TEXT,
  lot_number           TEXT,
  rfq_id               UUID REFERENCES public.rfqs(id) ON DELETE SET NULL,
  detected_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  detected_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  description          TEXT NOT NULL,
  evidence_url         TEXT,
  root_cause           TEXT,
  corrective_action    TEXT,
  capa_due_date        DATE,
  closed_date          DATE,
  status               public.ncr_status_enum NOT NULL DEFAULT 'open',
  assigned_to          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ncr_supplier_date ON public.supplier_ncrs(supplier_id, detected_date DESC);
CREATE INDEX IF NOT EXISTS idx_ncr_status        ON public.supplier_ncrs(status);
CREATE INDEX IF NOT EXISTS idx_ncr_severity      ON public.supplier_ncrs(severity);

CREATE OR REPLACE FUNCTION public.fn_set_ncr_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_year TEXT := to_char(now(), 'YYYY');
  v_seq  INT;
BEGIN
  IF NEW.ncr_number IS NULL OR NEW.ncr_number = '' THEN
    SELECT COALESCE(MAX(CAST(split_part(ncr_number,'-',3) AS INT)), 0) + 1
      INTO v_seq
      FROM public.supplier_ncrs
     WHERE ncr_number LIKE 'NCR-' || v_year || '-%';
    NEW.ncr_number := 'NCR-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_ncr_number ON public.supplier_ncrs;
CREATE TRIGGER trg_set_ncr_number
  BEFORE INSERT ON public.supplier_ncrs
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_ncr_number();

CREATE OR REPLACE FUNCTION public.fn_touch_ncr_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') AND NEW.closed_date IS NULL THEN
    NEW.closed_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_ncr_updated_at ON public.supplier_ncrs;
CREATE TRIGGER trg_touch_ncr_updated_at
  BEFORE UPDATE ON public.supplier_ncrs
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_ncr_updated_at();

ALTER TABLE public.supplier_ncrs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ncr_read" ON public.supplier_ncrs;
CREATE POLICY "ncr_read" ON public.supplier_ncrs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'executive') OR
    (public.has_role(auth.uid(), 'supplier')
     AND supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid()))
  );

DROP POLICY IF EXISTS "ncr_insert" ON public.supplier_ncrs;
CREATE POLICY "ncr_insert" ON public.supplier_ncrs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver')
  );

DROP POLICY IF EXISTS "ncr_update" ON public.supplier_ncrs;
CREATE POLICY "ncr_update" ON public.supplier_ncrs
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver') OR
    (public.has_role(auth.uid(), 'supplier')
     AND supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid()))
  );

DROP POLICY IF EXISTS "ncr_delete" ON public.supplier_ncrs;
CREATE POLICY "ncr_delete" ON public.supplier_ncrs
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Risk-score helper
CREATE OR REPLACE FUNCTION public.compute_ncr_risk_score(p_supplier_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_minor INT; v_major INT; v_critical INT; v_overdue INT;
  v_recent_crit INT; v_recent_cnt INT; v_prior_cnt INT;
  v_score NUMERIC := 0;
BEGIN
  IF p_supplier_id IS NULL THEN RETURN 0; END IF;

  SELECT
    COUNT(*) FILTER (WHERE severity = 'minor'    AND detected_date >= now() - INTERVAL '12 months'),
    COUNT(*) FILTER (WHERE severity = 'major'    AND detected_date >= now() - INTERVAL '12 months'),
    COUNT(*) FILTER (WHERE severity = 'critical' AND detected_date >= now() - INTERVAL '12 months'),
    COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND detected_date < now() - INTERVAL '30 days'),
    COUNT(*) FILTER (WHERE severity = 'critical' AND detected_date >= now() - INTERVAL '90 days'),
    COUNT(*) FILTER (WHERE detected_date >= now() - INTERVAL '6 months'),
    COUNT(*) FILTER (WHERE detected_date >= now() - INTERVAL '12 months'
                       AND detected_date <  now() - INTERVAL '6 months')
  INTO v_minor, v_major, v_critical, v_overdue, v_recent_crit, v_recent_cnt, v_prior_cnt
  FROM public.supplier_ncrs
  WHERE supplier_id = p_supplier_id;

  v_score := v_minor * 1 + v_major * 3 + v_critical * 5
           + v_overdue * 2
           + (CASE WHEN v_recent_crit > 0 THEN 3 ELSE 0 END)
           + (CASE WHEN v_recent_cnt > v_prior_cnt THEN 2 ELSE 0 END);

  IF v_score > 10 THEN v_score := 10; END IF;
  RETURN v_score;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_ncr_risk_score(UUID) TO authenticated;
