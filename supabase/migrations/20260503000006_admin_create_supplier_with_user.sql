-- admin_create_supplier_with_user
-- Atomic RPC: dedupe-check email across suppliers + auth.users, then create
-- auth user + identity + profile + role + supplier in one transaction.

CREATE OR REPLACE FUNCTION public.admin_create_supplier_with_user(
  p_company_name TEXT,
  p_email        TEXT,
  p_tax_id       TEXT DEFAULT NULL,
  p_phone        TEXT DEFAULT NULL,
  p_address      TEXT DEFAULT NULL,
  p_city         TEXT DEFAULT NULL,
  p_country      TEXT DEFAULT NULL,
  p_website      TEXT DEFAULT NULL,
  p_tier         TEXT DEFAULT NULL,
  p_notes        TEXT DEFAULT NULL,
  p_password     TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing_supplier UUID;
  v_existing_user     UUID;
  v_user_id           UUID := gen_random_uuid();
  v_supplier_id       UUID;
  v_password          TEXT;
  v_norm_email        TEXT;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer')) THEN
    RAISE EXCEPTION 'Only admin/procurement can create suppliers';
  END IF;
  IF p_company_name IS NULL OR length(trim(p_company_name)) = 0 THEN
    RAISE EXCEPTION 'company_name required';
  END IF;

  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    INSERT INTO public.suppliers (company_name, tax_id, address, city, country, phone, website, tier, notes, status, created_by)
    VALUES (p_company_name, p_tax_id, p_address, p_city, p_country, p_phone, p_website, p_tier, p_notes, 'draft', auth.uid())
    RETURNING id INTO v_supplier_id;
    RETURN jsonb_build_object('success', true, 'supplier_id', v_supplier_id, 'login_created', false,
                              'message', 'Supplier created without login (no email provided)');
  END IF;

  v_norm_email := lower(trim(p_email));

  SELECT id INTO v_existing_supplier FROM public.suppliers WHERE lower(email) = v_norm_email LIMIT 1;
  IF v_existing_supplier IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'duplicate', true, 'duplicate_kind', 'supplier_email',
                              'existing_supplier_id', v_existing_supplier,
                              'message', 'อีเมลนี้ถูกใช้กับ supplier รายอื่นในระบบแล้ว');
  END IF;

  SELECT id INTO v_existing_user FROM auth.users WHERE lower(email) = v_norm_email LIMIT 1;
  IF v_existing_user IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'duplicate', true, 'duplicate_kind', 'auth_user',
                              'existing_user_id', v_existing_user,
                              'message', 'อีเมลนี้ถูกใช้สำหรับบัญชีผู้ใช้ในระบบแล้ว');
  END IF;

  v_password := COALESCE(p_password, 'Sup' || substr(md5(random()::TEXT || clock_timestamp()::TEXT), 1, 9) || '!');

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', v_norm_email,
          extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('full_name', p_company_name),
          now(), now(), '', '', '', '');

  INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id, 'email', v_user_id::text,
          jsonb_build_object('sub', v_user_id::text, 'email', v_norm_email, 'email_verified', true),
          NULL, now(), now());

  INSERT INTO public.suppliers (company_name, tax_id, email, phone, address, city, country, website, tier, notes, status, created_by)
  VALUES (p_company_name, p_tax_id, v_norm_email, p_phone, p_address, p_city, p_country, p_website, p_tier, p_notes, 'draft', v_user_id)
  RETURNING id INTO v_supplier_id;

  INSERT INTO public.profiles (id, email, full_name, supplier_id)
  VALUES (v_user_id, v_norm_email, p_company_name, v_supplier_id)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        supplier_id = EXCLUDED.supplier_id;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'supplier') ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'supplier_id', v_supplier_id, 'user_id', v_user_id,
                            'email', v_norm_email, 'login_created', true,
                            'generated_password', CASE WHEN p_password IS NULL THEN v_password ELSE NULL END,
                            'message', 'สร้าง supplier และบัญชี login เรียบร้อย');
END $$;

GRANT EXECUTE ON FUNCTION public.admin_create_supplier_with_user(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
