-- Per-catalog supplier visibility allow-list.
-- Empty list = public (visible to all approved suppliers).
-- Any rows  = restricted to listed suppliers only.

CREATE TABLE IF NOT EXISTS public.price_list_visible_suppliers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  supplier_id   UUID NOT NULL REFERENCES public.suppliers(id)   ON DELETE CASCADE,
  added_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (price_list_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_plvs_pricelist ON public.price_list_visible_suppliers(price_list_id);
CREATE INDEX IF NOT EXISTS idx_plvs_supplier  ON public.price_list_visible_suppliers(supplier_id);

ALTER TABLE public.price_list_visible_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plvs_read" ON public.price_list_visible_suppliers;
CREATE POLICY "plvs_read" ON public.price_list_visible_suppliers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'executive') OR
    (public.has_role(auth.uid(), 'supplier')
     AND supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid()))
  );

DROP POLICY IF EXISTS "plvs_write" ON public.price_list_visible_suppliers;
CREATE POLICY "plvs_write" ON public.price_list_visible_suppliers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));

DROP POLICY IF EXISTS "Read price lists" ON public.price_lists;
CREATE POLICY "Read price lists" ON public.price_lists
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'executive') OR
    (
      public.has_role(auth.uid(), 'supplier') AND (
        NOT EXISTS (SELECT 1 FROM public.price_list_visible_suppliers v WHERE v.price_list_id = price_lists.id)
        OR EXISTS (
          SELECT 1 FROM public.price_list_visible_suppliers v
           WHERE v.price_list_id = price_lists.id
             AND v.supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "Read price list items" ON public.price_list_items;
CREATE POLICY "Read price list items" ON public.price_list_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'executive') OR
    (
      public.has_role(auth.uid(), 'supplier') AND EXISTS (
        SELECT 1 FROM public.price_lists pl
         WHERE pl.id = price_list_items.price_list_id
           AND (
             NOT EXISTS (SELECT 1 FROM public.price_list_visible_suppliers v WHERE v.price_list_id = pl.id)
             OR EXISTS (
               SELECT 1 FROM public.price_list_visible_suppliers v
                WHERE v.price_list_id = pl.id
                  AND v.supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
             )
           )
      )
    )
  );

COMMENT ON TABLE public.price_list_visible_suppliers IS
  'Per-catalog supplier allow-list. Empty list = public; any rows = restricted.';
