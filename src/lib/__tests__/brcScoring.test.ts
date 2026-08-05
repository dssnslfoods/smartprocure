import { describe, it, expect } from 'vitest';
import {
  evaluateBrc,
  parsePaymentTermDays,
  groupWeightsFor,
  type BrcTopic,
  type BrcOption,
  type BrcGradeBand,
  type BrcManualScore,
  type BrcEvidence,
  type SupplierCert,
  type SupplierDoc,
  type QuotationContext,
} from '@/lib/brcScoring';

// ── fixtures ────────────────────────────────────────────────────────────────
const TYPE = 'rm_primary_pk';

function mkTopic(over: Partial<BrcTopic> & { id: string }): BrcTopic {
  return {
    supplier_type: TYPE,
    section: 'Food Safety',
    topic: 'Topic',
    scoring_mode: 'best_match',
    auto_source: 'evidence',
    quotation_field: null,
    criterion_group: 'safety_quality',
    target_score: 10,
    sort_order: 10,
    active: true,
    ...over,
  };
}

function mkOption(over: Partial<BrcOption> & { id: string; topic_id: string }): BrcOption {
  return {
    label: 'Option',
    score: 0,
    match_type: 'certificate',
    match_keywords: [],
    requirement: null,
    is_mandatory: false,
    expired_policy: 'block',
    sort_order: 10,
    ...over,
  };
}

/** maxScore = 45 → bands sized to that scale. */
const BANDS: BrcGradeBand[] = [
  { supplier_type: TYPE, grade: 'A', label_th: 'Preferred / ดีเยี่ยม', min_score: 36, max_score: 45 },
  { supplier_type: TYPE, grade: 'B', label_th: 'Approved / อนุมัติ', min_score: 27, max_score: 35 },
  { supplier_type: TYPE, grade: 'C', label_th: 'Restricted / จำกัด', min_score: 18, max_score: 26 },
  { supplier_type: TYPE, grade: 'D', label_th: 'Unsuitable / ไม่เหมาะสม', min_score: 0, max_score: 17 },
];

/** Certificate topic (best_match, target 10) */
const T_CERT = mkTopic({ id: 't-cert', topic: 'Product Certificate', target_score: 10, scoring_mode: 'best_match' });
const O_GFSI = mkOption({ id: 'o-gfsi', topic_id: 't-cert', label: 'GFSI', score: 10, match_keywords: ['gfsi', 'brcgs'] });
const O_ISO = mkOption({ id: 'o-iso', topic_id: 't-cert', label: 'ISO22000', score: 8, match_keywords: ['iso22000'], sort_order: 20 });

/** Document topic (additive, target 20, 4 × 5pt) */
const T_DOCS = mkTopic({ id: 't-docs', section: 'Food Legality', topic: 'Product Legality', target_score: 20, scoring_mode: 'additive', sort_order: 20 });
const O_SPEC = mkOption({ id: 'o-spec', topic_id: 't-docs', label: 'Spec', score: 5, match_type: 'document', match_keywords: ['spec'] });
const O_COA = mkOption({ id: 'o-coa', topic_id: 't-docs', label: 'COA', score: 5, match_type: 'document', match_keywords: ['coa'], sort_order: 20 });
const O_ALG = mkOption({ id: 'o-alg', topic_id: 't-docs', label: 'Allergen', score: 5, match_type: 'document', match_keywords: ['allergen'], sort_order: 30 });
const O_ORI = mkOption({ id: 'o-ori', topic_id: 't-docs', label: 'Origin', score: 5, match_type: 'document', match_keywords: ['origin'], sort_order: 40 });

/** Commercial topic (quotation-derived, target 15) */
const T_PRICE = mkTopic({
  id: 't-price', section: 'Competition', topic: 'Pricing', target_score: 15,
  auto_source: 'quotation', quotation_field: 'price', criterion_group: 'commercial', sort_order: 30,
});
const O_P15 = mkOption({ id: 'o-p15', topic_id: 't-price', label: 'ต่ำสุด', score: 15, match_type: 'auto' });
const O_P10 = mkOption({ id: 'o-p10', topic_id: 't-price', label: 'ต่อรองได้', score: 10, match_type: 'auto', sort_order: 20 });
const O_P0 = mkOption({ id: 'o-p0', topic_id: 't-price', label: 'สูงเกิน', score: 0, match_type: 'auto', sort_order: 30 });

