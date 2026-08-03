// Pure scoring maths behind the criteria-admin screen: what a topic can actually
// score once some options become mandatory gates, how to re-tier the remaining
// options, and how to rescale the grade bands onto a new total.

export type ScoringMode = 'best_match' | 'additive';

export interface ScoreOption {
  id: string;
  label: string;
  score: number;
  is_mandatory: boolean;
}

export interface ScaleRow {
  id: string;
  label: string;
  from: number;
  to: number;
  changed: boolean;
}

/**
 * Highest score a supplier can actually reach on a topic. Mandatory options are a
 * pass/fail gate and score nothing, so they are excluded.
 */
export function achievableMax(mode: ScoringMode, options: ScoreOption[]): number {
  const scoring = options.filter(o => !o.is_mandatory);
  return mode === 'best_match'
    ? scoring.reduce((m, o) => Math.max(m, o.score), 0)
    : scoring.reduce((a, o) => a + o.score, 0);
}

/** True when the topic can no longer reach (or would overshoot) its full marks. */
export function needsRebalance(mode: ScoringMode, target: number, rawMax: number): boolean {
  if (rawMax <= 0) return false;
  return mode === 'best_match' ? rawMax !== target : rawMax < target;
}

/**
 * Propose new option scores so the topic's full marks become reachable again.
 *
 * Mapping is per DISTINCT score tier rather than per option, which gives two
 * guarantees the naive `round(score * factor)` did not:
 *   - options that already shared a score keep sharing one
 *   - two tiers that differed can never be rounded onto the same value
 * Nothing exceeds the topic's marks, and zero-score options are left untouched.
 */
export function buildScaleSuggestion(
  mode: ScoringMode,
  target: number,
  options: ScoreOption[],
  rawMax = achievableMax(mode, options),
): ScaleRow[] {
  const positive = options.filter(o => !o.is_mandatory && o.score > 0);
  if (positive.length === 0 || rawMax <= 0 || target <= 0) return [];
  const factor = target / rawMax;

  const tiers = Array.from(new Set(positive.map(o => o.score))).sort((a, b) => b - a);
  const mapped = new Map<number, number>();
  let prev = Number.POSITIVE_INFINITY;
  for (const tier of tiers) {
    let v = Math.min(Math.round(tier * factor), target);
    if (v >= prev) v = prev - 1;          // keep distinct tiers distinct
    v = Math.max(v, 1);                   // a scoring tier never collapses to 0
    mapped.set(tier, v);
    prev = v;
  }

  return positive.map(o => {
    const to = mapped.get(o.score)!;
    return { id: o.id, label: o.label, from: o.score, to, changed: o.score !== to };
  });
}

export type BandDraft = Record<string, { min: number; max: number }>;

/**
 * Rescale grade bands onto a new total, keeping the original proportions and
 * leaving them contiguous from 0 up to the total. Always derived from the
 * original bands so repeated edits cannot drift.
 */
export function suggestBands(base: BandDraft, baseTotal: number, newTotal: number): BandDraft {
  const order = ['D', 'C', 'B', 'A'].filter(g => base[g]);
  const out: BandDraft = {};
  let prevMax = -1;
  order.forEach((g, i) => {
    const isLast = i === order.length - 1;
    const remaining = order.length - 1 - i;   // bands still to be placed after this one
    const min = Math.min(prevMax + 1, newTotal);
    let max: number;
    if (isLast) {
      max = newTotal;                         // the top band always ends at the total
    } else {
      const scaled = Math.round((base[g].max / Math.max(baseTotal, 1)) * newTotal);
      // Leave at least one value for every band that still has to fit above this one.
      max = Math.min(Math.max(scaled, min), Math.max(min, newTotal - remaining));
    }
    out[g] = { min, max: Math.max(min, max) };
    prevMax = out[g].max;
  });
  return out;
}
