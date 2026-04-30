-- ============================================================
-- Price List restructure: multi-supplier offers per item
-- ------------------------------------------------------------
--   • price_lists.supplier_id  → nullable (catalog may span suppliers)
--   • price_list_items         → drops unit_price/moq/lead_time_days
--                                adds item_code, designated_supplier_id, sort_order
--   • price_list_item_suppliers (NEW) → per-supplier offer per item
-- ============================================================

-- 1) price_lists.supplier_id becomes nullable
ALTER TABLE public.price_lists
  ALTER COLUMN supplier_id DROP NOT NULL;

-- 2) price_list_items: extend with code + designation + sort
ALTER TABLE public.price_list_items
  ADD COLUMN IF NOT EXISTS item_code              TEXT,
  ADD COLUMN IF NOT EXISTS sort_order             INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS designated_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS designated_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS designated_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS designation_note       TEXT,
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_pli_designated_supplier
  ON public.price_list_items(designated_supplier_id);

-- 3) NEW table: price_list_item_suppliers (per-supplier offers)
CREATE TABLE IF NOT EXISTS public.price_list_item_suppliers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_item_id  UUID NOT NULL REFERENCES public.price_list_items(id) ON DELETE CASCADE,
  supplier_id         UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  unit_price          NUMERIC(15,2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'THB',
  moq                 INTEGER,
  lead_time_days      INTEGER,
  is_preferred        BOOLEAN NOT NULL DEFAULT false,
  notes               TEXT,
  valid_from          DATE,
  valid_until         DATE,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (price_list_item_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_plis_item     ON public.price_list_item_suppliers(price_list_item_id);
CREATE INDEX IF NOT EXISTS idx_plis_supplier ON public.price_list_item_suppliers(supplier_id);

ALTER TABLE public.price_list_item_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read price list item suppliers" ON public.price_list_item_suppliers;
CREATE POLICY "Read price list item suppliers"
  ON public.price_list_item_suppliers
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Manage price list item suppliers" ON public.price_list_item_suppliers;
CREATE POLICY "Manage price list item suppliers"
  ON public.price_list_item_suppliers
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'supplier')
  );

-- 4) Migrate existing data: each (item, parent.supplier_id) → one offer row
INSERT INTO public.price_list_item_suppliers
  (price_list_item_id, supplier_id, unit_price, moq, lead_time_days, is_preferred, created_at, updated_at)
SELECT
  pli.id,
  pl.supplier_id,
  COALESCE(pli.unit_price, 0),
  pli.moq,
  pli.lead_time_days,
  true,
  COALESCE(pli.created_at, now()),
  COALESCE(pli.created_at, now())
FROM public.price_list_items pli
JOIN public.price_lists       pl  ON pl.id = pli.price_list_id
WHERE pl.supplier_id IS NOT NULL
ON CONFLICT (price_list_item_id, supplier_id) DO NOTHING;

-- 5) Set designation from migrated single-supplier lists (legacy = designated)
UPDATE public.price_list_items pli
SET designated_supplier_id = pl.supplier_id
FROM public.price_lists pl
WHERE pli.price_list_id = pl.id
  AND pl.supplier_id IS NOT NULL
  AND pli.designated_supplier_id IS NULL;

-- 6) Drop now-redundant columns from price_list_items
ALTER TABLE public.price_list_items
  DROP COLUMN IF EXISTS unit_price,
  DROP COLUMN IF EXISTS moq,
  DROP COLUMN IF EXISTS lead_time_days;

-- 7) updated_at helper + triggers (idempotent — safe if helper already exists)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plis_updated_at ON public.price_list_item_suppliers;
CREATE TRIGGER trg_plis_updated_at
  BEFORE UPDATE ON public.price_list_item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pli_updated_at ON public.price_list_items;
CREATE TRIGGER trg_pli_updated_at
  BEFORE UPDATE ON public.price_list_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
