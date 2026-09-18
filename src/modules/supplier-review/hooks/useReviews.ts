import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '../api/client';
import type { SupplierReview, ReviewScore, ReviewAction, ReviewAttachment, KpiSnapshot } from '../types';

const KEYS = {
  reviews: (filters?: Record<string, unknown>) => ['spr', 'reviews', filters] as const,
  review: (id: string) => ['spr', 'review', id] as const,
  scores: (reviewId: string) => ['spr', 'scores', reviewId] as const,
  knockouts: (reviewId: string) => ['spr', 'knockouts', reviewId] as const,
  actions: (reviewId: string) => ['spr', 'actions', reviewId] as const,
  attachments: (reviewId: string) => ['spr', 'attachments', reviewId] as const,
  kpiSnapshot: (reviewId: string) => ['spr', 'kpi', reviewId] as const,
  criteria: (category?: string) => ['spr', 'criteria', category] as const,
  knockoutRules: () => ['spr', 'knockoutRules'] as const,
  suppliers: (tenantId?: string) => ['spr', 'suppliers', tenantId] as const,
  statuses: (tenantId?: string) => ['spr', 'statuses', tenantId] as const,
  history: (supplierId: string) => ['spr', 'history', supplierId] as const,
  frequencyConfig: () => ['spr', 'frequencyConfig'] as const,
  gradeThresholds: () => ['spr', 'gradeThresholds'] as const,
  notifications: () => ['spr', 'notifications'] as const,
};

export function useReviews(filters?: { status?: string; supplier_id?: string; review_year?: number; limit?: number }) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: KEYS.reviews({ ...filters, tenant_id: tenantId }),
    queryFn: () => api.fetchReviews({ ...filters, tenant_id: tenantId ?? undefined }),
    staleTime: 30_000,
  });
}

export function useReview(id: string) {
  return useQuery({
    queryKey: KEYS.review(id),
    queryFn: () => api.fetchReview(id),
    enabled: !!id,
  });
}

export function useScores(reviewId: string) {
  return useQuery({
    queryKey: KEYS.scores(reviewId),
    queryFn: () => api.fetchScores(reviewId),
    enabled: !!reviewId,
  });
}

export function useReviewKnockouts(reviewId: string) {
  return useQuery({
    queryKey: KEYS.knockouts(reviewId),
    queryFn: () => api.fetchReviewKnockouts(reviewId),
    enabled: !!reviewId,
  });
}

export function useActions(reviewId: string) {
  return useQuery({
    queryKey: KEYS.actions(reviewId),
    queryFn: () => api.fetchActions(reviewId),
    enabled: !!reviewId,
  });
}

export function useAttachments(reviewId: string) {
  return useQuery({
    queryKey: KEYS.attachments(reviewId),
    queryFn: () => api.fetchAttachments(reviewId),
    enabled: !!reviewId,
  });
}

export function useKpiSnapshot(reviewId: string) {
  return useQuery({
    queryKey: KEYS.kpiSnapshot(reviewId),
    queryFn: () => api.fetchKpiSnapshot(reviewId),
    enabled: !!reviewId,
  });
}

export function useCriteria(category?: string) {
  return useQuery({
    queryKey: KEYS.criteria(category),
    queryFn: () => api.fetchCriteria(category),
    staleTime: 60_000,
  });
}

export function useKnockoutRules() {
  return useQuery({
    queryKey: KEYS.knockoutRules(),
    queryFn: () => api.fetchKnockoutRules(),
    staleTime: 60_000,
  });
}

export function useSuppliers() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: KEYS.suppliers(tenantId ?? undefined),
    queryFn: () => api.fetchSuppliers(tenantId ?? undefined),
    staleTime: 60_000,
  });
}

export function useReviewStatuses() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: KEYS.statuses(tenantId ?? undefined),
    queryFn: () => api.fetchReviewStatuses(tenantId ?? undefined),
    staleTime: 30_000,
  });
}

export function useStatusHistory(supplierId: string) {
  return useQuery({
    queryKey: KEYS.history(supplierId),
    queryFn: () => api.fetchStatusHistory(supplierId),
    enabled: !!supplierId,
  });
}

export function useFrequencyConfig() {
  return useQuery({
    queryKey: KEYS.frequencyConfig(),
    queryFn: () => api.fetchFrequencyConfig(),
    staleTime: 60_000,
  });
}

export function useGradeThresholds() {
  return useQuery({
    queryKey: KEYS.gradeThresholds(),
    queryFn: () => api.fetchGradeThresholds(),
    staleTime: 60_000,
  });
}

