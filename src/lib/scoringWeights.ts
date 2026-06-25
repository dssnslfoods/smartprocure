// Admin-configurable bid scoring weights (Commercial / Technical / Risk).
// Stored as a single jsonb row in system_settings under key 'scoring_weights'.
import { supabase } from '@/integrations/supabase/client';
import type { ScoringWeights } from '@/types/procurement';

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = { commercial: 60, technical: 25, risk: 15 };
export const SCORING_WEIGHTS_KEY = 'scoring_weights';

/** Load the configured weights, falling back to the defaults. */
export async function loadScoringWeights(): Promise<ScoringWeights> {
  const { data } = await supabase
    .from('system_settings').select('value').eq('key', SCORING_WEIGHTS_KEY).maybeSingle();
  const v = (data?.value as Partial<ScoringWeights>) || null;
  if (!v) return { ...DEFAULT_SCORING_WEIGHTS };
  return {
    commercial: Number(v.commercial ?? DEFAULT_SCORING_WEIGHTS.commercial),
    technical:  Number(v.technical  ?? DEFAULT_SCORING_WEIGHTS.technical),
    risk:       Number(v.risk       ?? DEFAULT_SCORING_WEIGHTS.risk),
  };
}
