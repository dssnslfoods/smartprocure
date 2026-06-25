-- ============================================================
-- Remove ESG (Environmental, Social, Governance) features
-- ESG tracking is no longer part of the procurement workflow.
-- ============================================================

-- 1. Drop ESG RLS policies before dropping the table
DROP POLICY IF EXISTS "Read ESG"        ON public.supplier_esg_profiles;
DROP POLICY IF EXISTS "Admin manage ESG" ON public.supplier_esg_profiles;

-- 2. Drop the ESG profiles table
DROP TABLE IF EXISTS public.supplier_esg_profiles CASCADE;

-- 3. Remove esg_score column from supplier_score_summary (if table and column exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'supplier_score_summary'
      AND column_name  = 'esg_score'
  ) THEN
    EXECUTE 'ALTER TABLE public.supplier_score_summary DROP COLUMN esg_score';
  END IF;
END $$;

-- 4. Remove ESG criterion from evaluation templates (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'evaluation_criteria'
  ) THEN
    EXECUTE 'DELETE FROM public.evaluation_criteria WHERE criteria_name = ''ESG Behavior''';
  END IF;
END $$;