export function useSprNotifications() {
  return useQuery({
    queryKey: KEYS.notifications(),
    queryFn: () => api.fetchSprNotifications(),
    refetchInterval: 60_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────

export function useCreateReview() {
  const qc = useQueryClient();
  const { tenantId } = useAuth();
  return useMutation({
    mutationFn: (review: Partial<SupplierReview>) => api.createReview({ ...review, tenant_id: tenantId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['spr', 'reviews'] }); },
  });
}

export function useUpdateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<SupplierReview> & { id: string }) => api.updateReview(id, updates),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.review(vars.id) });
      qc.invalidateQueries({ queryKey: ['spr', 'reviews'] });
    },
  });
}

export function useUpsertScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (score: Partial<ReviewScore>) => api.upsertScore(score),
    onSuccess: (_data, vars) => {
      if (vars.review_id) qc.invalidateQueries({ queryKey: KEYS.scores(vars.review_id) });
    },
  });
}

export function useUpsertScores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scores: Partial<ReviewScore>[]) => api.upsertScores(scores),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['spr', 'scores'] }); },
  });
}

export function useCreateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: Partial<ReviewAction>) => api.createAction(action),
    onSuccess: (_data, vars) => {
      if (vars.review_id) qc.invalidateQueries({ queryKey: KEYS.actions(vars.review_id) });
    },
  });
}

export function useUpdateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reviewId, ...updates }: Partial<ReviewAction> & { id: string; reviewId: string }) =>
      api.updateAction(id, updates),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.actions(vars.reviewId) });
    },
  });
}

export function useCreateAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (att: Partial<ReviewAttachment>) => api.createAttachment(att),
    onSuccess: (_data, vars) => {
      if (vars.review_id) qc.invalidateQueries({ queryKey: KEYS.attachments(vars.review_id) });
    },
  });
}

export function useUploadReviewFile() {
  return useMutation({
    mutationFn: ({ reviewId, file }: { reviewId: string; file: File }) => api.uploadReviewFile(reviewId, file),
  });
}

export function useUpsertKpiSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, kpiData }: { reviewId: string; kpiData: Record<string, unknown> }) =>
      api.upsertKpiSnapshot(reviewId, kpiData),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.kpiSnapshot(vars.reviewId) });
    },
  });
}

export function useCollectKpis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.collectKpis(reviewId),
    onSuccess: (_data, reviewId) => {
      qc.invalidateQueries({ queryKey: KEYS.kpiSnapshot(reviewId) });
    },
  });
}

export function useCalcScore() {
  return useMutation({ mutationFn: (reviewId: string) => api.calcReviewScore(reviewId) });
}

export function useEvaluateKnockouts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.evaluateKnockouts(reviewId),
    onSuccess: (_data, reviewId) => {
      qc.invalidateQueries({ queryKey: KEYS.knockouts(reviewId) });
      qc.invalidateQueries({ queryKey: KEYS.kpiSnapshot(reviewId) });
    },
  });
}

export function useApproveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, approverId }: { reviewId: string; approverId: string }) =>
      api.approveReview(reviewId, approverId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.review(vars.reviewId) });
      qc.invalidateQueries({ queryKey: ['spr', 'reviews'] });
      qc.invalidateQueries({ queryKey: ['spr', 'statuses'] });
    },
  });
}

export function useCreateRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, reason, userId }: { reviewId: string; reason: string; userId: string }) =>
      api.createRevision(reviewId, reason, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spr', 'reviews'] });
    },
  });
}

export function useSaveCriterion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (criterion: Partial<import('../types').ReviewCriteria>) => api.saveCriterion(criterion),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['spr', 'criteria'] }); },
  });
}

export function useUpdateFrequencyConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<import('../types').ReviewFrequencyConfig> & { id: string }) =>
      api.updateFrequencyConfig(id, updates),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.frequencyConfig() }); },
  });
}

export function useUpdateGradeThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<import('../types').GradeThreshold> & { id: string }) =>
      api.updateGradeThreshold(id, updates),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.gradeThresholds() }); },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.notifications() }); },
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, reviewerId }: { reviewId: string; reviewerId: string }) =>
      api.submitReview(reviewId, reviewerId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.review(vars.reviewId) });
      qc.invalidateQueries({ queryKey: ['spr', 'reviews'] });
    },
  });
}

export function useValidateCriteriaWeights() {
  return useMutation({
    mutationFn: (category: string) => api.validateCriteriaWeights(category),
  });
}
