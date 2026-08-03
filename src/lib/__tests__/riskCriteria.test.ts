import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isCriterionMet,
  computeDimensionRisks,
  passesCatalogGate,
  DIMENSION_LABEL,
  CATEGORY_OPTIONS,
  type RiskCriterion,
  type SupplierCert,
  type SupplierDoc,
  type CatalogCategory,
} from '@/lib/riskCriteria';
import { RISK_FACTORS } from '@/types/procurement';

// Frozen "now": 2026-08-03 12:00 in Asia/Bangkok (UTC+7) => 05:00Z.
const NOW = new Date('2026-08-03T05:00:00.000Z');

const crit = (over: Partial<RiskCriterion> = {}): RiskCriterion => ({
  id: over.id ?? 'c1',
  category: null,
  dimension: 'food_safety_risk',
  code: null,
  name_th: 'เกณฑ์ทดสอบ',
  description: null,
  weight: 1,
  match_type: 'certificate',
  match_keywords: ['iso'],
  is_mandatory: false,
  sort_order: 0,
  active: true,
  ...over,
});

const cert = (certificate_type: string | null, expiry_date: string | null = null): SupplierCert => ({
  certificate_type,
  expiry_date,
});

const doc = (document_type: string | null, document_name: string | null = null): SupplierDoc => ({
  document_type,
  document_name,
});

describe('constants', () => {
  it('DIMENSION_LABEL covers every RISK_FACTORS key', () => {
    expect(Object.keys(DIMENSION_LABEL).sort()).toEqual(RISK_FACTORS.map(f => f.key).sort());
    for (const f of RISK_FACTORS) expect(DIMENSION_LABEL[f.key]).toBe(f.label);
  });

  it('CATEGORY_OPTIONS lists the four catalog categories', () => {
    expect(CATEGORY_OPTIONS.map(o => o.value)).toEqual([
      'raw_material',
      'packaging',
      'service',
      'other',
    ] satisfies CatalogCategory[]);
    for (const o of CATEGORY_OPTIONS) expect(o.label.length).toBeGreaterThan(0);
  });
});

