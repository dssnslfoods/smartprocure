-- Tenant-scoped, admin-only RPCs to count and clear TRANSACTION data only
-- (จัดซื้อ: RFQ / e-Bidding / Final Quotations / Awards and their children).
-- Master data (suppliers, catalog/price_lists) is never touched.
-- Used by Admin Settings → ระบบ → "ล้างข้อมูล Transaction" to reset a test
-- environment before going live.

CREATE OR REPLACE FUNCTION public.count_transaction_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _c jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;
  _tenant := get_user_tenant_id(auth.uid());
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'no tenant context';
  END IF;

  SELECT jsonb_build_object(
    'rfqs',             (SELECT count(*) FROM rfqs             WHERE tenant_id=_tenant),
    'rfq_items',        (SELECT count(*) FROM rfq_items        WHERE tenant_id=_tenant),
    'rfq_suppliers',    (SELECT count(*) FROM rfq_suppliers    WHERE tenant_id=_tenant),
    'rfq_evaluations',  (SELECT count(*) FROM rfq_evaluations  WHERE tenant_id=_tenant),
    'quotations',       (SELECT count(*) FROM quotations       WHERE tenant_id=_tenant),
    'quotation_items',  (SELECT count(*) FROM quotation_items  WHERE tenant_id=_tenant),
    'bidding_events',   (SELECT count(*) FROM bidding_events   WHERE tenant_id=_tenant),
    'bid_entries',      (SELECT count(*) FROM bid_entries      WHERE tenant_id=_tenant),
    'final_quotations', (SELECT count(*) FROM final_quotations WHERE tenant_id=_tenant),
    'awards',           (SELECT count(*) FROM awards           WHERE tenant_id=_tenant),
    'award_approvals',  (SELECT count(*) FROM award_approvals  WHERE tenant_id=_tenant),
    'approval_logs',    (SELECT count(*) FROM approval_logs    WHERE tenant_id=_tenant)
  ) INTO _c;
  RETURN _c;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_transaction_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _counts jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;
  _tenant := get_user_tenant_id(auth.uid());
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'no tenant context';
  END IF;

  _counts := public.count_transaction_data();

  -- FK-safe order: children first
  DELETE FROM award_approvals  WHERE tenant_id=_tenant;
  DELETE FROM approval_logs    WHERE tenant_id=_tenant;
  DELETE FROM awards           WHERE tenant_id=_tenant;
  DELETE FROM final_quotations WHERE tenant_id=_tenant;
  DELETE FROM bid_entries      WHERE tenant_id=_tenant;
  DELETE FROM bidding_events   WHERE tenant_id=_tenant;
  DELETE FROM quotation_items  WHERE tenant_id=_tenant;
  DELETE FROM quotations       WHERE tenant_id=_tenant;
  DELETE FROM rfq_evaluations  WHERE tenant_id=_tenant;
  DELETE FROM rfq_suppliers    WHERE tenant_id=_tenant;
  DELETE FROM rfq_items        WHERE tenant_id=_tenant;
  DELETE FROM rfqs             WHERE tenant_id=_tenant;

  RETURN _counts;
END;
$$;

REVOKE ALL ON FUNCTION public.count_transaction_data() FROM anon;
REVOKE ALL ON FUNCTION public.clear_transaction_data() FROM anon;
GRANT EXECUTE ON FUNCTION public.count_transaction_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_transaction_data() TO authenticated;
