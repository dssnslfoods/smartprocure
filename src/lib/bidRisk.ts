// Procurement-stage risk scoring — BRCGS supplier assessment standard.
//
// Redesigned to follow the NSL "Smart procurement" BRCGS standard: each supplier is
// assessed against its supplier-type criteria. Evidence topics (certificates /
// documents) and manual evaluations are supplier-level; competition topics
// (pricing / delivery / credit term) are derived automatically from the supplier's
// quotation in this RFQ. The result is a total score → grade (A/B/C/D) → risk level.
import { supabase } from '@/integrations/supabase/client';
import {
  evaluateBrc, loadBrcStandard, loadSupplierEvidence, parsePaymentTermDays,
  type BrcAssessment, type BrcSupplierType, type QuotationContext,
} from '@/lib/brcScoring';
import type { RiskLevel } from '@/types/procurement';

// Legacy-compatible per-dimension shape (topic-level breakdown).
export interface DimensionResult {
  dimension: string;                 // "<section> · <topic>"
  score: number | null;              // 0..10 risk (higher = worse), null = pending
  metWeight: number;
  totalWeight: number;
  mandatoryUnmet: boolean;
  criteria: { name_th: string; met: boolean; is_mandatory: boolean; weight: number }[];
}

export interface SupplierRisk {
  riskScore: number;                       // 0..100, higher = safer (feeds scoring pillar)
  risk10: number;                          // 0..10, higher = worse
  level: RiskLevel;
  dims: Record<string, DimensionResult>;   // per-topic breakdown (legacy shape)
  assessed: boolean;
  brc?: BrcAssessment;                     // full BRCGS assessment
}

export interface BidRiskResult {
  hasCriteria: boolean;
  categories: string[];                    // kept for API compat (unused by BRC)
  bySupplier: Record<string, SupplierRisk>;
}

/** Map a 0..10 risk (higher = worse) to a RiskLevel band. */
export function risk10ToLevel(r: number): RiskLevel {
  if (r <= 2.5) return 'low';
  if (r <= 5)   return 'medium';
  if (r <= 7.5) return 'high';
  return 'critical';
}

/** Convert a BRC assessment to the legacy dims shape used across RFQ pages. */
function toDims(brc: BrcAssessment): Record<string, DimensionResult> {
  const out: Record<string, DimensionResult> = {};
  for (const t of brc.topics) {
    const key = `${t.topic.section} · ${t.topic.topic}`;
    const matchedIds = new Set(t.matchedOptions.map(m => m.option.id));
    const criteria = t.options
      // show matched options + better unmatched ones (what's missing to score higher)
      .filter(o => matchedIds.has(o.id) || o.score > t.score)
      .map(o => ({
        name_th: o.label,
        met: matchedIds.has(o.id),
        is_mandatory: false,
        weight: o.score,
      }));
    out[key] = {
      dimension: key,
      score: t.pending ? null : Math.round((1 - (t.maxScore > 0 ? t.score / t.maxScore : 1)) * 10),
      metWeight: t.score,
      totalWeight: t.maxScore,
      mandatoryUnmet: false,
      criteria,
    };
  }
  return out;
}

/**
 * Compute BRCGS risk for every supplier in `supplierIds`. Competition topics are
 * auto-scored from each supplier's quotation in this RFQ (lowest price, lead time,
 * credit term); evidence topics from certificates/documents; the rest from stored
 * manual evaluations.
 */
export async function computeRfqBidRisk(rfqId: string, supplierIds: string[]): Promise<BidRiskResult> {
  const ids = Array.from(new Set(supplierIds)).filter(Boolean);
  const [{ topics, optionsByTopic, bands }, evidence, qRes] = await Promise.all([
    loadBrcStandard(),
    loadSupplierEvidence(ids),
    supabase.from('quotations')
      .select('supplier_id, price, total_amount, discount, lead_time_days, payment_term, payment_terms')
      .eq('rfq_id', rfqId),
  ]);

  const hasCriteria = topics.length > 0;

  // Build quotation context per supplier (latest quote wins; net price basis).
  const quotes = (qRes.data || []) as any[];
  const netOf = (q: any) => Math.max(0, (q.price ?? q.total_amount ?? 0) - (q.discount ?? 0));
  const bySupplierQuote: Record<string, any> = {};
  quotes.forEach(q => { bySupplierQuote[q.supplier_id] = q; });
  const prices = Object.values(bySupplierQuote).map(netOf).filter(p => p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const leads = Object.values(bySupplierQuote).map((q: any) => q.lead_time_days).filter((d: any) => d > 0);
  const minLead = leads.length ? Math.min(...leads) : null;

  const bySupplier: Record<string, SupplierRisk> = {};
  for (const sid of ids) {
    if (!hasCriteria) {
      bySupplier[sid] = { riskScore: 100, risk10: 0, level: 'low', dims: {}, assessed: false };
      continue;
    }
    const q = bySupplierQuote[sid];
    const ctx: QuotationContext | undefined = q ? {
      effectivePrice: netOf(q),
      minPrice: minPrice || netOf(q),
      leadTimeDays: q.lead_time_days ?? null,
      minLeadTimeDays: minLead,
      paymentTermDays: parsePaymentTermDays(q.payment_term ?? q.payment_terms),
    } : undefined;

    const supplierType = (evidence.typesBy[sid] as BrcSupplierType) || 'rm_primary_pk';
    const brc = evaluateBrc(
      supplierType, topics, optionsByTopic,
      evidence.certsBy[sid] || [], evidence.docsBy[sid] || [],
      evidence.manualBy[sid] || {}, bands, ctx,
    );

    bySupplier[sid] = {
      riskScore: brc.percent,
      risk10: Math.round((1 - brc.percent / 100) * 100) / 10,
      level: brc.level,
      dims: toDims(brc),
      assessed: brc.assessedMax > 0,
      brc,
    };
  }

  return { hasCriteria, categories: [], bySupplier };
}