const TOPICS = [T_CERT, T_DOCS, T_PRICE];
const OPTS: Record<string, BrcOption[]> = {
  't-cert': [O_GFSI, O_ISO],
  't-docs': [O_SPEC, O_COA, O_ALG, O_ORI],
  't-price': [O_P15, O_P10, O_P0],
};

const NO_MANUAL: Record<string, BrcManualScore> = {};

function evalWith(opts: {
  topics?: BrcTopic[];
  optionsByTopic?: Record<string, BrcOption[]>;
  certs?: SupplierCert[];
  docs?: SupplierDoc[];
  manual?: Record<string, BrcManualScore>;
  ctx?: QuotationContext;
  evidence?: BrcEvidence[];
  weights?: { safety: number; commercial: number };
} = {}) {
  return evaluateBrc(
    TYPE,
    opts.topics ?? TOPICS,
    opts.optionsByTopic ?? OPTS,
    opts.certs ?? [],
    opts.docs ?? [],
    opts.manual ?? NO_MANUAL,
    BANDS,
    opts.ctx,
    opts.evidence ?? [],
    opts.weights,
  );
}

const topicById = (brc: ReturnType<typeof evalWith>, id: string) =>
  brc.topics.find(t => t.topic.id === id)!;

const futureDate = () => new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
const pastDate = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// ── parsePaymentTermDays ────────────────────────────────────────────────────
describe('parsePaymentTermDays', () => {
  it('returns null for empty input', () => {
    expect(parsePaymentTermDays(null)).toBeNull();
    expect(parsePaymentTermDays(undefined)).toBeNull();
    expect(parsePaymentTermDays('')).toBeNull();
  });

  it('reads the first number out of common formats', () => {
    expect(parsePaymentTermDays('Net 30')).toBe(30);
    expect(parsePaymentTermDays('45 days')).toBe(45);
    expect(parsePaymentTermDays('เครดิต 60 วัน')).toBe(60);
  });

  it('returns null when there is no number (COD / cash)', () => {
    expect(parsePaymentTermDays('COD')).toBeNull();
    expect(parsePaymentTermDays('เงินสด')).toBeNull();
  });

  // This is precisely why quotations.credit_term_days exists: the regex takes the
  // FIRST number, so an early-payment-discount term parses to the discount window.
  it('mis-parses "2/10 Net 30" as 2 days — the known weakness', () => {
    expect(parsePaymentTermDays('2/10 Net 30')).toBe(2);
  });
});

