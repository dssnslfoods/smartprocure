// Admin-configurable list of company documents requested from suppliers
// (company registration cert, ภพ.20, book bank, etc.). Each type is an upload
// slot on the supplier's "เอกสารบริษัท" tab, mirroring the BRCGS evidence flow.
import { supabase } from '@/integrations/supabase/client';

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

/** Storage object keys must be ASCII-safe (no Thai / spaces). */
export function safeStorageName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'file';
  const ext = dot > 0 ? name.slice(dot).replace(/[^A-Za-z0-9.]+/g, '') : '';
  return `${base}${ext}`;
}

export type DocExpiry = 'valid' | 'expiring' | 'expired' | 'none';
export function docExpiryStatus(expiry: string | null): DocExpiry {
  if (!expiry) return 'none';
  const d = new Date(expiry); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d < today) return 'expired';
  const soon = new Date(today); soon.setDate(soon.getDate() + 30);
  if (d <= soon) return 'expiring';
  return 'valid';
}
