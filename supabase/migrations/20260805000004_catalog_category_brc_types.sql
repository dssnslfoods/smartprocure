-- Catalog category now mirrors the BRC supplier_type list (7 values) so a
-- catalog's category directly identifies which BRCGS criteria apply to
-- suppliers quoting on it. The old 4-value set (raw_material/packaging/
-- service/other) stays valid — existing catalogs keep their current value
-- and are re-tagged manually via the edit dialog; not auto-migrated because
-- there's no reliable 1:1 mapping (e.g. 'packaging' must split into
-- rm_primary_pk vs secondary_pk depending on content).
ALTER TYPE public.price_list_category_enum ADD VALUE IF NOT EXISTS 'rm_primary_pk';
ALTER TYPE public.price_list_category_enum ADD VALUE IF NOT EXISTS 'secondary_pk';
ALTER TYPE public.price_list_category_enum ADD VALUE IF NOT EXISTS 'chemical_food';
ALTER TYPE public.price_list_category_enum ADD VALUE IF NOT EXISTS 'chemical_nonfood';
ALTER TYPE public.price_list_category_enum ADD VALUE IF NOT EXISTS 'equipment_food';
ALTER TYPE public.price_list_category_enum ADD VALUE IF NOT EXISTS 'equipment_nonfood';