// ── scoring modes ───────────────────────────────────────────────────────────
describe('evaluateBrc — scoring modes', () => {
  it('best_match takes the highest matching option, not the sum', () => {
    const brc = evalWith({
      certs: [
        { certificate_type: 'BRCGS Food Safety', expiry_date: futureDate() },
        { certificate_type: 'ISO22000', expiry_date: futureDate() },
      ],
    });
    const t = topicById(brc, 't-cert');
    expect(t.matchedOptions).toHaveLength(2);
    expect(t.score).toBe(10); // max(10, 8) — not 18
  });

  // The tiers of a best_match topic are alternatives, not additions: holding every
  // certificate at once still scores the single best one, never their sum.
  it('best_match never exceeds the target even when every option matches', () => {
    const t = mkTopic({ id: 't-all', topic: 'Product Certificate', target_score: 10, scoring_mode: 'best_match' });
    const opts = {
      't-all': [
        mkOption({ id: 'a', topic_id: 't-all', label: 'GFSI', score: 10, match_keywords: ['gfsi'] }),
        mkOption({ id: 'b', topic_id: 't-all', label: 'ISO22000', score: 8, match_keywords: ['iso22000'], sort_order: 20 }),
        mkOption({ id: 'c', topic_id: 't-all', label: 'ISO9001', score: 7, match_keywords: ['iso9001'], sort_order: 30 }),
        mkOption({ id: 'd', topic_id: 't-all', label: 'Kosher', score: 5, match_keywords: ['kosher'], sort_order: 40 }),
      ],
    };
    const brc = evalWith({
      topics: [t], optionsByTopic: opts,
      certs: [
        { certificate_type: 'GFSI', expiry_date: futureDate() },
        { certificate_type: 'ISO22000', expiry_date: futureDate() },
        { certificate_type: 'ISO9001', expiry_date: futureDate() },
        { certificate_type: 'Kosher', expiry_date: futureDate() },
      ],
    });
    const r = topicById(brc, 't-all');
    expect(r.matchedOptions).toHaveLength(4); // all four matched
    expect(r.score).toBe(10);                 // ...but only the best one scores
    expect(r.score).toBeLessThanOrEqual(r.maxScore);
  });

  it('additive sums every distinct matched option', () => {
    const brc = evalWith({
      docs: [
        { document_type: 'spec', document_name: 'spec sheet' },
        { document_type: null, document_name: 'COA batch 1' },
      ],
    });
    expect(topicById(brc, 't-docs').score).toBe(10);
  });

  it('additive is capped at the topic target score', () => {
    const capped = mkTopic({ id: 't-docs', section: 'Food Legality', topic: 'Product Legality', target_score: 12, scoring_mode: 'additive', sort_order: 20 });
    const brc = evalWith({
      topics: [capped],
      optionsByTopic: { 't-docs': OPTS['t-docs'] },
      docs: [
        { document_type: 'spec', document_name: 'x' },
        { document_type: 'coa', document_name: 'x' },
        { document_type: 'allergen', document_name: 'x' },
        { document_type: 'origin', document_name: 'x' },
      ],
    });
    expect(topicById(brc, 't-docs').score).toBe(12); // 20 raw, capped at 12
  });

  it('scores 0 when nothing matches', () => {
    const brc = evalWith({ certs: [{ certificate_type: 'Halal', expiry_date: futureDate() }] });
    const t = topicById(brc, 't-cert');
    expect(t.matchedOptions).toHaveLength(0);
    expect(t.score).toBe(0);
  });
});

