-- Supplier rejection + resubmit workflow
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resubmitted_at   TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.supplier_resubmit_registration()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_sid     UUID;
  v_company TEXT;
  v_status  TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(v_uid, 'supplier') THEN
    RAISE EXCEPTION 'Only suppliers can resubmit';
  END IF;

  SELECT supplier_id INTO v_sid FROM public.profiles WHERE id = v_uid;
  IF v_sid IS NULL THEN RAISE EXCEPTION 'No supplier linked'; END IF;

  SELECT status, company_name INTO v_status, v_company FROM public.suppliers WHERE id = v_sid;
  IF v_status IS DISTINCT FROM 'rejected' THEN
    RAISE EXCEPTION 'Only rejected suppliers can resubmit (current: %)', v_status;
  END IF;

  UPDATE public.suppliers
     SET status='submitted', resubmitted_at=now(), updated_at=now()
   WHERE id = v_sid;

  INSERT INTO public.notifications (user_id, title, message, type, link)
  SELECT ur.user_id,
         'Supplier ส่งข้อมูลใหม่อีกครั้ง',
         v_company || ' ได้แก้ไขและส่งข้อมูลใหม่ — กรุณาตรวจสอบ',
         'supplier_resubmit',
         '/admin/supplier-approvals'
    FROM public.user_roles ur WHERE ur.role = 'admin';

  INSERT INTO public.approval_logs (entity_type, entity_id, action, status, comment, approved_by)
  VALUES ('supplier_registration', v_sid, 'resubmitted', 'submitted',
          'Supplier resubmitted after rejection', v_uid);

  RETURN jsonb_build_object('success', true, 'supplier_id', v_sid, 'status', 'submitted');
END $$;

GRANT EXECUTE ON FUNCTION public.supplier_resubmit_registration() TO authenticated;
