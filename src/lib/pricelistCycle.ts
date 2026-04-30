// Pricelist update cycle helpers — cycle is configured by admin in system_settings.
import { supabase } from '@/integrations/supabase/client';

export interface PricelistCycleSettings {
  update_cycle_days: number;          // every N days suppliers must resubmit
  hold_until_days?:  number;          // optional: price must hold for at least N days
}

export const DEFAULT_CYCLE: PricelistCycleSettings = {
  update_cycle_days: 90,
  hold_until_days:   90,
};

const KEY = 'pricelist_cycle';

export async function loadPricelistCycle(): Promise<PricelistCycleSettings> {
  const { data } = await supabase.from('system_settings').select('value').eq('key', KEY).maybeSingle();
  return { ...DEFAULT_CYCLE, ...(((data?.value as Record<string, any>) || {})) };
}

export async function savePricelistCycle(cfg: PricelistCycleSettings): Promise<{ error?: string }> {
  const { error } = await supabase.from('system_settings').upsert(
    { key: KEY, value: cfg as any, updated_at: new Date().toISOString() } as any,
    { onConflict: 'key' },
  );
  return { error: error?.message };
}

export type CycleStatus = 'never' | 'fresh' | 'due_soon' | 'overdue';

export interface CycleAssessment {
  status:       CycleStatus;
  lastAt:       Date | null;
  nextDueAt:    Date | null;
  daysSince:    number | null;   // days since last submission
  daysRemaining:number | null;   // days until next required update (negative when overdue)
}

export function assessCycle(lastSubmissionISO: string | null, cycleDays: number): CycleAssessment {
  if (!lastSubmissionISO) {
    return { status: 'never', lastAt: null, nextDueAt: null, daysSince: null, daysRemaining: null };
  }
  const last = new Date(lastSubmissionISO);
  const now  = new Date();
  const ms   = 24 * 3600 * 1000;
  const daysSince = Math.floor((now.getTime() - last.getTime()) / ms);
  const next      = new Date(last.getTime() + cycleDays * ms);
  const daysRemaining = Math.ceil((next.getTime() - now.getTime()) / ms);

  let status: CycleStatus;
  if (daysRemaining < 0) status = 'overdue';
  else if (daysRemaining <= 7) status = 'due_soon';
  else status = 'fresh';

  return { status, lastAt: last, nextDueAt: next, daysSince, daysRemaining };
}

export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  never:    'ยังไม่ส่ง',
  fresh:    'ส่งแล้ว',
  due_soon: 'ใกล้ครบรอบ',
  overdue:  'เกินรอบ',
};

export const CYCLE_STATUS_CLASS: Record<CycleStatus, string> = {
  never:    'bg-zinc-100 text-zinc-600 border-zinc-300',
  fresh:    'bg-emerald-100 text-emerald-700 border-emerald-300',
  due_soon: 'bg-amber-100 text-amber-700 border-amber-300',
  overdue:  'bg-red-100 text-red-700 border-red-300',
};
