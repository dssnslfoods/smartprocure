// Mandatory certificate requirements attached to a catalog (price_list) or a
// specific catalog item. When an RFQ contains items from such catalogs, only
// suppliers holding the required certificates (matched + not expired) may bid.
//
// This layers on top of the BRCGS supplier-category gate (see brcScoring.ts).
import { supabase } from '@/integrations/supabase/client';
import { loadSupplierEvidence } from '@/lib/brcScoring';

export interface CatalogCertRequirement {
  id: string;
  price_list_id: string | null;
  price_list_item_id: string | null;
  label: string;
  match_keywords: string[];
}

/** A distinct certificate in the shared BRCGS list, for the requirement picker. */
export interface CertOption { label: string; keywords: string[]; }

/** Load the distinct certificate options used across BRCGS criteria (dedup by keyword set). */
export async function loadBrcCertOptions(): Promise<CertOption[]> {
  const { data } = await supabase.from('brc_options' as any)
    .select('label, match_keywords, match_type')
    .eq('match_type', 'certificate');
  const seen = new Set<string>();
  const out: CertOption[] = [];
  ((data as any[]) || []).forEach(o => {
    const kws: string[] = o.match_keywords || [];
    const key = kws.slice().sort().join('|');
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ label: o.label, keywords: kws });
  });
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase();
function isExpired(expiry: string | null): boolean {
  if (!expiry) return false;
  const d = new Date(expiry); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d < today;
}

/** Load requirements for a catalog + optionally its items. */
export async function loadCatalogRequirements(priceListId: string): Promise<{
  catalog: CatalogCertRequirement[];
  byItem: Record<string, CatalogCertRequirement[]>;
}> {
  const [catRes, itemsRes] = await Promise.all([
    supabase.from('catalog_cert_requirements' as any).select('*').eq('price_list_id', priceListId),
    supabase.from('price_list_items').select('id').eq('price_list_id', priceListId),
  ]);
  const itemIds = ((itemsRes.data as any[]) || []).map(i => i.id);
  let itemReqs: CatalogCertRequirement[] = [];
  if (itemIds.length) {
    const { data } = await supabase.from('catalog_cert_requirements' as any)
      .select('*').in('price_list_item_id', itemIds);
    itemReqs = (data as unknown as CatalogCertRequirement[]) || [];
  }
  const byItem: Record<string, CatalogCertRequirement[]> = {};
  itemReqs.forEach(r => (byItem[r.price_list_item_id!] ??= []).push(r));
  return { catalog: (catRes.data as unknown as CatalogCertRequirement[]) || [], byItem };
}

/**
 * Resolve the required certificates for a set of catalog items (as used in an RFQ).
 * Item-level requirements override the catalog-level requirements for that item.
 * Returns a deduped list of { label, keywords }.
 */
export async function requiredCertsForCatalogItems(
  priceListItemIds: string[],
): Promise<CertOption[]> {
  const ids = Array.from(new Set(priceListItemIds)).filter(Boolean);
  if (ids.length === 0) return [];

  // Map each item → its catalog (price_list_id).
  const { data: itemRows } = await supabase.from('price_list_items')
    .select('id, price_list_id').in('id', ids);
  const catalogOf: Record<string, string> = {};
  ((itemRows as any[]) || []).forEach(r => { catalogOf[r.id] = r.price_list_id; });
  const catalogIds = Array.from(new Set(Object.values(catalogOf)));

  // Load catalog-level and item-level requirements.
  const [catReqRes, itemReqRes] = await Promise.all([
    catalogIds.length
      ? supabase.from('catalog_cert_requirements' as any).select('*').in('price_list_id', catalogIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('catalog_cert_requirements' as any).select('*').in('price_list_item_id', ids),
  ]);
  const catByList: Record<string, CatalogCertRequirement[]> = {};
  ((catReqRes.data as any[]) || []).forEach(r => (catByList[r.price_list_id] ??= []).push(r));
  const itemByItem: Record<string, CatalogCertRequirement[]> = {};
  ((itemReqRes.data as any[]) || []).forEach(r => (itemByItem[r.price_list_item_id] ??= []).push(r));

  // For each item: item override if present, else its catalog requirements.
  const picked: CertOption[] = [];
  for (const id of ids) {
    const reqs = itemByItem[id]?.length
      ? itemByItem[id]
      : (catByList[catalogOf[id]] || []);
    reqs.forEach(r => picked.push({ label: r.label, keywords: r.match_keywords }));
  }
  // Dedup by keyword set.
  const seen = new Set<string>();
  return picked.filter(c => {
    const key = c.keywords.slice().sort().join('|');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface CatalogEligibility {
  passed: boolean;
  missing: string[];   // labels of required certs the supplier lacks
}

/** Check each supplier against a required-cert set (matched cert/evidence, not expired). */
export async function checkCatalogEligibility(
  supplierIds: string[],
  required: CertOption[],
): Promise<Record<string, CatalogEligibility>> {
  const ids = Array.from(new Set(supplierIds)).filter(Boolean);
  const out: Record<string, CatalogEligibility> = {};
  if (ids.length === 0) return out;
  if (required.length === 0) {
    ids.forEach(sid => { out[sid] = { passed: true, missing: [] }; });
    return out;
  }
  const ev = await loadSupplierEvidence(ids);
  for (const sid of ids) {
    const certs = ev.certsBy[sid] || [];
    const evidence = ev.evidenceBy[sid] || [];
    const missing: string[] = [];
    for (const req of required) {
      const kws = req.keywords.map(norm).filter(Boolean);
      const hasCert = certs.some(c => !isExpired(c.expiry_date) && kws.some(kw => norm(c.certificate_type).includes(kw)));
      const hasEvidence = evidence.some(e => !isExpired(e.expiry_date) && kws.some(kw => norm(e.file_name).includes(kw)));
      if (!hasCert && !hasEvidence) missing.push(req.label);
    }
    out[sid] = { passed: missing.length === 0, missing };
  }
  return out;
}
