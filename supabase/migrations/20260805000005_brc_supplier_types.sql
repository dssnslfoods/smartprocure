-- Admin-manageable BRC supplier types — previously a hardcoded 7-value list
-- in src/lib/brcScoring.ts (SUPPLIER_TYPE_LABEL). brc_topics.supplier_type,
-- brc_grade_bands.supplier_type, and suppliers.brc_supplier_type were always
-- plain text (no enum/FK), so this table is purely a managed lookup list —
-- no schema change needed on those tables.
CREATE TABLE IF NOT EXISTS public.brc_supplier_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL UNIQUE,
  label_th   text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brc_supplier_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY brc_supplier_types_read ON public.brc_supplier_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY brc_supplier_types_write ON public.brc_supplier_types
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

INSERT INTO public.brc_supplier_types (key, label_th, sort_order) VALUES
  ('rm_primary_pk',     'วัตถุดิบ / บรรจุภัณฑ์หลัก (RM / Primary PK)', 10),
  ('secondary_pk',      'บรรจุภัณฑ์รอง (Secondary / Tertiary PK)',      20),
  ('service',           'บริการ (Service)',                             30),
  ('chemical_food',     'เคมี Food grade',                              40),
  ('chemical_nonfood',  'เคมี Non-food grade',                          50),
  ('equipment_food',    'อุปกรณ์สัมผัสอาหาร (Equipment food contact)', 60),
  ('equipment_nonfood', 'อุปกรณ์ทั่วไป (Equipment non-food contact)',   70)
ON CONFLICT (key) DO NOTHING;

-- Lets the app add a brand-new supplier type key to the Catalog category
-- enum too (price_lists.category), without granting ALTER TYPE broadly.
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction as a use
-- of that value, but this function only adds it — safe as its own call.
CREATE OR REPLACE FUNCTION public.add_catalog_category_value(p_value text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin','procurement_officer','super_admin']::app_role[])
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_value !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'invalid category key: %', p_value;
  END IF;
  EXECUTE format('ALTER TYPE public.price_list_category_enum ADD VALUE IF NOT EXISTS %L', p_value);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_catalog_category_value(text) TO authenticated;
