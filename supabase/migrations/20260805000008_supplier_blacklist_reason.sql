-- suppliers.is_blacklisted already existed and already blocks award/invite in
-- checkSupplierEligibility(), but had no reason, no timestamp, and no history —
-- and RFQInviteSuppliers.tsx still showed blacklisted suppliers (disabled, not
-- hidden). This adds the reason/audit trail and a dedicated report source.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS blacklist_reason text,
  ADD COLUMN IF NOT EXISTS blacklisted_at timestamptz,
  ADD COLUMN IF NOT EXISTS blacklisted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS blacklisted_by_email text;

CREATE TABLE IF NOT EXISTS public.supplier_blacklist_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id      uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  action           text NOT NULL CHECK (action IN ('blacklisted', 'unblacklisted')),
  reason           text,
  changed_by       uuid REFERENCES auth.users(id),
  changed_by_email text,
  changed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_blacklist_history_supplier ON public.supplier_blacklist_history (supplier_id, changed_at DESC);

ALTER TABLE public.supplier_blacklist_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_blacklist_history_read ON public.supplier_blacklist_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin','procurement_officer','super_admin']::app_role[])
  ));

CREATE POLICY supplier_blacklist_history_write ON public.supplier_blacklist_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin','procurement_officer','super_admin']::app_role[])
  ));

COMMENT ON COLUMN public.suppliers.blacklist_reason IS
  'Why this supplier was blacklisted. Required by the UI when is_blacklisted is set true.';
