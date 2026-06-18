-- Awards: auto-generate award_no on insert, backfill missing numbers/amounts,
-- and prevent duplicate awards created from the same final quotation.

-- 1) Remove accidental duplicates (a numbered award already exists for the same FQ)
DELETE FROM awards a
WHERE a.award_no IS NULL
  AND a.final_quotation_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM awards b
    WHERE b.final_quotation_id = a.final_quotation_id
      AND b.award_no IS NOT NULL
      AND b.id <> a.id
  );

-- 2) Backfill final_amount from amount
UPDATE awards SET final_amount = amount WHERE final_amount IS NULL AND amount IS NOT NULL;

-- 3) Backfill award_no for rows still missing one (continue the per-tenant sequence)
WITH base AS (
  SELECT tenant_id,
         (EXTRACT(YEAR FROM now())::int + 543) AS be,
         COALESCE(MAX(NULLIF(regexp_replace(award_no, '^AWD-\d+-', ''), '')::int), 0) AS maxseq
  FROM awards WHERE award_no IS NOT NULL GROUP BY tenant_id
), num AS (
  SELECT a.id,
         'AWD-' || COALESCE(b.be, EXTRACT(YEAR FROM now())::int + 543) || '-' ||
         lpad((COALESCE(b.maxseq, 0) + row_number() OVER (PARTITION BY a.tenant_id ORDER BY a.created_at))::text, 3, '0') AS new_no
  FROM awards a LEFT JOIN base b ON b.tenant_id = a.tenant_id
  WHERE a.award_no IS NULL
)
UPDATE awards a SET award_no = n.new_no FROM num n WHERE a.id = n.id;

-- 4) Trigger: generate award_no (and fill final_amount) on insert.
--    Runs after trg_set_award_tenant_id (name ordering: z > s) so tenant_id is set first.
CREATE OR REPLACE FUNCTION public.set_award_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _be int;
  _seq int;
BEGIN
  IF NEW.final_amount IS NULL THEN
    NEW.final_amount := NEW.amount;
  END IF;
  IF NEW.award_no IS NULL OR NEW.award_no = '' THEN
    _be := EXTRACT(YEAR FROM now())::int + 543;
    SELECT COUNT(*) + 1 INTO _seq FROM awards
    WHERE tenant_id = NEW.tenant_id AND award_no LIKE 'AWD-' || _be || '-%';
    NEW.award_no := 'AWD-' || _be || '-' || lpad(_seq::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_z_award_no ON public.awards;
CREATE TRIGGER trg_z_award_no
  BEFORE INSERT ON public.awards
  FOR EACH ROW EXECUTE FUNCTION public.set_award_no();

-- 5) One award per final quotation
CREATE UNIQUE INDEX IF NOT EXISTS uniq_awards_final_quotation
  ON public.awards (final_quotation_id)
  WHERE final_quotation_id IS NOT NULL;
