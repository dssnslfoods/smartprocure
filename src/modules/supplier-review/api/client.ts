import { supabase } from '@/integrations/supabase/client';
import type {
  SupplierReview, ReviewCriteria, ReviewScore, KnockoutRule,
  ReviewKnockout, ReviewAction, ReviewAttachment, SupplierReviewStatus,
  GradeThreshold, ReviewFrequencyConfig, KpiSnapshot, StatusHistory,
  SprNotification, SupplierForReview,
} from '../types';

const SPR = 'spr';

function rpc<T>(fn: string, args?: Record<string, unknown>) {
  return supabase.rpc(fn, args as Record<string, unknown>) as unknown as Promise<{ data: T; error: unknown }>;
}

function from<T>(table: string) {
  try {
    return supabase.schema(SPR).from(table) as unknown as ReturnType<typeof supabase.from> & { data: T[] };
  } catch {
    return supabase.from(table) as unknown as ReturnType<typeof supabase.from> & { data: T[] };
  }
}

// ─── Suppliers (read from public.suppliers directly) ──────────

export async function fetchSuppliers(tenantId?: string): Promise<SupplierForReview[]> {
  let q = supabase
    .from('suppliers')
    .select('id, company_name, supplier_code, status, risk_level, brc_grade, brc_percent, brc_supplier_type, category, tenant_id')
    .order('company_name');
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q;
  if (error) return [];
  return (data as unknown as SupplierForReview[]) ?? [];
}

// ─── Reviews ───────────────────────────────────────────────────

export async function fetchReviews(filters?: {
  tenant_id?: string; status?: string; supplier_id?: string; review_year?: number; limit?: number;
}): Promise<SupplierReview[]> {
  let q = from<SupplierReview>('supplier_review').select('*').order('created_at', { ascending: false });
  if (filters?.tenant_id) q = q.eq('tenant_id', filters.tenant_id);
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.supplier_id) q = q.eq('supplier_id', filters.supplier_id);
  if (filters?.review_year) q = q.eq('review_year', filters.review_year);
  q = q.limit(filters?.limit ?? 200);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as SupplierReview[]) ?? [];
}

export async function fetchReview(id: string): Promise<SupplierReview | null> {
  const { data, error } = await from<SupplierReview>('supplier_review').select('*').eq('id', id).single();
  if (error) return null;
  return data as unknown as SupplierReview;
}

export async function createReview(review: Partial<SupplierReview>): Promise<SupplierReview> {
  const { data, error } = await from<SupplierReview>('supplier_review').insert(review as Record<string, unknown>).select().single();
  if (error) throw error;
  return data as unknown as SupplierReview;
}

export async function updateReview(id: string, updates: Partial<SupplierReview>): Promise<SupplierReview> {
  const { data, error } = await from<SupplierReview>('supplier_review')
    .update({ ...updates, updated_at: new Date().toISOString() } as Record<string, unknown>)
    .eq('id', id).select().single();
  if (error) throw error;
  return data as unknown as SupplierReview;
}

// ─── Scores ────────────────────────────────────────────────────

export async function fetchScores(reviewId: string): Promise<ReviewScore[]> {
  const { data, error } = await from<ReviewScore>('supplier_review_score').select('*').eq('review_id', reviewId);
  if (error) throw error;
  return (data as unknown as ReviewScore[]) ?? [];
}

export async function upsertScore(score: Partial<ReviewScore>): Promise<ReviewScore> {
  const { data, error } = await from<ReviewScore>('supplier_review_score')
    .upsert(score as Record<string, unknown>, { onConflict: 'review_id,criterion_id' }).select().single();
  if (error) throw error;
  return data as unknown as ReviewScore;
}

export async function upsertScores(scores: Partial<ReviewScore>[]): Promise<void> {
  const { error } = await from<ReviewScore>('supplier_review_score')
    .upsert(scores as Record<string, unknown>[], { onConflict: 'review_id,criterion_id' });
  if (error) throw error;
}

// ─── Criteria ──────────────────────────────────────────────────

export async function fetchCriteria(category?: string): Promise<ReviewCriteria[]> {
  let q = from<ReviewCriteria>('review_criteria').select('*').eq('active', true).order('sort_order');
  if (category) q = q.eq('supplier_category', category);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as ReviewCriteria[]) ?? [];
}

