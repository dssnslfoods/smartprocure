import { describe, it, expect } from 'vitest';
import { scoreQuotations, type QuotationInput, type SupplierInput } from '@/lib/scoring';
import type { ScoringWeights } from '@/types/procurement';

function mkQuote(over: Partial<QuotationInput> & { id: string; supplier_id: string }): QuotationInput {
  return {
    price: 100,
    total_amount: null,
    discount: 0,
    lead_time_days: 10,
    payment_term: 'Net 30',
    payment_terms: null,
    credit_term_days: null,
    spec_compliance_score: 0,
    ...over,
  };
}

const LOW: Record<string, SupplierInput> = { s1: { id: 's1', risk_level: 'low' } };
const W: ScoringWeights = { commercial: 60, technical: 25, risk: 15 };

const byId = (rows: ReturnType<typeof scoreQuotations>, id: string) => rows.find(r => r.quotation_id === id)!;

describe('scoreQuotations — basics', () => {
  it('returns an empty array for no quotations', () => {
    expect(scoreQuotations([], {}, W)).toEqual([]);
  });

  it('applies the discount to reach the effective price', () => {
    const rows = scoreQuotations([mkQuote({ id: 'q1', supplier_id: 's1', price: 100, discount: 25 })], LOW, W);
    expect(byId(rows, 'q1').effective_price).toBe(75);
  });

  it('falls back to total_amount when price is null', () => {
    const rows = scoreQuotations([mkQuote({ id: 'q1', supplier_id: 's1', price: null, total_amount: 200 })], LOW, W);
    expect(byId(rows, 'q1').effective_price).toBe(200);
  });

  it('never lets the effective price go negative', () => {
    const rows = scoreQuotations([mkQuote({ id: 'q1', supplier_id: 's1', price: 50, discount: 80 })], LOW, W);
    expect(byId(rows, 'q1').effective_price).toBe(0);
  });
});

describe('scoreQuotations — commercial pillar', () => {
  const suppliers: Record<string, SupplierInput> = {
    s1: { id: 's1', risk_level: 'low' },
    s2: { id: 's2', risk_level: 'low' },
  };

  it('gives the cheapest bid a full price score and scales the rest', () => {
    const rows = scoreQuotations([
      mkQuote({ id: 'q1', supplier_id: 's1', price: 100 }),
      mkQuote({ id: 'q2', supplier_id: 's2', price: 200 }),
    ], suppliers, W);
    expect(byId(rows, 'q1').price_score).toBe(100);
    expect(byId(rows, 'q2').price_score).toBe(50); // 100/200
  });

  it('gives a zero price score when the price is missing', () => {
    const rows = scoreQuotations([
      mkQuote({ id: 'q1', supplier_id: 's1', price: 0, total_amount: null }),
      mkQuote({ id: 'q2', supplier_id: 's2', price: 100 }),
    ], suppliers, W);
    expect(byId(rows, 'q1').price_score).toBe(0);
  });

  it('gives the fastest bid a full lead-time score and scales the rest', () => {
    const rows = scoreQuotations([
      mkQuote({ id: 'q1', supplier_id: 's1', lead_time_days: 5 }),
      mkQuote({ id: 'q2', supplier_id: 's2', lead_time_days: 10 }),
    ], suppliers, W);
    expect(byId(rows, 'q1').lead_time_score).toBe(100);
    expect(byId(rows, 'q2').lead_time_score).toBe(50);
  });

  it('gives a zero lead-time score when lead time is missing', () => {
    const rows = scoreQuotations([mkQuote({ id: 'q1', supplier_id: 's1', lead_time_days: null })], LOW, W);
    expect(byId(rows, 'q1').lead_time_score).toBe(0);
  });

  // Delivery and credit term are scored by the BRCGS Competition criteria and
  // reach the Final Score through the Risk pillar, so the Commercial pillar
  // carries price alone — counting them here too would double-weight them.
  it('scores the commercial pillar on price alone', () => {
    const rows = scoreQuotations([mkQuote({
      id: 'q1', supplier_id: 's1', price: 100, lead_time_days: 10, payment_term: 'Net 30',
    })], LOW, W);
    const r = byId(rows, 'q1');
    expect(r.commercial_score).toBe(r.price_score);
    expect(r.commercial_score).toBe(100);
  });

  it('does not let lead time or credit term move the commercial score', () => {
    const suppliers: Record<string, SupplierInput> = {
      s1: { id: 's1', risk_level: 'low' },
      s2: { id: 's2', risk_level: 'low' },
    };
    const rows = scoreQuotations([
      mkQuote({ id: 'fast', supplier_id: 's1', price: 100, lead_time_days: 1, credit_term_days: 90 }),
      mkQuote({ id: 'slow', supplier_id: 's2', price: 100, lead_time_days: 60, credit_term_days: 0 }),
    ], suppliers, W);
    expect(byId(rows, 'fast').commercial_score).toBe(byId(rows, 'slow').commercial_score);
    // ...but both are still reported for display
    expect(byId(rows, 'fast').lead_time_score).toBeGreaterThan(byId(rows, 'slow').lead_time_score);
    expect(byId(rows, 'fast').payment_term_score).toBeGreaterThan(byId(rows, 'slow').payment_term_score);
  });
});

