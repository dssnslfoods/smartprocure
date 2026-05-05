-- Authoritative visibility helper for the catalog list page.
-- SECURITY DEFINER + explicit role + allow-list check, used by the frontend
-- as the source of truth (with .in() filtering) instead of relying on RLS
-- pass-through alone.

CREATE OR REPLACE FUNCTION public.my_visible_catalog_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sid UUID;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  IF public.has_role(v_uid, 'admin')
     OR public.has_role(v_uid, 'procurement_officer')
     OR public.has_role(v_uid, 'approver')
     OR public.has_role(v_uid, 'executive') THEN
    RETURN QUERY SELECT id FROM public.price_lists;
    RETURN;
  END IF;

  IF public.has_role(v_uid, 'supplier') THEN
    SELECT supplier_id INTO v_sid FROM public.profiles WHERE id = v_uid;
    RETURN QUERY
      SELECT pl.id FROM public.price_lists pl
       WHERE NOT EXISTS (SELECT 1 FROM public.price_list_visible_suppliers v WHERE v.price_list_id = pl.id)
          OR EXISTS (
            SELECT 1 FROM public.price_list_visible_suppliers v
             WHERE v.price_list_id = pl.id
               AND v_sid IS NOT NULL
               AND v.supplier_id = v_sid
          );
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.my_visible_catalog_ids() TO authenticated;
