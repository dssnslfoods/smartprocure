-- Allow admin/super_admin to delete suppliers.
-- Provides check_supplier_transactions() to verify no transaction data exists before deletion.

CREATE OR REPLACE FUNCTION public.check_supplier_transactions(p_supplier_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  tx_count INT := 0;
  details JSONB := '[]'::jsonb;
  cnt INT;
BEGIN
  SELECT count(*) INTO cnt FROM quotations WHERE supplier_id = p_supplier_id;
  IF cnt > 0 THEN tx_count := tx_count + cnt; details := details || jsonb_build_array(jsonb_build_object('table', 'ใบเสนอราคา', 'count', cnt)); END IF;

  SELECT count(*) INTO cnt FROM rfq_suppliers WHERE supplier_id = p_supplier_id;
  IF cnt > 0 THEN tx_count := tx_count + cnt; details := details || jsonb_build_array(jsonb_build_object('table', 'RFQ', 'count', cnt)); END IF;

  SELECT count(*) INTO cnt FROM awards WHERE supplier_id = p_supplier_id;
  IF cnt > 0 THEN tx_count := tx_count + cnt; details := details || jsonb_build_array(jsonb_build_object('table', 'การจัดซื้อ (Award)', 'count', cnt)); END IF;

  SELECT count(*) INTO cnt FROM price_lists WHERE supplier_id = p_supplier_id;
  IF cnt > 0 THEN tx_count := tx_count + cnt; details := details || jsonb_build_array(jsonb_build_object('table', 'รายการราคา', 'count', cnt)); END IF;

  SELECT count(*) INTO cnt FROM bid_entries WHERE supplier_id = p_supplier_id;
  IF cnt > 0 THEN tx_count := tx_count + cnt; details := details || jsonb_build_array(jsonb_build_object('table', 'ข้อเสนอราคา (Bid)', 'count', cnt)); END IF;

  SELECT count(*) INTO cnt FROM final_quotations WHERE supplier_id = p_supplier_id;
  IF cnt > 0 THEN tx_count := tx_count + cnt; details := details || jsonb_build_array(jsonb_build_object('table', 'ใบเสนอราคาสุดท้าย', 'count', cnt)); END IF;

  RETURN json_build_object('has_transactions', tx_count > 0, 'total', tx_count, 'details', details);
END;
$$;

DROP POLICY IF EXISTS "Admin delete suppliers" ON public.suppliers;
CREATE POLICY "Admin delete suppliers" ON public.suppliers
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'admin')
  );