describe('scoreQuotations — credit term', () => {
  it('prefers the explicit credit_term_days over the free-text term', () => {
    // "2/10 Net 30" parses to 2 days by regex; the explicit field must win.
    const withField = scoreQuotations([mkQuote({
      id: 'q1', supplier_id: 's1', payment_term: '2/10 Net 30', credit_term_days: 30,
    })], LOW, W);
    const withoutField = scoreQuotations([mkQuote({
      id: 'q1', supplier_id: 's1', payment_term: '2/10 Net 30', credit_term_days: null,
    })], LOW, W);
    expect(byId(withField, 'q1').payment_term_score).toBe(80);   // 30 days
    expect(byId(withoutField, 'q1').payment_term_score).toBe(40); // mis-parsed as 2 days
  });

  it('treats an explicit 0 as a real value, not as missing', () => {
    const rows = scoreQuotations([mkQuote({
      id: 'q1', supplier_id: 's1', payment_term: 'COD', credit_term_days: 0,
    })], LOW, W);
    expect(byId(rows, 'q1').payment_term_score).toBe(0); // no credit — worst
  });

  it('defaults to 30 days when no term is given at all', () => {
    const rows = scoreQuotations([mkQuote({
      id: 'q1', supplier_id: 's1', payment_term: null, payment_terms: null, credit_term_days: null,
    })], LOW, W);
    expect(byId(rows, 'q1').payment_term_score).toBe(80); // same as "Net 30"
  });

  // Longer credit is better for the buyer, matching the BRCGS credit criterion
  // (">= 30 days" = 15, "< 30 days" = 10, "no credit" = 0).
  it('scores longer credit terms higher', () => {
    const run = (credit_term_days: number) =>
      byId(scoreQuotations([mkQuote({ id: 'q1', supplier_id: 's1', credit_term_days })], LOW, W), 'q1').payment_term_score;
    expect(run(0)).toBe(0);      // COD — no credit at all
    expect(run(7)).toBe(40);
    expect(run(14)).toBe(40);
    expect(run(15)).toBe(60);
    expect(run(29)).toBe(60);
    expect(run(30)).toBe(80);    // meets the BRCGS benchmark
    expect(run(45)).toBe(80);
    expect(run(60)).toBe(90);
    expect(run(90)).toBe(100);
    expect(run(180)).toBe(100);  // most generous credit scores best
  });

  it('is monotonic — more credit never scores worse', () => {
    const run = (credit_term_days: number) =>
      byId(scoreQuotations([mkQuote({ id: 'q1', supplier_id: 's1', credit_term_days })], LOW, W), 'q1').payment_term_score;
    const days = [0, 7, 14, 15, 29, 30, 45, 59, 60, 89, 90, 120, 365];
    const scores = days.map(run);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });
});