describe('isCriterionMet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('keyword handling', () => {
    it('is never met when the criterion has no keywords', () => {
      const c = crit({ match_keywords: [] });
      expect(isCriterionMet(c, [cert('ISO 9001')], [])).toBe(false);
    });

    it('is never met when every keyword is blank (falsy keywords are dropped)', () => {
      const c = crit({ match_keywords: ['', '  '.trim()] });
      expect(isCriterionMet(c, [cert('ISO 9001')], [])).toBe(false);
    });

    it('ignores blank keywords but still honours the real ones', () => {
      const c = crit({ match_keywords: ['', 'iso'] });
      expect(isCriterionMet(c, [cert('ISO 9001')], [])).toBe(true);
    });

    it('matches case-insensitively in both directions', () => {
      expect(isCriterionMet(crit({ match_keywords: ['ISO 22000'] }), [cert('iso 22000')], [])).toBe(true);
      expect(isCriterionMet(crit({ match_keywords: ['brcgs'] }), [cert('BRCGS Food Safety')], [])).toBe(true);
    });

    it('matches on a substring, not just the whole value', () => {
      expect(isCriterionMet(crit({ match_keywords: ['haccp'] }), [cert('HACCP Certificate v2')], [])).toBe(true);
      expect(isCriterionMet(crit({ match_keywords: ['22000'] }), [cert('ISO 22000:2018')], [])).toBe(true);
    });

    it('does not match an unrelated certificate', () => {
      expect(isCriterionMet(crit({ match_keywords: ['halal'] }), [cert('ISO 9001')], [])).toBe(false);
    });

    it('matches Thai keywords and Thai certificate names', () => {
      const c = crit({ match_keywords: ['ฮาลาล'] });
      expect(isCriterionMet(c, [cert('ใบรับรองฮาลาล')], [])).toBe(true);
      expect(isCriterionMet(c, [cert('ใบรับรอง GMP')], [])).toBe(false);
    });

    it('matches when ANY keyword hits (OR semantics)', () => {
      const c = crit({ match_keywords: ['halal', 'iso'] });
      expect(isCriterionMet(c, [cert('ISO 9001')], [])).toBe(true);
    });

    it('matches when ANY certificate hits (OR over certificates)', () => {
      const c = crit({ match_keywords: ['halal'] });
      expect(isCriterionMet(c, [cert('ISO 9001'), cert('Halal Certificate')], [])).toBe(true);
    });

    it('treats a null certificate_type as an empty haystack', () => {
      expect(isCriterionMet(crit({ match_keywords: ['iso'] }), [cert(null)], [])).toBe(false);
    });
  });

  describe('certificate expiry', () => {
    it('accepts a certificate with no expiry recorded', () => {
      expect(isCriterionMet(crit(), [cert('ISO 9001', null)], [])).toBe(true);
    });

    it('accepts a certificate expiring in the future', () => {
      expect(isCriterionMet(crit(), [cert('ISO 9001', '2027-01-01')], [])).toBe(true);
    });

    it('rejects a certificate that expired yesterday', () => {
      expect(isCriterionMet(crit(), [cert('ISO 9001', '2026-08-02')], [])).toBe(false);
    });

    it('rejects a long-expired certificate', () => {
      expect(isCriterionMet(crit(), [cert('ISO 9001', '2020-01-01')], [])).toBe(false);
    });

    it('accepts a certificate expiring exactly at local midnight today (boundary)', () => {
      // Local-time literal => exactly equal to today 00:00, and `d < today` is false.
      expect(isCriterionMet(crit(), [cert('ISO 9001', '2026-08-03T00:00:00')], [])).toBe(true);
    });

    it('accepts a certificate expiring later today', () => {
      expect(isCriterionMet(crit(), [cert('ISO 9001', '2026-08-03T23:59:59')], [])).toBe(true);
    });

    it('accepts a certificate expiring tomorrow', () => {
      expect(isCriterionMet(crit(), [cert('ISO 9001', '2026-08-04')], [])).toBe(true);
    });

    it('falls back to a second, still-valid certificate when the first is expired', () => {
      const certs = [cert('ISO 9001', '2020-01-01'), cert('ISO 9001', '2027-01-01')];
      expect(isCriterionMet(crit(), certs, [])).toBe(true);
    });
  });

  describe('document matching', () => {
    const docCrit = (kws: string[]) => crit({ match_type: 'document', match_keywords: kws });

    it('matches on document_type', () => {
      expect(isCriterionMet(docCrit(['coa']), [], [doc('COA', 'batch 12')])).toBe(true);
    });

    it('matches on document_name', () => {
      expect(isCriterionMet(docCrit(['spec']), [], [doc('other', 'Product Spec Sheet')])).toBe(true);
    });

    it('tolerates null type and name', () => {
      expect(isCriterionMet(docCrit(['coa']), [], [doc(null, null)])).toBe(false);
    });

    it('matches a Thai document name', () => {
      expect(isCriterionMet(docCrit(['ใบรับรอง']), [], [doc(null, 'ใบรับรองการวิเคราะห์')])).toBe(true);
    });

    it('is not met when there are no documents', () => {
      expect(isCriterionMet(docCrit(['coa']), [], [])).toBe(false);
    });

    it('ignores certificates entirely for document criteria', () => {
      expect(isCriterionMet(docCrit(['iso']), [cert('ISO 9001')], [])).toBe(false);
    });

    it('ignores documents entirely for certificate criteria', () => {
      expect(isCriterionMet(crit({ match_keywords: ['coa'] }), [], [doc('COA')])).toBe(false);
    });

    it('never applies expiry logic to documents', () => {
      // Documents carry no expiry field at all, so an old doc still satisfies.
      expect(isCriterionMet(docCrit(['coa']), [], [doc('COA', 'issued 2019')])).toBe(true);
    });

    // Documents current behaviour: type and name are joined with a space before
    // matching, so a keyword spanning the join matches across the two fields.
    it('matches a keyword that spans the type/name join', () => {
      expect(isCriterionMet(docCrit(['coa batch']), [], [doc('COA', 'batch 12')])).toBe(true);
    });
  });
});

