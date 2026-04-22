-- ============================================================
-- Assign roles & supplier record to test users
-- Run AFTER creating users via Supabase Dashboard → Authentication → Users
-- ============================================================

DO $$
DECLARE
  v_admin_id        UUID;
  v_procurement_id  UUID;
  v_approver_id     UUID;
  v_executive_id    UUID;
  v_supplier_id     UUID;
  v_supplier_rec_id UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
BEGIN
  -- Lookup user IDs by email
  SELECT id INTO v_admin_id        FROM auth.users WHERE email = 'admin@smartprocure.test';
  SELECT id INTO v_procurement_id  FROM auth.users WHERE email = 'procurement@smartprocure.test';
  SELECT id INTO v_approver_id     FROM auth.users WHERE email = 'approver@smartprocure.test';
  SELECT id INTO v_executive_id    FROM auth.users WHERE email = 'executive@smartprocure.test';
  SELECT id INTO v_supplier_id     FROM auth.users WHERE email = 'supplier@smartprocure.test';

  -- Validate all users exist
  IF v_admin_id IS NULL       THEN RAISE EXCEPTION 'admin user not found';       END IF;
  IF v_procurement_id IS NULL THEN RAISE EXCEPTION 'procurement user not found'; END IF;
  IF v_approver_id IS NULL    THEN RAISE EXCEPTION 'approver user not found';    END IF;
  IF v_executive_id IS NULL   THEN RAISE EXCEPTION 'executive user not found';   END IF;
  IF v_supplier_id IS NULL    THEN RAISE EXCEPTION 'supplier user not found';    END IF;

  -- Assign roles
  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_admin_id,       'admin'),
    (v_procurement_id, 'procurement_officer'),
    (v_approver_id,    'approver'),
    (v_executive_id,   'executive'),
    (v_supplier_id,    'supplier')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Update profiles (created automatically by trigger)
  UPDATE public.profiles SET full_name = 'Admin User',          updated_at = now() WHERE id = v_admin_id;
  UPDATE public.profiles SET full_name = 'Procurement Officer', updated_at = now() WHERE id = v_procurement_id;
  UPDATE public.profiles SET full_name = 'Approver User',       updated_at = now() WHERE id = v_approver_id;
  UPDATE public.profiles SET full_name = 'Executive User',      updated_at = now() WHERE id = v_executive_id;
  UPDATE public.profiles SET full_name = 'Test Supplier',       updated_at = now() WHERE id = v_supplier_id;

  -- Create approved supplier record
  INSERT INTO public.suppliers (
    id, company_name, email, phone, address,
    city, country, status, tier,
    is_preferred, is_blacklisted, created_by, created_at, updated_at
  ) VALUES (
    v_supplier_rec_id, 'Test Supplier Co., Ltd.', 'supplier@smartprocure.test',
    '02-000-0000', '123 Test Street', 'Bangkok', 'Thailand',
    'approved', 'non_critical_tier_1',
    false, false, v_supplier_id, now(), now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Link supplier profile → supplier record
  UPDATE public.profiles
  SET supplier_id = v_supplier_rec_id, updated_at = now()
  WHERE id = v_supplier_id;

  RAISE NOTICE 'Done. Roles assigned to all 5 users.';
END $$;

-- Verify
SELECT u.email, r.role, p.full_name, p.supplier_id IS NOT NULL AS has_supplier
FROM auth.users u
JOIN public.user_roles r ON r.user_id = u.id
JOIN public.profiles p   ON p.id = u.id
WHERE u.email LIKE '%@smartprocure.test'
ORDER BY r.role;
