import { describe, it, expect } from 'vitest';
import {
  achievableMax, needsRebalance, buildScaleSuggestion, suggestBands,
  type ScoreOption, type BandDraft,
} from '@/lib/brcRebalance';

const opt = (id: string, score: number, is_mandatory = false): ScoreOption =>
  ({ id, label: id, score, is_mandatory });

/** The real Product Certificate topic: full marks 10, best_match. */
const PRODUCT_CERT: ScoreOption[] = [
  opt('halal', 0, true),
  opt('gfsi', 10),
  opt('iso22000', 8),
  opt('iso9001', 6),
  opt('kosher', 5),
  opt('audit75', 5),
  opt('none', 0),
];

const scores = (rows: ReturnType<typeof buildScaleSuggestion>) =>
  Object.fromEntries(rows.map(r => [r.id, r.to]));

describe('achievableMax', () => {
  it('ignores mandatory options — they are a gate, not a score', () => {
    expect(achievableMax('best_match', PRODUCT_CERT)).toBe(10);
    const gfsiGated = PRODUCT_CERT.map(o => o.id === 'gfsi' ? { ...o, is_mandatory: true } : o);
    expect(achievableMax('best_match', gfsiGated)).toBe(8);
  });

  it('sums for additive topics', () => {
    expect(achievableMax('additive', [opt('a', 5), opt('b', 5), opt('c', 5)])).toBe(15);
    expect(achievableMax('additive', [opt('a', 5), opt('b', 5, true)])).toBe(5);
  });

  it('is 0 when every option is mandatory', () => {
    expect(achievableMax('best_match', [opt('a', 10, true)])).toBe(0);
  });
});

describe('needsRebalance', () => {
  it('flags a best_match topic that can no longer reach its marks', () => {
    expect(needsRebalance('best_match', 10, 8)).toBe(true);
  });
  it('flags a best_match topic that would overshoot', () => {
    expect(needsRebalance('best_match', 10, 12)).toBe(true);
  });
  it('is quiet when the marks are exactly reachable', () => {
    expect(needsRebalance('best_match', 10, 10)).toBe(false);
  });
  it('only flags additive topics that fall short — overshoot is capped anyway', () => {
    expect(needsRebalance('additive', 20, 15)).toBe(true);
    expect(needsRebalance('additive', 20, 25)).toBe(false);
  });
  it('is quiet when nothing scores at all', () => {
    expect(needsRebalance('best_match', 10, 0)).toBe(false);
  });
});

describe('buildScaleSuggestion — the reported duplicate bug', () => {
  const gfsiGated = PRODUCT_CERT.map(o => o.id === 'gfsi' ? { ...o, is_mandatory: true } : o);

  it('raises the best remaining option to the full marks', () => {
    const rows = buildScaleSuggestion('best_match', 10, gfsiGated);
    expect(scores(rows).iso22000).toBe(10);
  });

  it('never maps two different tiers onto the same score', () => {
    const rows = buildScaleSuggestion('best_match', 10, gfsiGated);
    // 8 and 6 were different tiers — naive rounding (×1.25) sent both toward 8/10.
    expect(scores(rows).iso22000).not.toBe(scores(rows).iso9001);
  });

  it('keeps options that already shared a score sharing one', () => {
    const rows = buildScaleSuggestion('best_match', 10, gfsiGated);
    expect(scores(rows).kosher).toBe(scores(rows).audit75);
  });

  it('preserves the original ranking', () => {
    const s = scores(buildScaleSuggestion('best_match', 10, gfsiGated));
    expect(s.iso22000).toBeGreaterThan(s.iso9001);
    expect(s.iso9001).toBeGreaterThan(s.kosher);
  });

  it('leaves zero-score options alone', () => {
    const rows = buildScaleSuggestion('best_match', 10, gfsiGated);
    expect(rows.find(r => r.id === 'none')).toBeUndefined();
  });

  it('never exceeds the topic full marks', () => {
    const rows = buildScaleSuggestion('best_match', 10, gfsiGated);
    rows.forEach(r => expect(r.to).toBeLessThanOrEqual(10));
  });

  it('never drops a scoring option to zero', () => {
    // Scaling down hard: marks 2, best remaining 100.
    const rows = buildScaleSuggestion('best_match', 2, [opt('a', 100), opt('b', 50), opt('c', 10)]);
    rows.forEach(r => expect(r.to).toBeGreaterThan(0));
  });

  it('marks only the options that actually move as changed', () => {
    const rows = buildScaleSuggestion('best_match', 10, gfsiGated);
    expect(rows.find(r => r.id === 'iso22000')!.changed).toBe(true);
    expect(rows.every(r => r.changed === (r.from !== r.to))).toBe(true);
  });

  it('suggests nothing when the marks are already reachable', () => {
    const rows = buildScaleSuggestion('best_match', 10, PRODUCT_CERT);
    expect(rows.some(r => r.changed)).toBe(false);
  });

  it('is stable — re-running on its own output changes nothing', () => {
    const first = buildScaleSuggestion('best_match', 10, gfsiGated);
    const applied = gfsiGated.map(o => {
      const row = first.find(r => r.id === o.id);
      return row ? { ...o, score: row.to } : o;
    });
    const second = buildScaleSuggestion('best_match', 10, applied);
    expect(second.some(r => r.changed)).toBe(false);
  });

  it('scales additive topics up to their marks', () => {
    const rows = buildScaleSuggestion('additive', 20, [opt('a', 5), opt('b', 3), opt('c', 2)]);
    const s = scores(rows);
    expect(s.a).toBeGreaterThan(s.b);
    expect(s.b).toBeGreaterThan(s.c);
  });

  it('returns nothing when there is no scoring option left', () => {
    expect(buildScaleSuggestion('best_match', 10, [opt('a', 10, true), opt('b', 0)])).toEqual([]);
  });
});

describe('suggestBands', () => {
  const BASE: BandDraft = {
    A: { min: 101, max: 125 },
    B: { min: 86, max: 100 },
    C: { min: 76, max: 85 },
    D: { min: 0, max: 75 },
  };

  it('keeps the bands unchanged when the total does not move', () => {
    expect(suggestBands(BASE, 125, 125)).toEqual(BASE);
  });

  it('rescales onto a larger total and tops out exactly there', () => {
    const out = suggestBands(BASE, 125, 130);
    expect(out.A.max).toBe(130);
    expect(out.D.min).toBe(0);
  });

  it('leaves no gaps or overlaps', () => {
    const out = suggestBands(BASE, 125, 130);
    expect(out.C.min).toBe(out.D.max + 1);
    expect(out.B.min).toBe(out.C.max + 1);
    expect(out.A.min).toBe(out.B.max + 1);
  });

  it('always derives from the original bands, so repeated calls cannot drift', () => {
    const once = suggestBands(BASE, 125, 130);
    const twice = suggestBands(BASE, 125, 130);
    expect(twice).toEqual(once);
  });

  it('handles shrinking totals', () => {
    const out = suggestBands(BASE, 125, 60);
    expect(out.A.max).toBe(60);
    expect(out.D.min).toBe(0);
    expect(out.A.min).toBe(out.B.max + 1);
  });

  it('stays ordered even on a tiny total', () => {
    const out = suggestBands(BASE, 125, 4);
    expect(out.A.max).toBe(4);
    ['D', 'C', 'B', 'A'].forEach(g => expect(out[g].min).toBeLessThanOrEqual(out[g].max));
  });
});