// ── evidence matching ───────────────────────────────────────────────────────
describe('evaluateBrc — evidence matching', () => {
  it('matches certificates case-insensitively on a substring', () => {
    const brc = evalWith({ certs: [{ certificate_type: 'Global BRCGS Issue 9', expiry_date: futureDate() }] });
    expect(topicById(brc, 't-cert').score).toBe(10);
  });

  it('ignores letter case on both sides of the match', () => {
    // Keywords are typed however the admin prefers — "ISO14001", "iso14001" and
    // "Iso14001" must all match a certificate recorded in any casing.
    const esg = mkOption({
      id: 'o-esg', topic_id: 't-cert', label: 'ESG', score: 7,
      match_keywords: ['ISO14001', 'SA8000', 'BSCI', 'SMETA 4 pillar'],
    });
    const run = (certificate_type: string) => topicById(evalWith({
      topics: [T_CERT], optionsByTopic: { 't-cert': [esg] },
      certs: [{ certificate_type, expiry_date: futureDate() }],
    }), 't-cert').score;

    expect(run('iso14001 certificate')).toBe(7);   // lower-case record
    expect(run('ISO14001')).toBe(7);               // upper-case record
    expect(run('Certificate of SA8000')).toBe(7);  // mixed case, substring
    expect(run('smeta 4 PILLAR audit')).toBe(7);   // multi-word keyword
    expect(run('ISO 14001')).toBe(0);              // a space is still a difference
  });

  it('ignores expired certificates', () => {
    const brc = evalWith({ certs: [{ certificate_type: 'GFSI', expiry_date: pastDate() }] });
    expect(topicById(brc, 't-cert').score).toBe(0);
  });

  describe('expired_policy', () => {
    const withPolicy = (expired_policy: 'block' | 'warn') => ({
      topics: [T_CERT],
      optionsByTopic: {
        't-cert': [mkOption({ id: 'o-gfsi', topic_id: 't-cert', label: 'GFSI', score: 10, match_keywords: ['gfsi'], expired_policy })],
      },
    });

    it("'block' (default) ignores an expired certificate entirely", () => {
      const brc = evalWith({ ...withPolicy('block'), certs: [{ certificate_type: 'GFSI', expiry_date: pastDate() }] });
      expect(topicById(brc, 't-cert').score).toBe(0);
      expect(brc.expiredWarnings).toEqual([]);
    });

    it("'warn' still scores an expired certificate but records a warning", () => {
      const brc = evalWith({ ...withPolicy('warn'), certs: [{ certificate_type: 'GFSI', expiry_date: pastDate() }] });
      const t = topicById(brc, 't-cert');
      expect(t.score).toBe(10);
      expect(t.matchedOptions[0].expired).toBe(true);
      expect(brc.expiredWarnings).toEqual([{ topic: 'Product Certificate', option: 'GFSI', via: 'GFSI' }]);
    });

    it('prefers a valid certificate over a lapsed one and raises no warning', () => {
      const brc = evalWith({
        ...withPolicy('warn'),
        certs: [
          { certificate_type: 'GFSI old', expiry_date: pastDate() },
          { certificate_type: 'GFSI current', expiry_date: futureDate() },
        ],
      });
      const t = topicById(brc, 't-cert');
      expect(t.score).toBe(10);
      expect(t.matchedOptions[0].expired).toBeFalsy();
      expect(brc.expiredWarnings).toEqual([]);
    });

    it("'warn' also applies to a file uploaded against the option", () => {
      const stale: BrcEvidence = {
        id: 'e1', supplier_id: 's1', topic_id: 't-cert', option_id: 'o-gfsi',
        file_url: 'u', file_name: 'gfsi-2020.pdf', file_size: 1, expiry_date: pastDate(),
        note: null, created_at: new Date().toISOString(),
      };
      const blocked = evalWith({ ...withPolicy('block'), evidence: [stale] });
      const warned = evalWith({ ...withPolicy('warn'), evidence: [stale] });
      expect(topicById(blocked, 't-cert').score).toBe(0);
      expect(topicById(warned, 't-cert').score).toBe(10);
      expect(warned.expiredWarnings[0].via).toBe('gfsi-2020.pdf');
    });

    it("lets 'warn' satisfy the mandatory gate on a lapsed document", () => {
      const gate = mkOption({
        id: 'o-halal', topic_id: 't-cert', label: 'Halal', score: 0,
        match_keywords: ['halal'], is_mandatory: true, expired_policy: 'warn',
      });
      const brc = evalWith({
        topics: [T_CERT], optionsByTopic: { 't-cert': [gate, O_GFSI] },
        certs: [
          { certificate_type: 'Halal', expiry_date: pastDate() },
          { certificate_type: 'GFSI', expiry_date: futureDate() },
        ],
      });
      expect(brc.mandatoryPassed).toBe(true);
      expect(brc.expiredWarnings.some(w => w.option === 'Halal')).toBe(true);
    });
  });

  it('treats a certificate with no expiry date as valid', () => {
    const brc = evalWith({ certs: [{ certificate_type: 'GFSI', expiry_date: null }] });
    expect(topicById(brc, 't-cert').score).toBe(10);
  });

  it('matches documents on either type or name', () => {
    const byType = evalWith({ docs: [{ document_type: 'allergen', document_name: 'file.pdf' }] });
    const byName = evalWith({ docs: [{ document_type: 'other', document_name: 'Allergen Statement.pdf' }] });
    expect(topicById(byType, 't-docs').score).toBe(5);
    expect(topicById(byName, 't-docs').score).toBe(5);
  });

  it('never matches an option that has no keywords', () => {
    const noKw = mkOption({ id: 'o-nokw', topic_id: 't-cert', label: 'No keywords', score: 9, match_keywords: [] });
    const brc = evalWith({
      topics: [T_CERT],
      optionsByTopic: { 't-cert': [noKw] },
      certs: [{ certificate_type: 'anything', expiry_date: null }],
    });
    expect(topicById(brc, 't-cert').score).toBe(0);
  });

  it('counts a file uploaded directly against an option', () => {
    const ev: BrcEvidence = {
      id: 'e1', supplier_id: 's1', topic_id: 't-cert', option_id: 'o-gfsi',
      file_url: 'u', file_name: 'cert.pdf', file_size: 1, expiry_date: futureDate(),
      note: null, created_at: new Date().toISOString(),
    };
    const brc = evalWith({ evidence: [ev] });
    const t = topicById(brc, 't-cert');
    expect(t.score).toBe(10);
    expect(t.matchedOptions[0].via).toBe('cert.pdf');
  });

  it('ignores an expired uploaded file', () => {
    const ev: BrcEvidence = {
      id: 'e1', supplier_id: 's1', topic_id: 't-cert', option_id: 'o-gfsi',
      file_url: 'u', file_name: 'cert.pdf', file_size: 1, expiry_date: pastDate(),
      note: null, created_at: new Date().toISOString(),
    };
    expect(topicById(evalWith({ evidence: [ev] }), 't-cert').score).toBe(0);
  });
});

