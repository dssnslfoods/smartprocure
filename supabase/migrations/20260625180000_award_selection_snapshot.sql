-- Freeze the winner + selection criteria/scores at award time.
-- Master data (risk criteria, scoring weights, technical checklist) changes over time,
-- so each award keeps a self-contained snapshot for later lookup/audit.
ALTER TABLE public.awards
  ADD COLUMN IF NOT EXISTS selection_snapshot jsonb;
