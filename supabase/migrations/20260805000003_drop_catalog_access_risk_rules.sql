-- The per-catalog "access risk" gate (price_lists.access_risk_rules, set via the
-- now-removed CatalogAccessDialog) hid catalogs from suppliers based on a separate
-- legacy dimension-scoring table (risk_criteria) with no admin UI to manage it.
-- Zero catalogs had ever configured it. Superseded by the BRCGS mandatory
-- certificate gate, which is enforced (blocks RFQ participation, not just visibility)
-- and has a proper admin UI (เกณฑ์ความเสี่ยง).
ALTER TABLE public.price_lists DROP COLUMN IF EXISTS access_risk_rules;
