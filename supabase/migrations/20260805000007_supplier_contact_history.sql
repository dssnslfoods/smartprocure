-- Admin edits to a supplier's registration info were previously unrestricted
-- (company name, tax ID, address, etc. could all be changed) with no record of
-- what the value used to be. Per the user's directive, only contact-type
-- fields (ผู้ติดต่อ/เบอร์โทร/อีเมล) may be edited from the approval screen now,
-- and every change must keep the prior value as history.
CREATE TABLE IF NOT EXISTS public.supplier_contact_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  field           text NOT NULL,
  old_value       text,
  new_value       text,
  changed_by      uuid REFERENCES auth.users(id),
  changed_by_email text,
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_contact_history_supplier ON public.supplier_contact_history (supplier_id, changed_at DESC);

ALTER TABLE public.supplier_contact_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_contact_history_read ON public.supplier_contact_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin','procurement_officer','super_admin']::app_role[])
  ));

CREATE POLICY supplier_contact_history_write ON public.supplier_contact_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin','procurement_officer','super_admin']::app_role[])
  ));
