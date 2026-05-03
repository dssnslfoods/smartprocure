-- Allow supplier role to read AND update THEIR OWN supplier row via the
-- profiles.supplier_id link (not just created_by = auth.uid()), and provide a
-- SECURITY DEFINER helper that auto-links profile→supplier on first portal load.

-- ── Read policy: supplier can read own row via created_by OR profile link ────
DROP POLICY IF EXISTS "Internal users read suppliers" ON public.suppliers;
CREATE POLICY "Internal users read suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'executive') OR
    (
      public.has_role(auth.uid(), 'supplier') AND (
        created_by = auth.uid()
        OR id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
      )
    )
  );

-- ── Update policy: supplier can update their own row ────────────────────────
DROP POLICY IF EXISTS "Supplier update own row" ON public.suppliers;
CREATE POLICY "Supplier update own row" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'supplier') AND (
      created_by = auth.uid()
      OR id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'supplier') AND (
      created_by = auth.uid()
      OR id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ── supplier_contacts: read / write own ──────────────────────────────────────
DROP POLICY IF EXISTS "Supplier manage own contacts" ON public.supplier_contacts;
CREATE POLICY "Supplier manage own contacts" ON public.supplier_contacts
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    (
      public.has_role(auth.uid(), 'supplier')
      AND supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    (
      public.has_role(auth.uid(), 'supplier')
      AND supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ── supplier_documents: read / write own ────────────────────────────────────
DROP POLICY IF EXISTS "Supplier manage own documents" ON public.supplier_documents;
CREATE POLICY "Supplier manage own documents" ON public.supplier_documents
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    (
      public.has_role(auth.uid(), 'supplier')
      AND supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    (
      public.has_role(auth.uid(), 'supplier')
      AND supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ── Auto-link profile→supplier helper (SECURITY DEFINER bypasses RLS) ───────
-- Resolves the supplier row for the calling user and patches profiles.supplier_id.
-- Lookup order:
--   1. existing profiles.supplier_id (no-op)
--   2. suppliers.created_by = auth.uid()
--   3. suppliers.email = profiles.email of the caller
-- Returns the linked supplier id, or NULL if none could be matched.
CREATE OR REPLACE FUNCTION public.link_my_supplier_account()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_email     TEXT;
  v_sid       UUID;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT supplier_id, email INTO v_sid, v_email FROM public.profiles WHERE id = v_uid;
  IF v_sid IS NOT NULL THEN RETURN v_sid; END IF;

  -- Try by created_by
  SELECT id INTO v_sid FROM public.suppliers WHERE created_by = v_uid LIMIT 1;

  -- Try by email match
  IF v_sid IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_sid FROM public.suppliers WHERE LOWER(email) = LOWER(v_email) LIMIT 1;
  END IF;

  -- Try by auth email if profile email empty
  IF v_sid IS NULL THEN
    SELECT id INTO v_sid FROM public.suppliers s
      WHERE LOWER(s.email) = (SELECT LOWER(email) FROM auth.users WHERE id = v_uid)
      LIMIT 1;
  END IF;

  IF v_sid IS NOT NULL THEN
    UPDATE public.profiles SET supplier_id = v_sid WHERE id = v_uid;
  END IF;

  RETURN v_sid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_my_supplier_account() TO authenticated;

COMMENT ON FUNCTION public.link_my_supplier_account() IS
  'Auto-links the authenticated supplier account to its suppliers row by created_by or email match. Persists profiles.supplier_id and returns the resolved id (or NULL).';