// ── mandatory gate ──────────────────────────────────────────────────────────
describe('evaluateBrc — mandatory gate', () => {
  const O_HALAL = mkOption({
    id: 'o-halal', topic_id: 't-cert', label: 'Halal', score: 5,
    match_keywords: ['halal'], is_mandatory: true, sort_order: 5,
  });
  const TOPICS_M = [mkTopic({ id: 't-cert', topic: 'Product Certificate', target_score: 20, scoring_mode: 'additive' })];
  const OPTS_M = { 't-cert': [O_HALAL, O_GFSI, O_ISO] };

  it('fails the gate when no mandatory option is satisfied', () => {
    const brc = evalWith({
      topics: TOPICS_M, optionsByTopic: OPTS_M,
      certs: [{ certificate_type: 'GFSI', expiry_date: futureDate() }],
    });
    expect(brc.mandatoryPassed).toBe(false);
    expect(brc.mandatoryFailures).toEqual([{ topic: 'Product Certificate', options: ['Halal'] }]);
    expect(topicById(brc, 't-cert').mandatoryMet).toBe(false);
  });

  it('passes the gate once a mandatory option is satisfied', () => {
    const brc = evalWith({
      topics: TOPICS_M, optionsByTopic: OPTS_M,
      certs: [
        { certificate_type: 'Halal', expiry_date: futureDate() },
        { certificate_type: 'GFSI', expiry_date: futureDate() },
      ],
    });
    expect(brc.mandatoryPassed).toBe(true);
    expect(brc.mandatoryFailures).toEqual([]);
  });

  it('excludes mandatory options from the score (gate only)', () => {
    const brc = evalWith({
      topics: TOPICS_M, optionsByTopic: OPTS_M,
      certs: [
        { certificate_type: 'Halal', expiry_date: futureDate() }, // mandatory, 5pt — must NOT count
        { certificate_type: 'GFSI', expiry_date: futureDate() },  // 10pt
      ],
    });
    expect(topicById(brc, 't-cert').score).toBe(10); // not 15
  });

  // Failing the gate disqualifies the supplier, so partial marks would mislead.
  it('scores the topic 0 while a mandatory requirement is unmet', () => {
    const brc = evalWith({
      topics: TOPICS_M, optionsByTopic: OPTS_M,
      certs: [{ certificate_type: 'GFSI', expiry_date: futureDate() }], // 10pt, but no Halal
    });
    expect(brc.mandatoryPassed).toBe(false);
    expect(topicById(brc, 't-cert').score).toBe(0);
    expect(topicById(brc, 't-cert').matchedOptions.length).toBeGreaterThan(0); // evidence still recorded
  });

  it('releases the score as soon as the gate is satisfied', () => {
    const brc = evalWith({
      topics: TOPICS_M, optionsByTopic: OPTS_M,
      certs: [
        { certificate_type: 'Halal', expiry_date: futureDate() },
        { certificate_type: 'GFSI', expiry_date: futureDate() },
      ],
    });
    expect(brc.mandatoryPassed).toBe(true);
    expect(topicById(brc, 't-cert').score).toBe(10);
  });

  it('fails the gate when the mandatory certificate has expired', () => {
    const brc = evalWith({
      topics: TOPICS_M, optionsByTopic: OPTS_M,
      certs: [{ certificate_type: 'Halal', expiry_date: pastDate() }],
    });
    expect(brc.mandatoryPassed).toBe(false);
  });

  it('reports mandatoryMet = null for topics without mandatory options', () => {
    const brc = evalWith();
    expect(topicById(brc, 't-docs').mandatoryMet).toBeNull();
    expect(brc.mandatoryPassed).toBe(true);
  });
});

