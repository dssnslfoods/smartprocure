-- Auto-set tenant_id on suppliers and supplier_documents from the inserting user's profile.
-- Falls back to the value passed by the client if already set.

CREATE OR REPLACE FUNCTION public.set_supplier_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := get_user_tenant_id(auth.uid());
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required — user has no tenant assigned';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_supplier_tenant_id ON public.suppliers;
CREATE TRIGGER trg_set_supplier_tenant_id
  BEFORE INSERT ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_supplier_tenant_id();

DROP TRIGGER IF EXISTS trg_set_supplier_doc_tenant_id ON public.supplier_documents;
CREATE TRIGGER trg_set_supplier_doc_tenant_id
  BEFORE INSERT ON public.supplier_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_supplier_tenant_id();

DROP TRIGGER IF EXISTS trg_set_supplier_cert_tenant_id ON public.supplier_certificates;
CREATE TRIGGER trg_set_supplier_cert_tenant_id
  BEFORE INSERT ON public.supplier_certificates
  FOR EACH ROW EXECUTE FUNCTION public.set_supplier_tenant_id();