export async function saveCriterion(criterion: Partial<ReviewCriteria>): Promise<ReviewCriteria> {
  if (criterion.id) {
    const { data, error } = await from<ReviewCriteria>('review_criteria')
      .update(criterion as Record<string, unknown>).eq('id', criterion.id).select().single();
    if (error) throw error;
    return data as unknown as ReviewCriteria;
  }
  const { data, error } = await from<ReviewCriteria>('review_criteria')
    .insert(criterion as Record<string, unknown>).select().single();
  if (error) throw error;
  return data as unknown as ReviewCriteria;
}

// ─── Knockouts ─────────────────────────────────────────────────

export async function fetchKnockoutRules(): Promise<KnockoutRule[]> {
  const { data, error } = await from<KnockoutRule>('knockout_rule').select('*').eq('active', true).order('sort_order');
  if (error) throw error;
  return (data as unknown as KnockoutRule[]) ?? [];
}

export async function fetchReviewKnockouts(reviewId: string): Promise<ReviewKnockout[]> {
  const { data, error } = await from<ReviewKnockout>('supplier_review_knockout').select('*').eq('review_id', reviewId);
  if (error) throw error;
  return (data as unknown as ReviewKnockout[]) ?? [];
}

// ─── Actions ───────────────────────────────────────────────────

export async function fetchActions(reviewId: string): Promise<ReviewAction[]> {
  const { data, error } = await from<ReviewAction>('supplier_review_action').select('*').eq('review_id', reviewId).order('created_at');
  if (error) throw error;
  return (data as unknown as ReviewAction[]) ?? [];
}

export async function createAction(action: Partial<ReviewAction>): Promise<ReviewAction> {
  const { data, error } = await from<ReviewAction>('supplier_review_action')
    .insert(action as Record<string, unknown>).select().single();
  if (error) throw error;
  return data as unknown as ReviewAction;
}

export async function updateAction(id: string, updates: Partial<ReviewAction>): Promise<void> {
  const { error } = await from<ReviewAction>('supplier_review_action')
    .update(updates as Record<string, unknown>).eq('id', id);
  if (error) throw error;
}

// ─── Attachments ───────────────────────────────────────────────

export async function fetchAttachments(reviewId: string): Promise<ReviewAttachment[]> {
  const { data, error } = await from<ReviewAttachment>('supplier_review_attachment').select('*').eq('review_id', reviewId);
  if (error) throw error;
  return (data as unknown as ReviewAttachment[]) ?? [];
}

export async function createAttachment(att: Partial<ReviewAttachment>): Promise<ReviewAttachment> {
  const { data, error } = await from<ReviewAttachment>('supplier_review_attachment')
    .insert(att as Record<string, unknown>).select().single();
  if (error) throw error;
  return data as unknown as ReviewAttachment;
}

