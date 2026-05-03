-- Price-list quotation history.
-- Every supplier submission (Excel import, Portal, manual) leaves an immutable row
-- so procurement can trace pricing trends over time.

CREATE TABLE IF NOT EXISTS public.price_list_quotation_history (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_item_id     UUID NOT NULL REFERENCES public.price_list_items(id)  ON DELETE CASCADE,
  supplier_id            UUID NOT NULL REFERENCES public.suppliers(id)         ON DELETE CASCADE,
  unit_price             NUMERIC(15,2) NOT NULL,
  moq                    NUMERIC(15,2),
  lead_time_days         INTEGER,
  reference_quotation_no TEXT,
  notes                  TEXT,
  rfq_number             TEXT,                   -- optional procurement-side cross-ref
  source                 TEXT NOT NULL DEFAULT 'unknown'    -- 'excel' | 'portal' | 'manual'
                         CHECK (source IN ('excel','portal','manual','unknown')),
  submitted_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qh_item_supplier_date
  ON public.price_list_quotation_history(price_list_item_id, supplier_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_qh_supplier_date
  ON public.price_list_quotation_history(supplier_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_qh_item_date
  ON public.price_list_quotation_history(price_list_item_id, submitted_at DESC);

COMMENT ON TABLE  public.price_list_quotation_history IS
  'Immutable log of every quotation/price submission per item per supplier — used for trend & search.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.price_list_quotation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qh_read_authenticated" ON public.price_list_quotation_history;
CREATE POLICY "qh_read_authenticated" ON public.price_list_quotation_history
  FOR SELECT TO authenticated
  USING (
    -- Procurement / admin / approver / executive: see all history
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'procurement_officer')
    OR public.has_role(auth.uid(), 'approver')
    OR public.has_role(auth.uid(), 'executive')
    -- Supplier: only see their own history
    OR (
      public.has_role(auth.uid(), 'supplier')
      AND supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "qh_insert" ON public.price_list_quotation_history;
CREATE POLICY "qh_insert" ON public.price_list_quotation_history
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'procurement_officer')
    OR (
      public.has_role(auth.uid(), 'supplier')
      AND supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- History is immutable — no UPDATE / DELETE policies.

-- ── Auto-history trigger on price_list_item_suppliers ────────────────────────
-- Whenever a supplier offer is upserted, snapshot it into the history table.
-- This guarantees we never lose data even when callers forget to write history.

CREATE OR REPLACE FUNCTION public.fn_snapshot_quotation_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only snapshot when price actually changes (or on first insert)
  IF TG_OP = 'INSERT' OR OLD.unit_price IS DISTINCT FROM NEW.unit_price
     OR OLD.moq IS DISTINCT FROM NEW.moq
     OR OLD.lead_time_days IS DISTINCT FROM NEW.lead_time_days THEN
    INSERT INTO public.price_list_quotation_history
      (price_list_item_id, supplier_id, unit_price, moq, lead_time_days,
       reference_quotation_no, notes, source, submitted_by)
    VALUES
      (NEW.price_list_item_id, NEW.supplier_id, NEW.unit_price, NEW.moq, NEW.lead_time_days,
       NEW.reference_quotation_no, NEW.notes,
       COALESCE(NULLIF(current_setting('app.quotation_source', true), ''), 'unknown'),
       auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_snapshot_quotation ON public.price_list_item_suppliers;
CREATE TRIGGER trg_snapshot_quotation
  AFTER INSERT OR UPDATE ON public.price_list_item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_snapshot_quotation_history();

-- ── Backfill existing offers as the first historical snapshot ────────────────
INSERT INTO public.price_list_quotation_history
  (price_list_item_id, supplier_id, unit_price, moq, lead_time_days,
   reference_quotation_no, notes, source, submitted_at)
SELECT
  price_list_item_id, supplier_id, unit_price, moq, lead_time_days,
  reference_quotation_no, notes, 'manual', COALESCE(updated_at, created_at, now())
FROM public.price_list_item_suppliers
WHERE NOT EXISTS (
  SELECT 1 FROM public.price_list_quotation_history h
  WHERE h.price_list_item_id = price_list_item_suppliers.price_list_item_id
    AND h.supplier_id        = price_list_item_suppliers.supplier_id
);