describe('computeDimensionRisks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an empty map for no criteria', () => {
    expect(computeDimensionRisks([], [], [], 'all')).toEqual({});
  });

  it('returns an empty map when every criterion is inactive', () => {
    const cs = [crit({ active: false }), crit({ id: 'c2', active: false, dimension: 'quality_risk' })];
    expect(computeDimensionRisks(cs, [cert('ISO 9001')], [], 'all')).toEqual({});
  });

  it('omits dimensions that have no applicable criteria', () => {
    const out = computeDimensionRisks([crit({ dimension: 'quality_risk' })], [], [], 'all');
    expect(Object.keys(out)).toEqual(['quality_risk']);
    expect(out.food_safety_risk).toBeUndefined();
  });

  it('scores 10 (worst) when nothing is met', () => {
    const out = computeDimensionRisks([crit({ weight: 5 })], [], [], 'all');
    expect(out.food_safety_risk).toMatchObject({
      dimension: 'food_safety_risk',
      score: 10,
      metWeight: 0,
      totalWeight: 5,
      mandatoryUnmet: false,
    });
  });

  it('scores 0 (best) when everything is met', () => {
    const cs = [crit({ weight: 3 }), crit({ id: 'c2', weight: 7, match_keywords: ['haccp'] })];
    const out = computeDimensionRisks(cs, [cert('ISO 9001'), cert('HACCP')], [], 'all');
    expect(out.food_safety_risk).toMatchObject({ score: 0, metWeight: 10, totalWeight: 10 });
  });

  it('weights partial coverage and rounds to the nearest integer', () => {
    // met 2 of 3 equal weights => (1 - 2/3) * 10 = 3.33 => 3
    const cs = [
      crit({ id: 'a', match_keywords: ['iso'] }),
      crit({ id: 'b', match_keywords: ['haccp'] }),
      crit({ id: 'c', match_keywords: ['halal'] }),
    ];
    const out = computeDimensionRisks(cs, [cert('ISO 9001'), cert('HACCP')], [], 'all');
    expect(out.food_safety_risk.metWeight).toBe(2);
    expect(out.food_safety_risk.totalWeight).toBe(3);
    expect(out.food_safety_risk.score).toBe(3);
  });

  it('rounds a .5 result half-up', () => {
    // met 3 of 4 => (1 - 0.75) * 10 = 2.5 => Math.round => 3
    const cs = [
      crit({ id: 'a', match_keywords: ['iso'] }),
      crit({ id: 'b', match_keywords: ['haccp'] }),
      crit({ id: 'c', match_keywords: ['halal'] }),
      crit({ id: 'd', match_keywords: ['brcgs'] }),
    ];
    const certs = [cert('ISO 9001'), cert('HACCP'), cert('Halal')];
    expect(computeDimensionRisks(cs, certs, [], 'all').food_safety_risk.score).toBe(3);
  });

  it('honours unequal weights', () => {
    // met weight 9 of 10 => (1 - 0.9) * 10 = 1
    const cs = [
      crit({ id: 'a', weight: 9, match_keywords: ['iso'] }),
      crit({ id: 'b', weight: 1, match_keywords: ['halal'] }),
    ];
    const out = computeDimensionRisks(cs, [cert('ISO 9001')], [], 'all');
    expect(out.food_safety_risk).toMatchObject({ metWeight: 9, totalWeight: 10, score: 1 });
  });

  describe('zero weights', () => {
    it('reports "not assessed" (null) when all weights are zero, not a perfect 0', () => {
      const cs = [crit({ weight: 0 }), crit({ id: 'c2', weight: 0, match_keywords: ['halal'] })];
      const out = computeDimensionRisks(cs, [], [], 'all');
      expect(out.food_safety_risk).toMatchObject({ score: null, metWeight: 0, totalWeight: 0 });
    });

    it('still forces maximum risk when a zero-weight mandatory criterion is unmet', () => {
      const cs = [crit({ weight: 0, is_mandatory: true, match_keywords: ['halal'] })];
      const out = computeDimensionRisks(cs, [], [], 'all');
      expect(out.food_safety_risk).toMatchObject({ score: 10, mandatoryUnmet: true });
    });

    it('a zero-weight criterion contributes nothing to the score', () => {
      const cs = [
        crit({ id: 'a', weight: 10, match_keywords: ['iso'] }),
        crit({ id: 'b', weight: 0, match_keywords: ['halal'] }),
      ];
      const out = computeDimensionRisks(cs, [cert('ISO 9001')], [], 'all');
      expect(out.food_safety_risk).toMatchObject({ score: 0, metWeight: 10, totalWeight: 10 });
    });

    it('still reports a zero-weight mandatory criterion as a hard fail', () => {
      const cs = [crit({ weight: 0, is_mandatory: true })];
      const out = computeDimensionRisks(cs, [], [], 'all');
      expect(out.food_safety_risk).toMatchObject({ score: 10, mandatoryUnmet: true, totalWeight: 0 });
    });
  });

  describe('mandatory criteria', () => {
    it('forces score 10 when a mandatory criterion is unmet, no matter the weights', () => {
      const cs = [
        crit({ id: 'a', weight: 99, match_keywords: ['iso'] }),
        crit({ id: 'b', weight: 1, is_mandatory: true, match_keywords: ['halal'] }),
      ];
      const out = computeDimensionRisks(cs, [cert('ISO 9001')], [], 'all');
      expect(out.food_safety_risk).toMatchObject({ score: 10, mandatoryUnmet: true, metWeight: 99 });
    });

    it('does not flag mandatoryUnmet when the mandatory criterion is satisfied', () => {
      const cs = [crit({ is_mandatory: true, match_keywords: ['halal'] })];
      const out = computeDimensionRisks(cs, [cert('Halal Cert')], [], 'all');
      expect(out.food_safety_risk).toMatchObject({ score: 0, mandatoryUnmet: false });
    });

    it('treats a mandatory criterion backed only by an expired certificate as unmet', () => {
      const cs = [crit({ is_mandatory: true })];
      const out = computeDimensionRisks(cs, [cert('ISO 9001', '2026-08-02')], [], 'all');
      expect(out.food_safety_risk).toMatchObject({ score: 10, mandatoryUnmet: true });
    });

    it('confines mandatory failure to its own dimension', () => {
      const cs = [
        crit({ id: 'a', dimension: 'food_safety_risk', is_mandatory: true, match_keywords: ['halal'] }),
        crit({ id: 'b', dimension: 'quality_risk', match_keywords: ['iso'] }),
      ];
      const out = computeDimensionRisks(cs, [cert('ISO 9001')], [], 'all');
      expect(out.food_safety_risk.score).toBe(10);
      expect(out.quality_risk.score).toBe(0);
      expect(out.quality_risk.mandatoryUnmet).toBe(false);
    });
  });

  describe('category filtering', () => {
    const cs = [
      crit({ id: 'global', category: null, dimension: 'food_safety_risk' }),
      crit({ id: 'raw', category: 'raw_material', dimension: 'quality_risk' }),
      crit({ id: 'pack', category: 'packaging', dimension: 'delivery_risk' }),
    ];

    it('"all" includes every category, global and specific alike', () => {
      const out = computeDimensionRisks(cs, [], [], 'all');
      expect(Object.keys(out).sort()).toEqual(['delivery_risk', 'food_safety_risk', 'quality_risk']);
    });

    it('a specific category keeps its own criteria plus global (null) ones', () => {
      const out = computeDimensionRisks(cs, [], [], 'raw_material');
      expect(Object.keys(out).sort()).toEqual(['food_safety_risk', 'quality_risk']);
    });

    it('excludes criteria belonging to a different category', () => {
      const out = computeDimensionRisks(cs, [], [], 'service');
      expect(Object.keys(out)).toEqual(['food_safety_risk']);
    });

    it('drops inactive criteria even when the category matches', () => {
      const out = computeDimensionRisks(
        [...cs, crit({ id: 'x', category: 'raw_material', dimension: 'allergen_risk', active: false })],
        [],
        [],
        'raw_material',
      );
      expect(Object.keys(out)).not.toContain('allergen_risk');
    });
  });

  describe('returned criteria list', () => {
    it('sorts criteria by sort_order and tags each with met', () => {
      const cs = [
        crit({ id: 'third', sort_order: 3, match_keywords: ['halal'] }),
        crit({ id: 'first', sort_order: 1, match_keywords: ['iso'] }),
        crit({ id: 'second', sort_order: 2, match_keywords: ['haccp'] }),
      ];
      const out = computeDimensionRisks(cs, [cert('ISO 9001')], [], 'all');
      expect(out.food_safety_risk.criteria.map(c => c.id)).toEqual(['first', 'second', 'third']);
      expect(out.food_safety_risk.criteria.map(c => c.met)).toEqual([true, false, false]);
    });

    it('preserves the original criterion fields alongside met', () => {
      const c = crit({ code: 'FS-01', name_th: 'ระบบ HACCP', description: 'desc' });
      const result = computeDimensionRisks([c], [cert('ISO 9001')], [], 'all').food_safety_risk.criteria[0];
      expect(result).toEqual({ ...c, met: true });
    });

    it('does not mutate the input criteria array or its objects', () => {
      const cs = [crit({ id: 'b', sort_order: 2 }), crit({ id: 'a', sort_order: 1 })];
      const snapshot = JSON.parse(JSON.stringify(cs));
      computeDimensionRisks(cs, [], [], 'all');
      expect(cs.map(c => c.id)).toEqual(['b', 'a']);
      expect(cs).toEqual(snapshot);
    });
  });

  it('handles empty certificate and document lists', () => {
    const cs = [crit({ match_type: 'document', match_keywords: ['coa'] })];
    const out = computeDimensionRisks(cs, [], [], 'all');
    expect(out.food_safety_risk).toMatchObject({ score: 10, metWeight: 0, totalWeight: 1 });
  });

  it('evaluates certificate and document criteria in the same dimension', () => {
    const cs = [
      crit({ id: 'cert', match_type: 'certificate', match_keywords: ['iso'] }),
      crit({ id: 'doc', match_type: 'document', match_keywords: ['coa'] }),
    ];
    const out = computeDimensionRisks(cs, [cert('ISO 9001')], [doc('COA')], 'all');
    expect(out.food_safety_risk).toMatchObject({ score: 0, metWeight: 2, totalWeight: 2 });
  });
});

