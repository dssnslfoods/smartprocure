-- Admin Supplier Management RPCs
-- All SECURITY DEFINER, admin-only, with explicit role checks.

CREATE OR REPLACE FUNCTION public.admin_reset_supplier_password(
  p_user_id      UUID,
  p_new_password TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can reset supplier passwords';
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at         = now()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_reset_supplier_password(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_suspend_supplier(
  p_supplier_id UUID, p_reason TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can suspend suppliers';
  END IF;
  UPDATE public.suppliers
     SET status='suspended',
         notes=COALESCE(notes || E'\n','') || '[Suspended on ' || now()::TEXT ||
               CASE WHEN p_reason IS NOT NULL THEN '] ' || p_reason ELSE ']' END,
         updated_at=now()
   WHERE id = p_supplier_id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_suspend_supplier(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reactivate_supplier(p_supplier_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can reactivate suppliers';
  END IF;
  UPDATE public.suppliers
     SET status='approved',
         notes=COALESCE(notes || E'\n','') || '[Reactivated on ' || now()::TEXT || ']',
         updated_at=now()
   WHERE id = p_supplier_id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_supplier(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_supplier(p_supplier_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can delete suppliers';
  END IF;
  DELETE FROM public.suppliers WHERE id = p_supplier_id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_delete_supplier(UUID) TO authenticated;
