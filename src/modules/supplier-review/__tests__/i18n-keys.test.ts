import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

function getNestedValue(obj: Record<string, unknown>, keyPath: string): unknown {
  const keys = keyPath.split('.');
  let val: unknown = obj;
  for (const k of keys) {
    if (val == null || typeof val !== 'object') return undefined;
    val = (val as Record<string, unknown>)[k];
  }
  return val;
}

describe('SPR i18n key coverage', () => {
  const moduleDir = path.resolve(__dirname, '..');
  const keysRaw = execSync(
    `grep -roh "t('spr\\.[^']*')" "${moduleDir}" | sort -u | sed "s/t('//;s/')//"`,
    { encoding: 'utf-8' }
  ).trim();
  const usedKeys = keysRaw.split('\n').filter(Boolean);

  it('should have > 0 keys', () => {
    expect(usedKeys.length).toBeGreaterThan(0);
  });

  it('every spr.* key used in the module has a TH translation', async () => {
    const thModule = await import('../../../i18n/th');
    const th = thModule.default ?? thModule;
    const missing: string[] = [];
    for (const key of usedKeys) {
      const val = getNestedValue(th as Record<string, unknown>, key);
      if (typeof val !== 'string') missing.push(key);
    }
    expect(missing, `Missing TH keys:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every spr.* key used in the module has an EN translation', async () => {
    const enModule = await import('../../../i18n/en');
    const en = enModule.default ?? enModule;
    const missing: string[] = [];
    for (const key of usedKeys) {
      const val = getNestedValue(en as Record<string, unknown>, key);
      if (typeof val !== 'string') missing.push(key);
    }
    expect(missing, `Missing EN keys:\n${missing.join('\n')}`).toEqual([]);
  });
});