describe('scoreQuotations — risk pillar', () => {
  it('derives the risk score from the supplier risk level', () => {
    const suppliers: Record<string, SupplierInput> = {
      a: { id: 'a', risk_level: 'low' },
      b: { id: 'b', risk_level: 'medium' },
      c: { id: 'c', risk_level: 'high' },
      d: { id: 'd', risk_level: 'critical' },
    };
    const rows = scoreQuotations(
      ['a', 'b', 'c', 'd'].map(s => mkQuote({ id: `q-${s}`, supplier_id: s })),
      suppliers, W,
    );
    expect(byId(rows, 'q-a').risk_score).toBe(100);
    expect(byId(rows, 'q-b').risk_score).toBe(75);
    expect(byId(rows, 'q-c').risk_score).toBe(50);
    expect(byId(rows, 'q-d').risk_score).toBe(0);
  });

  it('lets the BRC override replace the risk-level score', () => {
    const rows = scoreQuotations([mkQuote({ id: 'q1', supplier_id: 's1' })], LOW, W, { s1: 42 });
    expect(byId(rows, 'q1').risk_score).toBe(42);
  });

  it('honours an override of 0 rather than falling back', () => {
    const rows = scoreQuotations([mkQuote({ id: 'q1', supplier_id: 's1' })], LOW, W, { s1: 0 });
    expect(byId(rows, 'q1').risk_score).toBe(0);
  });

  it('treats an unknown supplier as low risk', () => {
    const rows = scoreQuotations([mkQuote({ id: 'q1', supplier_id: 'ghost' })], {}, W);
    expect(byId(rows, 'q1').risk_score).toBe(100);
  });
});

describe('scoreQuotations — final score, ranking and warnings', () => {
  it('combines the three pillars by their weights', () => {
    const rows = scoreQuotations([mkQuote({
      id: 'q1', supplier_id: 's1', spec_compliance_score: 80,
    })], LOW, W);
    const r = byId(rows, 'q1');
    expect(r.final_score).toBe(Math.round((r.commercial_score * 60 + r.technical_score * 25 + r.risk_score * 15) / 100));
  });

  it('respects custom weights', () => {
    const riskOnly: ScoringWeights = { commercial: 0, technical: 0, risk: 100 };
    const rows = scoreQuotations([mkQuote({ id: 'q1', supplier_id: 's1' })], LOW, riskOnly);
    expect(byId(rows, 'q1').final_score).toBe(100);
  });

  it('treats a missing spec score as zero technical', () => {
    const rows = scoreQuotations([mkQuote({ id: 'q1', supplier_id: 's1', spec_compliance_score: null })], LOW, W);
    expect(byId(rows, 'q1').technical_score).toBe(0);
  });

  it('ranks by final score, best first', () => {
    const suppliers: Record<string, SupplierInput> = {
      s1: { id: 's1', risk_level: 'low' },
      s2: { id: 's2', risk_level: 'low' },
    };
    const rows = scoreQuotations([
      mkQuote({ id: 'q-weak', supplier_id: 's1', price: 500, spec_compliance_score: 10 }),
      mkQuote({ id: 'q-strong', supplier_id: 's2', price: 100, spec_compliance_score: 95 }),
    ], suppliers, W);
    expect(rows[0].quotation_id).toBe('q-strong');
    expect(rows.map(r => r.rank)).toEqual([1, 2]);
  });

  it('warns when the cheapest bid comes from a high-risk supplier', () => {
    const suppliers: Record<string, SupplierInput> = {
      s1: { id: 's1', risk_level: 'high' },
      s2: { id: 's2', risk_level: 'low' },
    };
    const rows = scoreQuotations([
      mkQuote({ id: 'q1', supplier_id: 's1', price: 100 }),
      mkQuote({ id: 'q2', supplier_id: 's2', price: 200 }),
    ], suppliers, W);
    expect(byId(rows, 'q1').warnings).toContain('Lowest price supplier is not recommended due to supplier risk.');
    expect(byId(rows, 'q2').warnings).toEqual([]);
  });

  it('always warns about high and critical risk suppliers', () => {
    const suppliers: Record<string, SupplierInput> = {
      hi: { id: 'hi', risk_level: 'high' },
      cr: { id: 'cr', risk_level: 'critical' },
    };
    const rows = scoreQuotations([
      mkQuote({ id: 'q-hi', supplier_id: 'hi', price: 300 }),
      mkQuote({ id: 'q-cr', supplier_id: 'cr', price: 400 }),
    ], suppliers, W);
    expect(byId(rows, 'q-hi').warnings).toContain('High risk supplier requires QA approval before award.');
    expect(byId(rows, 'q-cr').warnings).toContain('Critical risk supplier cannot be awarded.');
  });

  it('produces no warnings for a low-risk field', () => {
    const rows = scoreQuotations([mkQuote({ id: 'q1', supplier_id: 's1' })], LOW, W);
    expect(byId(rows, 'q1').warnings).toEqual([]);
  });
});
