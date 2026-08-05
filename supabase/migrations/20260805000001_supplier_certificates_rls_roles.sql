-- supplier_certificates was created with an "any authenticated user" ALL policy.
-- Now that suppliers manage their own certificates from the portal, tighten it
-- to the same role-gated pattern already used by supplier_documents.
DROP POLICY IF EXISTS "Authenticated users can manage supplier certificates" ON public.supplier_certificates;

CREATE POLICY "Read supplier certificates" ON public.supplier_certificates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Manage supplier certificates" ON public.supplier_certificates
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'supplier')
  )
  WITH CHECK (
    public.is_super_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'supplier')
  );
