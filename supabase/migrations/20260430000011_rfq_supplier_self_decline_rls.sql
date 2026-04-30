-- Allow a supplier to update their own rfq_suppliers row to record a decline.
-- The existing "Manage RFQ suppliers" policy is admin/procurement only;
-- this adds a narrowly-scoped UPDATE policy for the supplier themselves.

DROP POLICY IF EXISTS "Supplier decline own invite" ON public.rfq_suppliers;
CREATE POLICY "Supplier decline own invite" ON public.rfq_suppliers
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'supplier')
    AND supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'supplier')
    AND supplier_id = (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
  );