describe('passesCatalogGate', () => {
  it('passes when the rules are null', () => {
    expect(passesCatalogGate(null, { food_safety_risk: 10 })).toEqual({ passes: true, failed: [] });
  });

  it('passes when the rules are undefined', () => {
    expect(passesCatalogGate(undefined, { food_safety_risk: 10 })).toEqual({ passes: true, failed: [] });
  });

  it('passes when the rules are an empty object', () => {
    expect(passesCatalogGate({}, { food_safety_risk: 10 })).toEqual({ passes: true, failed: [] });
  });

  it('passes when the score is below the threshold', () => {
    expect(passesCatalogGate({ food_safety_risk: 5 }, { food_safety_risk: 3 }).passes).toBe(true);
  });

  it('passes when the score equals the threshold exactly (boundary, inclusive)', () => {
    expect(passesCatalogGate({ food_safety_risk: 5 }, { food_safety_risk: 5 }).passes).toBe(true);
  });

  it('fails one point over the threshold and reports the detail', () => {
    const r = passesCatalogGate({ food_safety_risk: 5 }, { food_safety_risk: 6 });
    expect(r.passes).toBe(false);
    expect(r.failed).toEqual([{ dimension: 'food_safety_risk', score: 6, max: 5 }]);
  });

  it('treats an unassessed (null) dimension as passing', () => {
    expect(passesCatalogGate({ food_safety_risk: 0 }, { food_safety_risk: null })).toEqual({
      passes: true,
      failed: [],
    });
  });

  it('treats a missing (undefined) dimension as passing', () => {
    expect(passesCatalogGate({ food_safety_risk: 0 }, {})).toEqual({ passes: true, failed: [] });
  });

  it('does not confuse a score of 0 with "not assessed"', () => {
    expect(passesCatalogGate({ food_safety_risk: 0 }, { food_safety_risk: 0 }).passes).toBe(true);
    const r = passesCatalogGate({ food_safety_risk: -1 }, { food_safety_risk: 0 });
    expect(r.passes).toBe(false);
    expect(r.failed).toEqual([{ dimension: 'food_safety_risk', score: 0, max: -1 }]);
  });

  it('collects every failing dimension', () => {
    const r = passesCatalogGate(
      { food_safety_risk: 2, quality_risk: 3, delivery_risk: 9 },
      { food_safety_risk: 10, quality_risk: 4, delivery_risk: 1 },
    );
    expect(r.passes).toBe(false);
    expect(r.failed).toEqual([
      { dimension: 'food_safety_risk', score: 10, max: 2 },
      { dimension: 'quality_risk', score: 4, max: 3 },
    ]);
  });

  it('passes only when every listed dimension passes', () => {
    const r = passesCatalogGate(
      { food_safety_risk: 5, quality_risk: 5 },
      { food_safety_risk: 5, quality_risk: 0, delivery_risk: 10 },
    );
    expect(r).toEqual({ passes: true, failed: [] });
  });
});
