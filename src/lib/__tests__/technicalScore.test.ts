import { describe, it, expect } from 'vitest';
import { computeTechnicalScore } from '@/lib/technicalScore';

const c = (id: string, weight: number) => ({ id, weight });

describe('computeTechnicalScore', () => {
  describe('null results', () => {
    it('returns null for an empty criteria array', () => {
      expect(computeTechnicalScore([], {})).toBeNull();
      expect(computeTechnicalScore([], { a: true })).toBeNull();
    });

    it('returns null when total weight is exactly 0', () => {
      expect(computeTechnicalScore([c('a', 0), c('b', 0)], { a: true, b: true })).toBeNull();
    });

    it('returns null when total weight is negative', () => {
      expect(computeTechnicalScore([c('a', -5)], { a: true })).toBeNull();
      expect(computeTechnicalScore([c('a', -5), c('b', 3)], { a: true })).toBeNull();
    });

    it('returns null when weights are null/undefined (coerced to 0)', () => {
      const criteria = [
        { id: 'a', weight: null as unknown as number },
        { id: 'b', weight: undefined as unknown as number },
      ];
      expect(computeTechnicalScore(criteria, { a: true })).toBeNull();
    });
  });

  describe('basic scoring', () => {
    it('returns 0 when nothing is met', () => {
      expect(computeTechnicalScore([c('a', 1), c('b', 1)], {})).toBe(0);
    });

    it('returns 100 when everything is met', () => {
      expect(computeTechnicalScore([c('a', 1), c('b', 3)], { a: true, b: true })).toBe(100);
    });

    it('computes an equal-weight partial score', () => {
      expect(computeTechnicalScore([c('a', 1), c('b', 1)], { a: true })).toBe(50);
      expect(
        computeTechnicalScore([c('a', 1), c('b', 1), c('c', 1), c('d', 1)], { a: true, b: true, c: true }),
      ).toBe(75);
    });

    it('respects differing weights', () => {
      // met 30 of 30+70
      expect(computeTechnicalScore([c('a', 30), c('b', 70)], { a: true })).toBe(30);
      expect(computeTechnicalScore([c('a', 30), c('b', 70)], { b: true })).toBe(70);
    });

    it('rounds to the nearest integer (half up)', () => {
      // 1/3 -> 33.33 -> 33
      expect(computeTechnicalScore([c('a', 1), c('b', 1), c('c', 1)], { a: true })).toBe(33);
      // 2/3 -> 66.67 -> 67
      expect(computeTechnicalScore([c('a', 1), c('b', 1), c('c', 1)], { a: true, b: true })).toBe(67);
      // 1/8 -> 12.5 -> 13 (Math.round is half-up)
      const eight = Array.from({ length: 8 }, (_, i) => c(`k${i}`, 1));
      expect(computeTechnicalScore(eight, { k0: true })).toBe(13);
    });

    it('handles a single criterion', () => {
      expect(computeTechnicalScore([c('only', 5)], { only: true })).toBe(100);
      expect(computeTechnicalScore([c('only', 5)], { only: false })).toBe(0);
      expect(computeTechnicalScore([c('only', 5)], {})).toBe(0);
    });

    it('handles fractional weights', () => {
      expect(computeTechnicalScore([c('a', 0.5), c('b', 1.5)], { a: true })).toBe(25);
    });
  });

  describe('met map behaviour', () => {
    it('ignores met entries for criteria that do not exist', () => {
      expect(computeTechnicalScore([c('a', 1)], { ghost: true })).toBe(0);
      expect(computeTechnicalScore([c('a', 1)], { a: true, ghost: true })).toBe(100);
    });

    it('treats explicit false and missing keys identically', () => {
      const criteria = [c('a', 1), c('b', 1)];
      expect(computeTechnicalScore(criteria, { a: true, b: false })).toBe(
        computeTechnicalScore(criteria, { a: true }),
      );
    });

    it('treats falsy non-boolean values as not met', () => {
      const met = { a: 0, b: '' } as unknown as Record<string, boolean>;
      expect(computeTechnicalScore([c('a', 1), c('b', 1)], met)).toBe(0);
    });

    it('a met criterion with weight 0 contributes nothing', () => {
      expect(computeTechnicalScore([c('a', 0), c('b', 10)], { a: true })).toBe(0);
      expect(computeTechnicalScore([c('a', 0), c('b', 10)], { a: true, b: true })).toBe(100);
    });
  });

  describe('mixed-sign weights (suspected bug territory)', () => {
    it('a met negative-weight criterion can produce a negative score', () => {
      // total = 10 (positive so not rejected), metWeight = -10 -> -100
      expect(computeTechnicalScore([c('a', -10), c('b', 20)], { a: true })).toBe(-100);
    });

    it('an unmet negative-weight criterion inflates the score above 100', () => {
      // total = 10, metWeight = 20 -> 200
      expect(computeTechnicalScore([c('a', -10), c('b', 20)], { b: true })).toBe(200);
    });
  });

  describe('input safety', () => {
    it('does not mutate its inputs', () => {
      const criteria = [c('a', 1), c('b', 2)];
      const met = { a: true };
      const snapshot = JSON.stringify({ criteria, met });
      computeTechnicalScore(criteria, met);
      expect(JSON.stringify({ criteria, met })).toBe(snapshot);
    });

    it('handles a large criteria list', () => {
      const many = Array.from({ length: 100 }, (_, i) => c(`c${i}`, 1));
      const met: Record<string, boolean> = {};
      for (let i = 0; i < 40; i++) met[`c${i}`] = true;
      expect(computeTechnicalScore(many, met)).toBe(40);
    });
  });
});
