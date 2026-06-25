-- Several tables have a NOT NULL tenant_id but no trigger to auto-fill it, so
-- client inserts that don't set tenant_id explicitly (e.g. award_approvals when
-- initiating the approval workflow, rfq_evaluations on Run Evaluation) fail with a
-- not-null violation. Add the auto-fill BEFORE INSERT trigger to all of them.
-- set_tenant_id_from_user() only sets tenant_id when NULL, so tables whose code
-- already provides it are unaffected.
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'approval_logs','audit_logs','award_approvals','price_list_quotation_history',
    'price_list_visible_suppliers','price_lists','quotation_items','rfq_evaluations',
    'supplier_contacts','supplier_risk_assessments','tenant_modules','tenant_role_modules',
    'tenant_suppliers','user_tenant_access'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_%1$s_tenant ON public.%1$s;', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_set_%1$s_tenant BEFORE INSERT ON public.%1$s '
      'FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_from_user();', tbl);
  END LOOP;
END $$;