// ── quotation-derived (Competition) scoring ─────────────────────────────────
describe('evaluateBrc — quotation scoring', () => {
  const ctx = (over: Partial<QuotationContext> = {}): QuotationContext => ({
    effectivePrice: 100, minPrice: 100, leadTimeDays: 10, minLeadTimeDays: 10, paymentTermDays: 30, ...over,
  });

  it('gives full price marks to the lowest bid', () => {
    const brc = evalWith({ ctx: ctx({ effectivePrice: 100, minPrice: 100 }) });
    expect(topicById(brc, 't-price').score).toBe(15);
  });

  it('gives partial marks within 10% of the lowest bid', () => {
    const brc = evalWith({ ctx: ctx({ effectivePrice: 110, minPrice: 100 }) });
    expect(topicById(brc, 't-price').score).toBe(10);
  });

  it('gives zero beyond 10% above the lowest bid', () => {
    const brc = evalWith({ ctx: ctx({ effectivePrice: 111, minPrice: 100 }) });
    expect(topicById(brc, 't-price').score).toBe(0);
  });

  it('gives zero when the price is missing', () => {
    const brc = evalWith({ ctx: ctx({ effectivePrice: 0, minPrice: 100 }) });
    expect(topicById(brc, 't-price').score).toBe(0);
  });

  it('scores delivery against the fastest bid', () => {
    const T_DEL = mkTopic({ id: 't-del', section: 'Competition', topic: 'Delivery', target_score: 15, auto_source: 'quotation', quotation_field: 'delivery', criterion_group: 'commercial' });
    const opts = {
      't-del': [
        mkOption({ id: 'd15', topic_id: 't-del', score: 15, match_type: 'auto' }),
        mkOption({ id: 'd10', topic_id: 't-del', score: 10, match_type: 'auto', sort_order: 20 }),
        mkOption({ id: 'd0', topic_id: 't-del', score: 0, match_type: 'auto', sort_order: 30 }),
      ],
    };
    const fastest = evalWith({ topics: [T_DEL], optionsByTopic: opts, ctx: ctx({ leadTimeDays: 7, minLeadTimeDays: 7 }) });
    const slower = evalWith({ topics: [T_DEL], optionsByTopic: opts, ctx: ctx({ leadTimeDays: 14, minLeadTimeDays: 7 }) });
    const missing = evalWith({ topics: [T_DEL], optionsByTopic: opts, ctx: ctx({ leadTimeDays: null, minLeadTimeDays: 7 }) });
    expect(topicById(fastest, 't-del').score).toBe(15);
    expect(topicById(slower, 't-del').score).toBe(10);
    expect(topicById(missing, 't-del').score).toBe(0);
  });

  it('scores credit term on a fixed 30-day threshold', () => {
    const T_CR = mkTopic({ id: 't-cr', section: 'Competition', topic: 'Credit term', target_score: 15, auto_source: 'quotation', quotation_field: 'credit', criterion_group: 'commercial' });
    const opts = {
      't-cr': [
        mkOption({ id: 'c15', topic_id: 't-cr', score: 15, match_type: 'auto' }),
        mkOption({ id: 'c10', topic_id: 't-cr', score: 10, match_type: 'auto', sort_order: 20 }),
        mkOption({ id: 'c0', topic_id: 't-cr', score: 0, match_type: 'auto', sort_order: 30 }),
      ],
    };
    const run = (paymentTermDays: number | null) =>
      topicById(evalWith({ topics: [T_CR], optionsByTopic: opts, ctx: ctx({ paymentTermDays }) }), 't-cr').score;
    expect(run(30)).toBe(15);
    expect(run(60)).toBe(15);
    expect(run(29)).toBe(10);
    expect(run(0)).toBe(0);
    expect(run(null)).toBe(0);
  });

  it('marks commercial topics pending when there is no quotation context', () => {
    const brc = evalWith();
    const t = topicById(brc, 't-price');
    expect(t.pending).toBe(true);
    expect(brc.pendingCount).toBe(1);
  });
});

