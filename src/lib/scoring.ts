import type { ScoringWeights, RiskLevel } from '@/types/procurement';
import { riskLevelToScore } from '@/lib/eligibility';

export interface QuotationInput {
  id: string;
  supplier_id: string;
  price: number | null;
  total_amount: number | null;
  discount: number;
  lead_time_days: number | null;
  payment_term: string | null;
  payment_terms: string | null;
  spec_compliance_score: number | null;
}

export interface SupplierInput {
  id: string;
  risk_level: RiskLevel | null;
}

export interface ScoredQuotation {
  quotation_id: string;
  supplier_id: string;
  effective_price: number;
  price_score: number;
  lead_time_score: number;
  payment_term_score: number;
  commercial_score: number;
  technical_score: number;
  risk_score: number;
  final_score: number;
  rank: number;
  is_recommended_winner: boolean;
  warnings: string[];
}

const DEFAULT_WEIGHTS: ScoringWeights = { commercial: 60, technical: 25, risk: 15 };

function effectivePrice(q: QuotationInput): number {
  const base = q.price ?? q.total_amount ?? 0;
  return Math.max(0, base - (q.discount ?? 0));
}

function paymentTermDays(term: string | null | undefined): number {
  if (!term) return 30;
  const match = term.match(/\d+/);
  return match ? parseInt(match[0], 10) : 30;
}

function paymentTermScore(term: string | null | undefined): number {
  const days = paymentTermDays(term);
  if (days <= 0)   return 100;
  if (days <= 15)  return 90;
  if (days <= 30)  return 80;
  if (days <= 45)  return 70;
  if (days <= 60)  return 60;
  if (days <= 90)  return 45;
  if (days <= 120) return 30;
  return 15;
}

export function scoreQuotations(
  quotations: QuotationInput[],
  supplierMap: Record<string, SupplierInput>,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ScoredQuotation[] {
  if (quotations.length === 0) return [];

  const prices = quotations.map(effectivePrice).filter(p => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 1;

  const leadTimes = quotations.map(q => q.lead_time_days ?? 0).filter(d => d > 0);
  const minLead = leadTimes.length > 0 ? Math.min(...leadTimes) : 1;

  const scored = quotations.map(q => {
    const ep = effectivePrice(q);
    const priceScore = ep > 0 ? Math.min(100, Math.round((minPrice / ep) * 100)) : 0;

    const ltd = q.lead_time_days ?? 0;
    const leadScore = ltd > 0 ? Math.min(100, Math.round((minLead / ltd) * 100)) : 0;

    const ptScore = paymentTermScore(q.payment_term ?? q.payment_terms);

    const commercialScore = Math.round(
      priceScore * 0.60 + leadScore * 0.30 + ptScore * 0.10
    );

    const specScore = q.spec_compliance_score ?? 0;
    const technicalScore = Math.round(specScore);

    const supplier = supplierMap[q.supplier_id];
    const riskScore = riskLevelToScore(supplier?.risk_level ?? 'low');

    const finalScore = Math.round(
      (commercialScore * weights.commercial +
       technicalScore  * weights.technical  +
       riskScore       * weights.risk) / 100
    );

    return {
      quotation_id: q.id,
      supplier_id: q.supplier_id,
      effective_price: ep,
      price_score: priceScore,
      lead_time_score: leadScore,
      payment_term_score: ptScore,
      commercial_score: commercialScore,
      technical_score: technicalScore,
      risk_score: riskScore,
      final_score: finalScore,
      rank: 0,
      is_recommended_winner: false,
      warnings: [] as string[],
    };
  });

  scored.sort((a, b) => b.final_score - a.final_score);
  scored.forEach((s, i) => { s.rank = i + 1; });
  if (scored.length > 0) scored[0].is_recommended_winner = true;

  const lowestPriceId = quotations.reduce((best, q) => {
    const ep = effectivePrice(q);
    return ep > 0 && ep < effectivePrice(best) ? q : best;
  }, quotations[0]);

  scored.forEach(s => {
    const supplier = supplierMap[s.supplier_id];
    const rl = supplier?.risk_level ?? 'low';

    if (s.quotation_id === lowestPriceId?.id && (rl === 'high' || rl === 'critical')) {
      s.warnings.push('Lowest price supplier is not recommended due to supplier risk.');
    }
    if (rl === 'critical') {
      s.warnings.push('Critical risk supplier cannot be awarded.');
    }
    if (rl === 'high') {
      s.warnings.push('High risk supplier requires QA approval before award.');
    }
  });

  return scored;
}
