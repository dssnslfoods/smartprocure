-- Tighten Manage policies on price_lists / price_list_items so suppliers
-- don't get blanket SELECT via FOR ALL. Manage is admin/proc only.

DROP POLICY IF EXISTS "Manage price lists" ON public.price_lists;
CREATE POLICY "Manage price lists" ON public.price_lists
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));

DROP POLICY IF EXISTS "Manage price list items" ON public.price_list_items;
CREATE POLICY "Manage price list items" ON public.price_list_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));