// ── group weighting & grading ───────────────────────────────────────────────
describe('evaluateBrc — group weighting and grade', () => {
  const fullSafety = {
    certs: [{ certificate_type: 'GFSI', expiry_date: futureDate() }],
    docs: [
      { document_type: 'spec', document_name: 'x' },
      { document_type: 'coa', document_name: 'x' },
      { document_type: 'allergen', document_name: 'x' },
      { document_type: 'origin', document_name: 'x' },
    ],
  };

  it('grades on safety alone when commercial weight is 0', () => {
    const brc = evalWith({ ...fullSafety, weights: { safety: 100, commercial: 0 } });
    expect(brc.safetyScore).toBe(30);
    expect(brc.safetyMax).toBe(30);
    expect(brc.safetyPercent).toBe(100);
    expect(brc.percent).toBe(100);
    expect(brc.grade).toBe('A');
    expect(brc.commercialWeight).toBe(0);
  });

  it('maps a half-complete safety profile to the middle band', () => {
    const brc = evalWith({
      certs: [{ certificate_type: 'GFSI', expiry_date: futureDate() }], // 10
      docs: [{ document_type: 'spec', document_name: 'x' }],            // 5
      weights: { safety: 100, commercial: 0 },
    });
    // 15/30 = 50% → 0.5 × maxScore(45) = 22.5 → band C (18–26)
    expect(brc.percent).toBe(50);
    expect(brc.grade).toBe('C');
  });

  it('drops a pending group and renormalises the weights', () => {
    // Commercial is pending (no quotation ctx) so the grade comes from safety only,
    // even though commercial nominally carries 40%.
    const brc = evalWith({ ...fullSafety, weights: { safety: 60, commercial: 40 } });
    expect(brc.percent).toBe(100);
    expect(brc.grade).toBe('A');
  });

  it('blends both groups once a quotation is present', () => {
    const brc = evalWith({
      ...fullSafety,
      ctx: { effectivePrice: 111, minPrice: 100, leadTimeDays: null, minLeadTimeDays: null, paymentTermDays: null },
      weights: { safety: 50, commercial: 50 },
    });
    // safety 100%, commercial 0% → 50% weighted
    expect(brc.safetyPercent).toBe(100);
    expect(brc.commercialPercent).toBe(0);
    expect(brc.percent).toBe(50);
  });

  it('falls back to target-score proportional weights when none are configured', () => {
    const brc = evalWith({ ...fullSafety });
    expect(brc.safetyWeight).toBe(100); // commercial pending → excluded
    expect(brc.grade).toBe('A');
  });

  it('reports the lowest band when nothing is achieved', () => {
    const brc = evalWith({ weights: { safety: 100, commercial: 0 } });
    expect(brc.totalScore).toBe(0);
    expect(brc.grade).toBe('D');
    expect(brc.level).toBe('critical');
  });

  it('maps grades to risk levels', () => {
    expect(evalWith({ ...fullSafety, weights: { safety: 100, commercial: 0 } }).level).toBe('low');
  });
});

// ── topic selection ─────────────────────────────────────────────────────────
describe('evaluateBrc — topic selection', () => {
  it('ignores inactive topics', () => {
    const off = { ...T_CERT, active: false };
    const brc = evalWith({ topics: [off, T_DOCS], certs: [{ certificate_type: 'GFSI', expiry_date: futureDate() }] });
    expect(brc.topics.map(t => t.topic.id)).toEqual(['t-docs']);
  });

  it('ignores topics belonging to another supplier type', () => {
    const other = { ...T_DOCS, supplier_type: 'service' };
    const brc = evalWith({ topics: [T_CERT, other] });
    expect(brc.topics.map(t => t.topic.id)).toEqual(['t-cert']);
  });

  it('returns an empty assessment when no topics apply', () => {
    const brc = evalWith({ topics: [] });
    expect(brc.topics).toEqual([]);
    expect(brc.maxScore).toBe(0);
    expect(brc.percent).toBe(0);
    expect(brc.grade).toBeNull();
  });

  it('orders topics by sort_order', () => {
    const brc = evalWith();
    expect(brc.topics.map(t => t.topic.id)).toEqual(['t-cert', 't-docs', 't-price']);
  });
});

