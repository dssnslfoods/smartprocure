-- Fix RLS policies on suppliers and supplier_documents to include super_admin.
-- Previously super_admin was blocked from INSERT/UPDATE because the policies
-- only checked has_role(admin/procurement_officer/supplier).

-- suppliers: SELECT
DROP POLICY IF EXISTS "Internal users read suppliers" ON public.suppliers;
CREATE POLICY "Internal users read suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'approver') OR
    public.has_role(auth.uid(), 'executive') OR
    (public.has_role(auth.uid(), 'supplier') AND created_by = auth.uid())
  );

-- suppliers: INSERT
DROP POLICY IF EXISTS "Admin/proc create suppliers" ON public.suppliers;
CREATE POLICY "Admin/proc create suppliers" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'supplier')
  );

-- suppliers: UPDATE
DROP POLICY IF EXISTS "Admin/proc update suppliers" ON public.suppliers;
CREATE POLICY "Admin/proc update suppliers" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer')
  );

-- supplier_documents: INSERT
DROP POLICY IF EXISTS "Suppliers insert own docs" ON public.supplier_documents;
CREATE POLICY "Suppliers insert own docs" ON public.supplier_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'procurement_officer') OR
    public.has_role(auth.uid(), 'supplier')
  );

-- supplier_documents: ALL
DROP POLICY IF EXISTS "Manage supplier docs" ON public.supplier_documents;
CREATE POLICY "Manage supplier docs" ON public.supplier_documents
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
