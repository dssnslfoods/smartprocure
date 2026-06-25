-- Manual winner selection support + justification for off-score (override) awards.
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS is_recommended_winner boolean NOT NULL DEFAULT false;

ALTER TABLE public.awards
  ADD COLUMN IF NOT EXISTS selection_reason text,
  ADD COLUMN IF NOT EXISTS is_override_selection boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
