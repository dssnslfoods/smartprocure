-- ============================================================
-- Migration 005: Supplier Certificates table
-- Supports multiple certificates per supplier with expiry tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.supplier_certificates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id      UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  certificate_type TEXT NOT NULL,
  certificate_no   TEXT,
  issued_by        TEXT,
  issued_date      DATE,
  expiry_date      DATE,
  file_url         TEXT,
  file_name        TEXT,
  file_size        BIGINT,
  is_primary       BOOLEAN NOT NULL DEFAULT false,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.supplier_certificates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS sc_supplier_idx  ON public.supplier_certificates (supplier_id);
CREATE INDEX IF NOT EXISTS sc_expiry_idx    ON public.supplier_certificates (expiry_date);
CREATE INDEX IF NOT EXISTS sc_type_idx      ON public.supplier_certificates (certificate_type);

DO $$ BEGIN
  CREATE POLICY "Authenticated users can manage supplier certificates"
    ON public.supplier_certificates FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed: migrate existing single-cert data from suppliers table into new table
INSERT INTO public.supplier_certificates
  (supplier_id, certificate_type, expiry_date, is_primary, created_at, updated_at)
SELECT
  id,
  certificate_type,
  certificate_expiry_date,
  true,
  now(),
  now()
FROM public.suppliers
WHERE certificate_type IS NOT NULL
  AND certificate_type != ''
ON CONFLICT DO NOTHING;
