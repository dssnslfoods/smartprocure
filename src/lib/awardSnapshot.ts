// Award-time snapshot of the winner and the selection criteria.
//
// Master data (risk criteria, scoring weights, technical checklist) changes over time,
// so at the moment an award is finalized we freeze a self-contained record of WHO won and
// WHY — stored in awards.selection_snapshot for later lookup/audit.
import { supabase } from '@/integrations/supabase/client';
import { loadScoringWeights } from '@/lib/scoringWeights';
import { computeRfqBidRisk } from '@/lib/bidRisk';
import { scoreQuotations } from '@/lib/scoring';
import { DIMENSION_LABEL } from '@/lib/riskCriteria';
import type { ScoringWeights } from '@/types/procurement';

export interface AwardSnapshot {
  awarded_at: string;
  rfq: { number: string; title: string };
  weights: ScoringWeights;
  winner: {
    supplier_id: string;
    company_name: string;
    net_price: number;
    scores: { commercial: number; technical: number; risk: number; final: number };
    rank: number;
  };
  ranking: { company_name: string; final: number; rank: number; net_price: number; is_winner: boolean }[];
  risk: {
    has_criteria: boolean;
    categories: string[];
    score10: number | null;
    level: string | null;
    dimensions: {
      label: string;
      score: number | null;
      mandatory_unmet: boolean;
      criteria: { name: string; met: boolean; mandatory: boolean; weight: number }[];
    }[];
  };
  technical: {
    has_checklist: boolean;
    total_score: number | null;
    items: { label: string; weight: number; met: boolean; value: string | null }[];
  };
}

/** Re-derive and freeze the full selection record for an award. */
export async function buildAwardSnapshot(
  rfqId: string,
  winnerSupplierId: string,
  winnerQuotationId?: string,
): Promise<AwardSnapshot> {
  const [rfqRes, qRes, weights] = await Promise.all([
    supabase.from('rfqs').select('rfq_number, title').eq('id', rfqId).single(),
    supabase.from('quotations').select('*, suppliers(id, company_name, risk_level)').eq('rfq_id', rfqId),
    loadScoringWeights(),
  ]);
  const quotations = qRes.data || [];
  const supMap: Record<string, any> = {};
  quotations.forEach((q: any) => { if (q.suppliers) supMap[q.supplier_id] = q.suppliers; });

  const risk = await computeRfqBidRisk(rfqId, quotations.map((q: any) => q.supplier_id));
  const override = risk.hasCriteria
    ? Object.fromEntries(Object.entries(risk.bySupplier).map(([sid, r]) => [sid, r.riskScore]))
    : undefined;
  const scored = scoreQuotations(quotations, supMap, weights, override);

  const winnerQ = winnerQuotationId
    ? quotations.find((q: any) => q.id === winnerQuotationId)
    : quotations.find((q: any) => q.supplier_id === winnerSupplierId);
  const winnerScore = scored.find(s =>
    winnerQ ? s.quotation_id === winnerQ.id : s.supplier_id === winnerSupplierId);

  const netPrice = (q: any) => (q.price ?? q.total_amount ?? 0) - (q.discount ?? 0);

  const ranking = scored
    .map(s => {
      const q = quotations.find((x: any) => x.id === s.quotation_id);
      return {
        company_name: supMap[s.supplier_id]?.company_name || '—',
        final: s.final_score,
        rank: s.rank,
        net_price: q ? netPrice(q) : 0,
        is_winner: s.supplier_id === winnerSupplierId,
      };
    })
    .sort((a, b) => a.rank - b.rank);

  // Risk dimensions for the winner (frozen labels + per-criterion met state).
  const winnerRisk = risk.bySupplier[winnerSupplierId];
  const dimensions = winnerRisk
    ? Object.values(winnerRisk.dims).map(d => ({
        label: DIMENSION_LABEL[d.dimension] || d.dimension,
        score: d.score,
        mandatory_unmet: d.mandatoryUnmet,
        criteria: d.criteria.map(c => ({
          name: c.name_th, met: c.met, mandatory: c.is_mandatory, weight: c.weight,
        })),
      }))
    : [];

  // Technical checklist + winner responses.
  const [critRes, respRes] = await Promise.all([
    supabase.from('rfq_technical_criteria').select('*').eq('rfq_id', rfqId).order('sort_order'),
    winnerQ
      ? supabase.from('quotation_technical_responses').select('*').eq('quotation_id', winnerQ.id)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const respByCrit: Record<string, any> = {};
  (respRes.data || []).forEach((r: any) => { respByCrit[r.criterion_id] = r; });
  const techItems = (critRes.data || []).map((c: any) => ({
    label: c.label,
    weight: c.weight,
    met: !!respByCrit[c.id]?.is_met,
    value: respByCrit[c.id]?.value ?? null,
  }));

  return {
    awarded_at: new Date().toISOString(),
    rfq: { number: rfqRes.data?.rfq_number || '', title: rfqRes.data?.title || '' },
    weights,
    winner: {
      supplier_id: winnerSupplierId,
      company_name: supMap[winnerSupplierId]?.company_name || '—',
      net_price: winnerQ ? netPrice(winnerQ) : 0,
      scores: {
        commercial: winnerScore?.commercial_score ?? 0,
        technical: winnerScore?.technical_score ?? 0,
        risk: winnerScore?.risk_score ?? 0,
        final: winnerScore?.final_score ?? 0,
      },
      rank: winnerScore?.rank ?? 1,
    },
    ranking,
    risk: {
      has_criteria: risk.hasCriteria,
      categories: risk.categories,
      score10: winnerRisk?.assessed ? winnerRisk.risk10 : null,
      level: winnerRisk?.assessed ? winnerRisk.level : null,
      dimensions,
    },
    technical: {
      has_checklist: techItems.length > 0,
      total_score: winnerScore?.technical_score ?? null,
      items: techItems,
    },
  };
}
