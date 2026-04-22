-- ============================================================
-- Smart Procurement — Test Users Seed Script
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Creates one test account per role:
--
--  Role                 | Email                           | Password
--  ---------------------|---------------------------------|---------------
--  admin                | admin@smartprocure.test         | Admin@1234
--  procurement_officer  | procurement@smartprocure.test   | Procure@1234
--  approver             | approver@smartprocure.test      | Approve@1234
--  executive            | executive@smartprocure.test     | Exec@1234
--  supplier             | supplier@smartprocure.test      | Supplier@1234
-- ============================================================

DO $$
DECLARE
  v_admin_id        UUID := '00000001-0000-0000-0000-000000000001';
  v_procurement_id  UUID := '00000002-0000-0000-0000-000000000002';
  v_approver_id     UUID := '00000003-0000-0000-0000-000000000003';
  v_executive_id    UUID := '00000004-0000-0000-0000-000000000004';
  v_supplier_id     UUID := '00000005-0000-0000-0000-000000000005';
  v_supplier_rec_id UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_instance_id     UUID := '00000000-0000-0000-0000-000000000000';
BEGIN

  -- ──────────────────────────────────────────────────────────
  -- 0. Cleanup existing test records (idempotent re-run)
  -- ──────────────────────────────────────────────────────────
  DELETE FROM public.user_roles  WHERE user_id IN (v_admin_id, v_procurement_id, v_approver_id, v_executive_id, v_supplier_id);
  DELETE FROM public.profiles    WHERE id      IN (v_admin_id, v_procurement_id, v_approver_id, v_executive_id, v_supplier_id);
  DELETE FROM public.suppliers   WHERE id = v_supplier_rec_id;
  DELETE FROM auth.identities    WHERE user_id IN (v_admin_id, v_procurement_id, v_approver_id, v_executive_id, v_supplier_id);
  DELETE FROM auth.users         WHERE id      IN (v_admin_id, v_procurement_id, v_approver_id, v_executive_id, v_supplier_id);

  -- ──────────────────────────────────────────────────────────
  -- 1. auth.users  (instance_id is required by Supabase auth)
  -- ──────────────────────────────────────────────────────────
  INSERT INTO auth.users (
    instance_id,
    id, aud, role, email,
    encrypted_password,
    email_confirmed_at,
    is_super_admin,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at, updated_at
  ) VALUES
    (v_instance_id, v_admin_id,       'authenticated', 'authenticated', 'admin@smartprocure.test',
     crypt('Admin@1234',    gen_salt('bf', 10)), now(), false,
     '{"provider":"email","providers":["email"]}', '{"full_name":"Admin User"}',          now(), now()),

    (v_instance_id, v_procurement_id, 'authenticated', 'authenticated', 'procurement@smartprocure.test',
     crypt('Procure@1234',  gen_salt('bf', 10)), now(), false,
     '{"provider":"email","providers":["email"]}', '{"full_name":"Procurement Officer"}', now(), now()),

    (v_instance_id, v_approver_id,    'authenticated', 'authenticated', 'approver@smartprocure.test',
     crypt('Approve@1234',  gen_salt('bf', 10)), now(), false,
     '{"provider":"email","providers":["email"]}', '{"full_name":"Approver User"}',       now(), now()),

    (v_instance_id, v_executive_id,   'authenticated', 'authenticated', 'executive@smartprocure.test',
     crypt('Exec@1234',     gen_salt('bf', 10)), now(), false,
     '{"provider":"email","providers":["email"]}', '{"full_name":"Executive User"}',      now(), now()),

    (v_instance_id, v_supplier_id,    'authenticated', 'authenticated', 'supplier@smartprocure.test',
     crypt('Supplier@1234', gen_salt('bf', 10)), now(), false,
     '{"provider":"email","providers":["email"]}', '{"full_name":"Test Supplier"}',       now(), now());

  -- ──────────────────────────────────────────────────────────
  -- 2. auth.identities  (required for email/password sign-in)
  --    id must be a fresh UUID — NOT reuse user_id
  -- ──────────────────────────────────────────────────────────
  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES
    (gen_random_uuid(), v_admin_id,       'admin@smartprocure.test',
     jsonb_build_object('sub', v_admin_id::text,       'email', 'admin@smartprocure.test'),       'email', now(), now(), now()),

    (gen_random_uuid(), v_procurement_id, 'procurement@smartprocure.test',
     jsonb_build_object('sub', v_procurement_id::text, 'email', 'procurement@smartprocure.test'), 'email', now(), now(), now()),

    (gen_random_uuid(), v_approver_id,    'approver@smartprocure.test',
     jsonb_build_object('sub', v_approver_id::text,    'email', 'approver@smartprocure.test'),    'email', now(), now(), now()),

    (gen_random_uuid(), v_executive_id,   'executive@smartprocure.test',
     jsonb_build_object('sub', v_executive_id::text,   'email', 'executive@smartprocure.test'),   'email', now(), now(), now()),

    (gen_random_uuid(), v_supplier_id,    'supplier@smartprocure.test',
     jsonb_build_object('sub', v_supplier_id::text,    'email', 'supplier@smartprocure.test'),    'email', now(), now(), now());

  -- ──────────────────────────────────────────────────────────
  -- 3. public.profiles
  -- ──────────────────────────────────────────────────────────
  INSERT INTO public.profiles (id, email, full_name, is_active, created_at, updated_at)
  VALUES
    (v_admin_id,       'admin@smartprocure.test',        'Admin User',          true, now(), now()),
    (v_procurement_id, 'procurement@smartprocure.test',  'Procurement Officer', true, now(), now()),
    (v_approver_id,    'approver@smartprocure.test',     'Approver User',       true, now(), now()),
    (v_executive_id,   'executive@smartprocure.test',    'Executive User',      true, now(), now()),
    (v_supplier_id,    'supplier@smartprocure.test',     'Test Supplier',       true, now(), now())
  ON CONFLICT (id) DO UPDATE
    SET email      = EXCLUDED.email,
        full_name  = EXCLUDED.full_name,
        is_active  = EXCLUDED.is_active,
        updated_at = now();

  -- ──────────────────────────────────────────────────────────
  -- 4. public.user_roles
  -- ──────────────────────────────────────────────────────────
  INSERT INTO public.user_roles (user_id, role)
  VALUES
    (v_admin_id,       'admin'),
    (v_procurement_id, 'procurement_officer'),
    (v_approver_id,    'approver'),
    (v_executive_id,   'executive'),
    (v_supplier_id,    'supplier');

  -- ──────────────────────────────────────────────────────────
  -- 5. public.suppliers  (approved — supplier can login immediately)
  -- ──────────────────────────────────────────────────────────
  INSERT INTO public.suppliers (
    id, company_name, email, phone, address,
    city, country, status, tier,
    is_preferred, is_blacklisted, created_by, created_at, updated_at
  ) VALUES (
    v_supplier_rec_id, 'Test Supplier Co., Ltd.', 'supplier@smartprocure.test',
    '02-000-0000', '123 Test Street', 'Bangkok', 'Thailand',
    'approved', 'non_critical_tier_1',
    false, false, v_supplier_id, now(), now()
  );

  -- Link supplier profile → supplier record
  UPDATE public.profiles
  SET supplier_id = v_supplier_rec_id, updated_at = now()
  WHERE id = v_supplier_id;

END $$;

-- ──────────────────────────────────────────────────────────
-- Verify
-- ──────────────────────────────────────────────────────────
SELECT
  u.email,
  r.role,
  p.full_name,
  p.supplier_id IS NOT NULL AS has_supplier_record,
  u.email_confirmed_at IS NOT NULL AS email_confirmed
FROM auth.users u
JOIN public.user_roles r ON r.user_id = u.id
JOIN public.profiles p   ON p.id = u.id
WHERE u.email LIKE '%@smartprocure.test'
ORDER BY r.role;
