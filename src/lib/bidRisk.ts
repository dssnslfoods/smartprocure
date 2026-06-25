// Procurement-stage risk scoring.
//
// Turns the admin-configured BRC risk criteria (เกณฑ์ความเสี่ยง) into a per-supplier
// risk score for RFQ bid comparison and e-Bidding. The criteria applied are those for
// the catalog category(ies) the RFQ's line items were pulled from, plus global criteria.
import { supabase } from '@/integrations/supabase/client';
import {
  computeDimensionRisks,
  type RiskCriterion, type CatalogCategory, type DimensionResult,
} from '@/lib/riskCriteria';
import type { RiskLevel } from '@/types/procurement';

const VALID_CATS: CatalogCategory[] = ['raw_material', 'packaging', 'service', 'other'];

export interface SupplierRisk {
  riskScore: number;                       // 0..100, higher = safer (feeds the scoring pillar)
  risk10: number;                          // 0..10, higher = worse
  level: RiskLevel;
  dims: Record<string, DimensionResult>;   // per-dimension breakdown
  assessed: boolean;                       // false when no criteria applied
}

export interface BidRiskResult {
  hasCriteria: boolean;
  categories: CatalogCategory[];
  bySupplier: Record<string, SupplierRisk>;
}

/** Map a 0..10 risk (higher = worse) to a RiskLevel band. */
export function risk10ToLevel(r: number): RiskLevel {
  if (r <= 2.5) return 'low';
  if (r <= 5)   return 'medium';
  if (r <= 7.5) return 'high';
  return 'critical';
}

/** Distinct catalog categories the RFQ's items were pulled from. */
export async function getRfqCategories(rfqId: string): Promise<CatalogCategory[]> {
  const { data: items } = await supabase
    .from('rfq_items').select('source_price_list_item_id').eq('rfq_id', rfqId);
  const srcIds = (items || []).map((i: any) => i.source_price_list_item_id).filter(Boolean);
  if (srcIds.length === 0) return [];
  const { data: plis } = await supabase
    .from('price_list_items').select('price_lists(category)').in('id', srcIds);
  const cats = new Set<CatalogCategory>();
  (plis || []).forEach((r: any) => {
    const c = r.price_lists?.category;
    if (c && (VALID_CATS as string[]).includes(c)) cats.add(c);
  });
  return Array.from(cats);
}

/** Aggregate per-dimension risks into one supplier-level risk. */
function aggregate(dims: Record<string, DimensionResult>): SupplierRisk {
  const list = Object.values(dims).filter(d => d.score != null);
  if (list.length === 0) {
    return { riskScore: 100, risk10: 0, level: 'low', dims, assessed: false };
  }
  const wSum = list.reduce((a, d) => a + d.totalWeight, 0);
  const risk10 = wSum > 0
    ? list.reduce((a, d) => a + (d.score as number) * d.totalWeight, 0) / wSum
    : list.reduce((a, d) => a + (d.score as number), 0) / list.length;
  const riskScore = Math.round((1 - risk10 / 10) * 100);
  return { riskScore, risk10, level: risk10ToLevel(risk10), dims, assessed: true };
}

/**
 * Compute BRC risk for every supplier in `supplierIds`, scoped to the RFQ's catalog
 * categories. When no relevant criteria exist, hasCriteria=false and callers should
 * fall back to the supplier's stored risk_level.
 */
export async function computeRfqBidRisk(rfqId: string, supplierIds: string[]): Promise<BidRiskResult> {
  const ids = Array.from(new Set(supplierIds)).filter(Boolean);
  const [categories, critRes, certRes, docRes] = await Promise.all([
    getRfqCategories(rfqId),
    supabase.from('risk_criteria').select('*').eq('active', true),
    ids.length
      ? supabase.from('supplier_certificates').select('supplier_id, certificate_type, expiry_date').in('supplier_id', ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? supabase.from('supplier_documents').select('supplier_id, document_type, document_name').in('supplier_id', ids)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const allCriteria = (critRes.data as RiskCriterion[]) || [];
  // Relevant = global (null) + any of the RFQ's categories.
  const relevant = allCriteria.filter(
    c => c.category === null || categories.includes(c.category as CatalogCategory),
  );
  const hasCriteria = relevant.length > 0;

  const certsBy: Record<string, any[]> = {};
  (certRes.data || []).forEach((c: any) => (certsBy[c.supplier_id] ??= []).push(c));
  const docsBy: Record<string, any[]> = {};
  (docRes.data || []).forEach((d: any) => (docsBy[d.supplier_id] ??= []).push(d));

  const bySupplier: Record<string, SupplierRisk> = {};
  for (const sid of ids) {
    if (!hasCriteria) {
      bySupplier[sid] = { riskScore: 100, risk10: 0, level: 'low', dims: {}, assessed: false };
      continue;
    }
    const dims = computeDimensionRisks(relevant, certsBy[sid] || [], docsBy[sid] || [], 'all');
    bySupplier[sid] = aggregate(dims);
  }

  return { hasCriteria, categories, bySupplier };
}
