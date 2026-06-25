-- system_settings.tenant_id is NOT NULL but had no auto-fill, so inserting a new
-- settings key (e.g. scoring_weights) failed with a not-null violation.
-- Auto-set tenant_id from the inserting user, matching the pattern on other tables.
DROP TRIGGER IF EXISTS trg_set_system_settings_tenant ON public.system_settings;
CREATE TRIGGER trg_set_system_settings_tenant
  BEFORE INSERT ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_from_user();
