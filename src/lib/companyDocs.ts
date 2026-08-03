// Admin-configurable list of company documents requested from suppliers
// (company registration cert, ภพ.20, book bank, etc.). Each type is an upload
// slot on the supplier's "เอกสารบริษัท" tab, mirroring the BRCGS evidence flow.
import { supabase } from '@/integrations/supabase/client';
import { expiryStatus, type ExpiryStatus } from '@/lib/dateUtils';

export interface CompanyDocType {
  id: string;
  name_th: string;
  description: string | null;
  is_required: boolean;
  has_expiry: boolean;
  sort_order: number;
  active: boolean;
}

export interface SupplierDoc {
  id: string;
  supplier_id: string;
  document_type_id: string | null;
  document_type: string | null;
  document_name: string;
  file_url: string | null;
  file_size: number | null;
  expiry_date: string | null;
  created_at: string;
}

export async function loadCompanyDocTypes(includeInactive = false): Promise<CompanyDocType[]> {
  let q = supabase.from('company_document_types' as any).select('*').order('sort_order');
  if (!includeInactive) q = q.eq('active', true);
  const { data } = await q;
  return (data as unknown as CompanyDocType[]) || [];
}

export { safeStorageName } from '@/lib/storage';

/** 'invalid' = an expiry date we cannot read; it must never read as healthy. */
export type DocExpiry = ExpiryStatus;
export const docExpiryStatus = (expiry: string | null): DocExpiry => expiryStatus(expiry, 30);