// ── manual evaluation ───────────────────────────────────────────────────────
describe('evaluateBrc — manual evaluation', () => {
  const T_MAN = mkTopic({ id: 't-man', topic: 'Audit', target_score: 15, auto_source: 'manual' });
  const OPTS_MAN = {
    't-man': [
      mkOption({ id: 'm15', topic_id: 't-man', label: '>90%', score: 15, match_type: 'manual' }),
      mkOption({ id: 'm10', topic_id: 't-man', label: '75-90%', score: 10, match_type: 'manual', sort_order: 20 }),
    ],
  };

  it('is pending until someone picks an option', () => {
    const brc = evalWith({ topics: [T_MAN], optionsByTopic: OPTS_MAN });
    expect(topicById(brc, 't-man').pending).toBe(true);
  });

  it('scores the picked option', () => {
    const manual = { 't-man': { supplier_id: 's1', topic_id: 't-man', option_id: 'm10', note: null } };
    const brc = evalWith({ topics: [T_MAN], optionsByTopic: OPTS_MAN, manual });
    const t = topicById(brc, 't-man');
    expect(t.pending).toBe(false);
    expect(t.score).toBe(10);
    expect(t.matchedOptions[0].via).toBe('manual');
  });

  it('stays pending when the stored pick is explicitly cleared', () => {
    const manual = { 't-man': { supplier_id: 's1', topic_id: 't-man', option_id: null, note: null } };
    const brc = evalWith({ topics: [T_MAN], optionsByTopic: OPTS_MAN, manual });
    expect(topicById(brc, 't-man').pending).toBe(true);
  });

  // A topic that merely offers a manual fallback must not be held pending once
  // evidence has matched — otherwise the supplier's uploads score nothing.
  const MIXED = mkTopic({ id: 't-mix', topic: 'Mixed', target_score: 10, scoring_mode: 'best_match' });
  const MIXED_OPTS = {
    't-mix': [
      mkOption({ id: 'x-cert', topic_id: 't-mix', label: 'GFSI', score: 10, match_keywords: ['gfsi'] }),
      mkOption({ id: 'x-man', topic_id: 't-mix', label: 'Audit >75%', score: 5, match_type: 'manual', sort_order: 20 }),
    ],
  };

  it('counts a mixed evidence+manual topic as soon as a certificate matches', () => {
    const brc = evalWith({
      topics: [MIXED], optionsByTopic: MIXED_OPTS,
      certs: [{ certificate_type: 'GFSI', expiry_date: futureDate() }],
    });
    const t = topicById(brc, 't-mix');
    expect(t.score).toBe(10);
    expect(t.pending).toBe(false);
    expect(brc.assessedMax).toBe(10); // it contributes to the grade
  });

  it('keeps a mixed topic pending while nothing has matched at all', () => {
    const brc = evalWith({ topics: [MIXED], optionsByTopic: MIXED_OPTS });
    expect(topicById(brc, 't-mix').pending).toBe(true);
    expect(brc.assessedMax).toBe(0);
  });

  it('lets a manual pick resolve a mixed topic with no evidence', () => {
    const manual = { 't-mix': { supplier_id: 's1', topic_id: 't-mix', option_id: 'x-man', note: null } };
    const brc = evalWith({ topics: [MIXED], optionsByTopic: MIXED_OPTS, manual });
    const t = topicById(brc, 't-mix');
    expect(t.pending).toBe(false);
    expect(t.score).toBe(5);
  });
});

// ── groupWeightsFor ─────────────────────────────────────────────────────────
describe('groupWeightsFor', () => {
  it('returns the configured split for a known type', () => {
    const map = { [TYPE]: { supplier_type: TYPE, safety_weight: 70, commercial_weight: 30 } };
    expect(groupWeightsFor(map, TYPE)).toEqual({ safety: 70, commercial: 30 });
  });

  it('returns undefined for an unconfigured type so the engine falls back', () => {
    expect(groupWeightsFor({}, TYPE)).toBeUndefined();
  });
});
