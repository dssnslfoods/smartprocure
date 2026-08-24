-- A supplier can sell in more than one BRC category (e.g. sells packaging AND
-- provides logistics services), each with its own criteria and its own grade.
--
-- Until now suppliers.brc_supplier_type held a SINGLE value, so only one
-- category was ever active/graded. Evidence uploaded under any other category
-- stayed in the DB but was invisible and ungraded — e.g. "บริษัท เอ็ม เอ็ม พี
-- คอร์ปอเรชั่น จำกัด" has 3 evidence files under rm_primary_pk that nothing
-- displayed, because its current type is secondary_pk.
--
-- This migration is purely ADDITIVE:
--   * suppliers.brc_supplier_type is KEPT (now = the primary/default category)
--   * suppliers.brc_grade / brc_percent / brc_assessed_at are KEPT (summary of
--     the primary category, so the Suppliers list + Dashboard keep working)
--   * brc_manual_scores / brc_evidence are untouched — they were always keyed
--     by topic_id, which already belongs to exactly one category
-- Nothing the user has entered is modified or deleted.

CREATE TABLE IF NOT EXISTS public.supplier_brc_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_type text NOT NULL,
  -- Per-category assessment snapshot (mirrors suppliers.brc_* but per type).
  grade         text,
  percent       numeric,
  assessed_at   timestamptz,
  is_primary    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, supplier_type)
);

CREATE INDEX IF NOT EXISTS idx_supplier_brc_types_supplier ON public.supplier_brc_types (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_brc_types_type     ON public.supplier_brc_types (supplier_type);

ALTER TABLE public.supplier_brc_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_brc_types_read ON public.supplier_brc_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY supplier_brc_types_write ON public.supplier_brc_types
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin','procurement_officer','super_admin']::app_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin','procurement_officer','super_admin']::app_role[])
  ));

-- Backfill 1: the currently-selected category becomes the primary one, carrying
-- over the grade snapshot already stored on suppliers.
INSERT INTO public.supplier_brc_types (supplier_id, supplier_type, grade, percent, assessed_at, is_primary)
SELECT s.id, s.brc_supplier_type, s.brc_grade, s.brc_percent, s.brc_assessed_at, true
FROM public.suppliers s
WHERE s.brc_supplier_type IS NOT NULL AND s.brc_supplier_type <> ''
ON CONFLICT (supplier_id, supplier_type) DO NOTHING;

-- Backfill 2: RECOVER previously-hidden work — a second category the supplier
-- already has manual picks or uploaded evidence for becomes an assigned
-- category too. Grade is left NULL; it fills in when that category is opened.
--
-- Deliberately restricted to suppliers that ALREADY have brc_supplier_type set.
-- 57 suppliers with no category at all also have evidence sitting under
-- rm_primary_pk, but that is an artifact of the assessment screen defaulting
-- its dropdown to rm_primary_pk — not a real classification. Auto-assigning it
-- would newly subject them to that category's mandatory certificate gate and
-- could silently block them from RFQ invitations, so they stay unclassified
-- and procurement assigns their categories deliberately.
INSERT INTO public.supplier_brc_types (supplier_id, supplier_type, is_primary)
SELECT DISTINCT d.supplier_id, d.supplier_type, false
FROM (
  SELECT ms.supplier_id, t.supplier_type
    FROM public.brc_manual_scores ms JOIN public.brc_topics t ON t.id = ms.topic_id
  UNION
  SELECT e.supplier_id, t.supplier_type
    FROM public.brc_evidence e JOIN public.brc_topics t ON t.id = e.topic_id
) d
JOIN public.suppliers s ON s.id = d.supplier_id
WHERE d.supplier_type IS NOT NULL
  AND s.brc_supplier_type IS NOT NULL AND s.brc_supplier_type <> ''
ON CONFLICT (supplier_id, supplier_type) DO NOTHING;

-- Per-category equivalent of sync_supplier_brc_risk(). SECURITY DEFINER for the
-- same reason: the supplier portal must be able to record its own result.
CREATE OR REPLACE FUNCTION public.sync_supplier_brc_type_risk(
  p_supplier_id uuid, p_type text, p_grade text, p_percent numeric, p_level text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.supplier_brc_types (supplier_id, supplier_type, grade, percent, assessed_at)
  VALUES (p_supplier_id, p_type, p_grade, p_percent, now())
  ON CONFLICT (supplier_id, supplier_type) DO UPDATE
    SET grade = EXCLUDED.grade, percent = EXCLUDED.percent, assessed_at = EXCLUDED.assessed_at;

  -- Keep the supplier-level summary pointing at the WORST grade across all of
  -- its categories, so the Suppliers list / Dashboard / RFQ risk badges show
  -- the most conservative risk rather than whichever tab was opened last.
  UPDATE public.suppliers s
  SET risk_level = COALESCE((
        SELECT CASE max(CASE t.grade WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 WHEN 'D' THEN 4 END)
                 WHEN 1 THEN 'low' WHEN 2 THEN 'medium' WHEN 3 THEN 'high' WHEN 4 THEN 'critical' END
        FROM public.supplier_brc_types t
        WHERE t.supplier_id = p_supplier_id AND t.grade IS NOT NULL
      ), p_level)::public.risk_level_enum,
      brc_grade = COALESCE((
        SELECT t.grade FROM public.supplier_brc_types t
        WHERE t.supplier_id = p_supplier_id AND t.grade IS NOT NULL
        ORDER BY CASE t.grade WHEN 'D' THEN 1 WHEN 'C' THEN 2 WHEN 'B' THEN 3 WHEN 'A' THEN 4 END
        LIMIT 1
      ), p_grade),
      brc_percent = COALESCE((
        SELECT min(t.percent) FROM public.supplier_brc_types t
        WHERE t.supplier_id = p_supplier_id AND t.percent IS NOT NULL
      ), p_percent),
      brc_assessed_at = now()
  WHERE s.id = p_supplier_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_supplier_brc_type_risk(uuid, text, text, numeric, text) TO authenticated;

COMMENT ON TABLE public.supplier_brc_types IS
  'Categories a supplier is assessed under (many per supplier), each with its own BRCGS grade. suppliers.brc_supplier_type remains the primary/default category.';
