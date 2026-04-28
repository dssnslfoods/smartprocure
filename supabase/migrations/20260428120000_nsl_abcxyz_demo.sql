-- ============================================================
-- NSL Foods demo migration: ABC-XYZ classification + wipe transactions
-- Run this in Supabase SQL Editor (or via supabase db push) BEFORE
-- running scripts/seed-nsl-demo.mjs.
-- ============================================================

-- ---------- 1. Schema additions for ABC-XYZ classification ----------

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS abc_class           INTEGER,
  ADD COLUMN IF NOT EXISTS xyz_class           INTEGER,
  ADD COLUMN IF NOT EXISTS seasonality_score   INTEGER,
  ADD COLUMN IF NOT EXISTS priority_score      INTEGER,
  ADD COLUMN IF NOT EXISTS risk_label          TEXT,
  ADD COLUMN IF NOT EXISTS total_spend         NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS num_items           INTEGER;

ALTER TABLE public.price_list_items
  ADD COLUMN IF NOT EXISTS item_code          TEXT,
  ADD COLUMN IF NOT EXISTS group_name         TEXT,
  ADD COLUMN IF NOT EXISTS abc_class          INTEGER,
  ADD COLUMN IF NOT EXISTS xyz_class          INTEGER,
  ADD COLUMN IF NOT EXISTS seasonality_score  INTEGER,
  ADD COLUMN IF NOT EXISTS priority_score     INTEGER,
  ADD COLUMN IF NOT EXISTS risk_label         TEXT,
  ADD COLUMN IF NOT EXISTS total_quantity     NUMERIC(18,3),
  ADD COLUMN IF NOT EXISTS total_trans_value  NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS avg_quantity       NUMERIC(18,3),
  ADD COLUMN IF NOT EXISTS avg_trans_value    NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS num_suppliers      INTEGER;

CREATE INDEX IF NOT EXISTS idx_suppliers_priority    ON public.suppliers(priority_score);
CREATE INDEX IF NOT EXISTS idx_suppliers_risk_label  ON public.suppliers(risk_label);
CREATE INDEX IF NOT EXISTS idx_pli_item_code         ON public.price_list_items(item_code);
CREATE INDEX IF NOT EXISTS idx_pli_priority          ON public.price_list_items(priority_score);
CREATE INDEX IF NOT EXISTS idx_pli_group_name        ON public.price_list_items(group_name);

-- ---------- 2. Wipe all transaction data (keep auth/profiles/user_roles) ----------

TRUNCATE TABLE
  public.awards,
  public.final_quotations,
  public.bid_entries,
  public.bidding_events,
  public.quotation_items,
  public.quotations,
  public.rfq_suppliers,
  public.rfq_items,
  public.rfqs,
  public.price_list_items,
  public.price_lists,
  public.supplier_evaluation_scores,
  public.supplier_evaluations,
  public.supplier_score_summary,
  public.supplier_esg_profiles,
  public.supplier_documents,
  public.supplier_contacts,
  public.suppliers,
  public.supplier_tiers,
  public.approval_logs,
  public.audit_logs,
  public.notifications
RESTART IDENTITY CASCADE;

-- ---------- 3. Seed ABC-XYZ tier matrix (configuration table) ----------

INSERT INTO public.supplier_tiers (tier_name, description) VALUES
  ('AX', 'High value (>5MB) + single source — Strategic / Critical risk'),
  ('AY', 'High value (>5MB) + 2-4 sources — Strategic'),
  ('AZ', 'High value (>5MB) + multi-source (>4) — Leverage'),
  ('BX', 'Medium value (1-5MB) + single source — Bottleneck'),
  ('BY', 'Medium value (1-5MB) + 2-4 sources — Important'),
  ('BZ', 'Medium value (1-5MB) + multi-source (>4) — Routine+'),
  ('CX', 'Low value (<1MB) + single source — Bottleneck'),
  ('CY', 'Low value (<1MB) + 2-4 sources — Routine'),
  ('CZ', 'Low value (<1MB) + multi-source (>4) — Routine')
ON CONFLICT (tier_name) DO UPDATE SET description = EXCLUDED.description;
