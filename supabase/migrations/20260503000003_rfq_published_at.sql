-- Add published_at column to rfqs to record exactly when an RFQ went live.
ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Auto-stamp published_at the first time status flips to 'published'.
CREATE OR REPLACE FUNCTION public.fn_rfq_stamp_published_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'published' AND (OLD.status IS DISTINCT FROM 'published') AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rfq_stamp_published_at ON public.rfqs;
CREATE TRIGGER trg_rfq_stamp_published_at
  BEFORE UPDATE ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION public.fn_rfq_stamp_published_at();

-- Backfill existing rows.
UPDATE public.rfqs
   SET published_at = COALESCE(updated_at, created_at)
 WHERE published_at IS NULL
   AND status IN ('published','closed','evaluation','awarded');
