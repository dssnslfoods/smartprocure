-- The BRCGS supplier assessment (src/lib/brcScoring.ts) computes grade/percent/
-- risk level entirely client-side and never persisted it, so suppliers.risk_level
-- stayed at its 'low' default and every consumer that reads it — the Suppliers
-- list ("ยังไม่ประเมิน" gate), Dashboard high/critical-risk counts, RFQ invite
-- risk badges — stayed disconnected from real BRCGS results.
--
-- sync_supplier_brc_risk lets the assessment page persist a snapshot after each
-- recompute. SECURITY DEFINER because suppliers.UPDATE is staff-only, but the
-- supplier portal (self-service BRCGS uploads) must also be able to trigger this.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS brc_grade text,
  ADD COLUMN IF NOT EXISTS brc_percent numeric,
  ADD COLUMN IF NOT EXISTS brc_assessed_at timestamptz;

CREATE OR REPLACE FUNCTION public.sync_supplier_brc_risk(
  p_supplier_id uuid, p_grade text, p_percent numeric, p_level text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.suppliers
  SET risk_level = p_level::public.risk_level_enum,
      brc_grade = p_grade,
      brc_percent = p_percent,
      brc_assessed_at = now()
  WHERE id = p_supplier_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_supplier_brc_risk(uuid, text, numeric, text) TO authenticated;
