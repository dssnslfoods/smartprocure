-- ============================================================
-- CLEANUP: Remove evaluation feature tables (not used in app)
-- Drop in FK-safe order (children first)
-- ============================================================

DROP TABLE IF EXISTS public.supplier_evaluation_scores CASCADE;
DROP TABLE IF EXISTS public.supplier_evaluations          CASCADE;
DROP TABLE IF EXISTS public.evaluation_criteria           CASCADE;
DROP TABLE IF EXISTS public.evaluation_templates          CASCADE;
DROP TABLE IF EXISTS public.supplier_score_summary        CASCADE;
DROP TABLE IF EXISTS public.supplier_tiers                CASCADE;
