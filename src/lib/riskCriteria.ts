// BRC-style risk criteria + per-dimension risk computation.
//
// A criterion is "met" when the supplier holds a matching, non-expired certificate
// or a matching document. Per dimension:
//   risk = round((1 - metWeight / totalWeight) * 10)   // 0..10, higher = worse
//   - any mandatory criterion unmet  => 10 (highest risk)
//   - no active criteria             => null (not assessed; never gates a catalog)
import { RISK_FACTORS } from '@/types/procurement';
import { isExpired } from '@/lib/dateUtils';

export type RiskDimension = typeof RISK_FACTORS[number]['key'];
export type CatalogCategory = 'raw_material' | 'packaging' | 'service' | 'other';

export interface RiskCriterion {
  id: string;
  category: CatalogCategory | null;
  dimension: RiskDimension;
  code: string | null;
  name_th: string;
  description: string | null;
  weight: number;
  match_type: 'certificate' | 'document';
  match_keywords: string[];
  is_mandatory: boolean;
  sort_order: number;
  active: boolean;
}

export interface SupplierCert { certificate_type: string | null; expiry_date: string | null; }
export interface SupplierDoc  { document_type: string | null; document_name: string | null; }

export interface CriterionResult extends RiskCriterion { met: boolean; }

export interface DimensionResult {
  dimension: RiskDimension;
  score: number | null;        // computed risk 0..10, or null when no criteria apply
  metWeight: number;
  totalWeight: number;
  mandatoryUnmet: boolean;
  criteria: CriterionResult[];
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase();

/** True when the supplier satisfies a single criterion. */
export function isCriterionMet(c: RiskCriterion, certs: SupplierCert[], docs: SupplierDoc[]): boolean {
  const kws = c.match_keywords.map(norm).filter(Boolean);
  if (kws.length === 0) return false;
  if (c.match_type === 'certificate') {
    return certs.some(cert => {
      if (isExpired(cert.expiry_date)) return false;
      const hay = norm(cert.certificate_type);
      return kws.some(kw => hay.includes(kw));
    });
  }
  return docs.some(doc => {
    const hay = `${norm(doc.document_type)} ${norm(doc.document_name)}`;
    return kws.some(kw => hay.includes(kw));
  });
}

/**
 * Compute per-dimension risk for the criteria relevant to `category`
 * (criteria whose category equals the catalog category OR is null/global).
 * Returns a map keyed by dimension; dimensions with no applicable criteria are omitted.
 */
export function computeDimensionRisks(
  allCriteria: RiskCriterion[],
  certs: SupplierCert[],
  docs: SupplierDoc[],
  category: CatalogCategory | 'all',
): Record<string, DimensionResult> {
  const relevant = allCriteria.filter(c =>
    c.active && (category === 'all' || c.category === null || c.category === category),
  );

  const byDim = new Map<string, RiskCriterion[]>();
  for (const c of relevant) {
    if (!byDim.has(c.dimension)) byDim.set(c.dimension, []);
    byDim.get(c.dimension)!.push(c);
  }

  const out: Record<string, DimensionResult> = {};
  for (const [dimension, list] of byDim.entries()) {
    let totalWeight = 0, metWeight = 0, mandatoryUnmet = false;
    const criteria: CriterionResult[] = list
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(c => {
        const met = isCriterionMet(c, certs, docs);
        totalWeight += c.weight;
        if (met) metWeight += c.weight;
        if (c.is_mandatory && !met) mandatoryUnmet = true;
        return { ...c, met };
      });

    // With no weight there is nothing to measure — report "not assessed" (null)
    // rather than a perfect 0, which would read as zero risk. An unmet mandatory
    // criterion still forces the maximum risk regardless of weight.
    const score = mandatoryUnmet
      ? 10
      : totalWeight > 0
        ? Math.round((1 - metWeight / totalWeight) * 10)
        : null;
    out[dimension] = { dimension: dimension as RiskDimension, score, metWeight, totalWeight, mandatoryUnmet, criteria };
  }
  return out;
}

/**
 * A catalog's access rule is { dimension: maxAllowedRisk }. The supplier passes when
 * every listed dimension's effective score is <= its threshold. Dimensions that are
 * not assessed (null) are treated as passing (no evidence to block on).
 */
export function passesCatalogGate(
  rules: Record<string, number> | null | undefined,
  effectiveScores: Record<string, number | null>,
): { passes: boolean; failed: { dimension: string; score: number; max: number }[] } {
  const failed: { dimension: string; score: number; max: number }[] = [];
  for (const [dim, max] of Object.entries(rules || {})) {
    const score = effectiveScores[dim];
    if (score == null) continue;
    if (score > max) failed.push({ dimension: dim, score, max });
  }
  return { passes: failed.length === 0, failed };
}

export const DIMENSION_LABEL: Record<string, string> = Object.fromEntries(
  RISK_FACTORS.map(f => [f.key, f.label]),
);

export const CATEGORY_OPTIONS: { value: CatalogCategory; label: string }[] = [
  { value: 'raw_material', label: 'วัตถุดิบ (Raw Material)' },
  { value: 'packaging',    label: 'บรรจุภัณฑ์ (Packaging)' },
  { value: 'service',      label: 'บริการ (Service)' },
  { value: 'other',        label: 'อื่นๆ (Other)' },
];
