// Per-RFQ technical checklist scoring.
//
// Each criterion carries a weight. A quotation's technical score is the weighted
// percentage of criteria the supplier marked as met — stored in
// quotations.spec_compliance_score so the existing bid-comparison Technical pillar
// reflects it without further changes.

export interface TechCriterion {
  id: string;
  rfq_id: string;
  label: string;
  description: string | null;
  weight: number;
  sort_order: number;
}

export interface TechResponse {
  criterion_id: string;
  value: string | null;
  is_met: boolean;
}

/** Weighted % (0..100) of met criteria, or null when there are no criteria. */
export function computeTechnicalScore(
  criteria: Pick<TechCriterion, 'id' | 'weight'>[],
  met: Record<string, boolean>,
): number | null {
  if (!criteria.length) return null;
  const total = criteria.reduce((a, c) => a + (c.weight || 0), 0);
  if (total <= 0) return null;
  const metWeight = criteria.reduce((a, c) => a + (met[c.id] ? (c.weight || 0) : 0), 0);
  return Math.round((metWeight / total) * 100);
}