export async function uploadReviewFile(reviewId: string, file: File): Promise<string> {
  const path = `${reviewId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage.from('supplier-review').upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from('supplier-review').getPublicUrl(path);
  return data.publicUrl;
}

// ─── KPI Snapshot ──────────────────────────────────────────────

export async function fetchKpiSnapshot(reviewId: string): Promise<KpiSnapshot | null> {
  const { data, error } = await from<KpiSnapshot>('supplier_review_kpi_snapshot').select('*').eq('review_id', reviewId).single();
  if (error) return null;
  return data as unknown as KpiSnapshot;
}

export async function upsertKpiSnapshot(reviewId: string, kpiData: Record<string, unknown>): Promise<void> {
  const { error } = await from<KpiSnapshot>('supplier_review_kpi_snapshot')
    .upsert({ review_id: reviewId, data: kpiData, collected_at: new Date().toISOString() } as Record<string, unknown>,
      { onConflict: 'review_id' });
  if (error) throw error;
}

export async function collectKpis(reviewId: string): Promise<Record<string, unknown>> {
  const { data, error } = await rpc<Record<string, unknown>>('spr.fn_collect_review_kpis', { p_review_id: reviewId });
  if (error) throw error;
  return data ?? {};
}

// ─── Scoring (SQL functions) ───────────────────────────────────

export async function calcReviewScore(reviewId: string): Promise<Record<string, unknown>> {
  const { data, error } = await rpc<Record<string, unknown>>('spr.fn_calc_review_score', { p_review_id: reviewId });
  if (error) throw error;
  return data ?? {};
}

export async function evaluateKnockouts(reviewId: string): Promise<Record<string, unknown>> {
  const { data, error } = await rpc<Record<string, unknown>>('spr.fn_evaluate_knockouts', { p_review_id: reviewId });
  if (error) throw error;
  return data ?? {};
}

export async function approveReview(reviewId: string, approverId: string): Promise<Record<string, unknown>> {
  const { data, error } = await rpc<Record<string, unknown>>('spr.fn_approve_review', { p_review_id: reviewId, p_approver_id: approverId });
  if (error) throw error;
  return data ?? {};
}

export async function createRevision(reviewId: string, reason: string, userId: string): Promise<string> {
  const { data, error } = await rpc<string>('spr.fn_create_revision', { p_review_id: reviewId, p_reason: reason, p_user_id: userId });
  if (error) throw error;
  return data ?? '';
}

// ─── Config ────────────────────────────────────────────────────

export async function fetchFrequencyConfig(): Promise<ReviewFrequencyConfig[]> {
  const { data, error } = await from<ReviewFrequencyConfig>('review_frequency_config').select('*').order('risk_level');
  if (error) throw error;
  return (data as unknown as ReviewFrequencyConfig[]) ?? [];
}

export async function updateFrequencyConfig(id: string, updates: Partial<ReviewFrequencyConfig>): Promise<void> {
  const { error } = await from<ReviewFrequencyConfig>('review_frequency_config')
    .update(updates as Record<string, unknown>).eq('id', id);
  if (error) throw error;
}

export async function fetchGradeThresholds(): Promise<GradeThreshold[]> {
  const { data, error } = await from<GradeThreshold>('grade_threshold').select('*').order('sort_order');
  if (error) throw error;
  return (data as unknown as GradeThreshold[]) ?? [];
}

export async function updateGradeThreshold(id: string, updates: Partial<GradeThreshold>): Promise<void> {
  const { error } = await from<GradeThreshold>('grade_threshold')
    .update(updates as Record<string, unknown>).eq('id', id);
  if (error) throw error;
}

// ─── Review Status (module ASL) ────────────────────────────────

export async function fetchReviewStatuses(tenantId?: string): Promise<SupplierReviewStatus[]> {
  let q = from<SupplierReviewStatus>('supplier_review_status').select('*');
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as SupplierReviewStatus[]) ?? [];
}

// ─── Status History ────────────────────────────────────────────

export async function fetchStatusHistory(supplierId: string): Promise<StatusHistory[]> {
  const { data, error } = await from<StatusHistory>('supplier_status_history')
    .select('*').eq('supplier_id', supplierId).order('changed_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as StatusHistory[]) ?? [];
}

// ─── Notifications ─────────────────────────────────────────────

export async function fetchSprNotifications(limit = 20): Promise<SprNotification[]> {
  const { data, error } = await from<SprNotification>('notifications')
    .select('*').eq('is_read', false).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data as unknown as SprNotification[]) ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await from<SprNotification>('notifications').update({ is_read: true } as Record<string, unknown>).eq('id', id);
  if (error) throw error;
}

// ─── Safety weight check ──────────────────────────────────────

export async function checkSafetyWeight(category: string): Promise<{ valid: boolean; safety_pct: number; message?: string }> {
  const { data, error } = await rpc<{ valid: boolean; safety_pct: number; message?: string }>('spr.fn_check_safety_weight', { p_category: category });
  if (error) throw error;
  return data ?? { valid: true, safety_pct: 0 };
}

export async function checkBsaqCoverage(category: string): Promise<{ valid: boolean; missing_tags?: string[]; message?: string }> {
  const { data, error } = await rpc<{ valid: boolean; missing_tags?: string[]; message?: string }>('spr.fn_check_bsaq_coverage', { p_category: category });
  if (error) throw error;
  return data ?? { valid: true };
}
