-- ============================================================
-- SPR ROLLBACK — Complete removal of the Supplier Performance Review module
-- Run this to restore the system to its pre-SPR state.
-- ============================================================

-- 1) Unschedule pg_cron jobs (if pg_cron is enabled)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('spr_generate_due_reviews');
    PERFORM cron.unschedule('spr_send_notifications');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron jobs not found or already removed: %', SQLERRM;
END;
$$;

-- 2) Drop the entire schema and all its objects
DROP SCHEMA IF EXISTS spr CASCADE;

-- 3) Remove the storage bucket (manual step — cannot be done via SQL)
-- Run in Supabase Dashboard: Storage → Delete bucket "supplier-review"

-- 4) Remove "spr" from Exposed Schemas in Supabase API settings (manual step)
-- Dashboard → Settings → API → Exposed schemas → remove "spr"

-- After running this script:
-- ✅ All spr tables, functions, triggers, views, policies are removed
-- ✅ No changes to public schema or existing tables
-- ✅ Existing app works exactly as before
