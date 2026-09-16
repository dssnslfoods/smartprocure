export type ReviewStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'APPROVED' | 'RETURNED';
export type CriterionGroup = 'SAFETY_QUALITY' | 'COMMERCIAL';
export type ReviewOutcome = 'Approved' | 'Conditionally Approved' | 'Suspended' | 'Disapproved';
export type ReviewGrade = 'A' | 'B' | 'C' | 'D';
export type KnockoutCode = 'CERT_EXPIRED_NO_ALT' | 'QUESTIONNAIRE_3YR' | 'TRACEABILITY_OVERDUE' | 'CRITICAL_INCIDENT_OPEN_CAPA' | 'OUTSOURCED_NO_CUSTOMER_APPROVAL';
export type ActionStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'CANCELLED';
export type ActionType = 'CAPA' | 'IMPROVEMENT' | 'REISSUE_QUESTIONNAIRE' | 'TRACEABILITY_VERIFY' | 'OTHER';
export type SprRole = 'qa_manager' | 'qa_officer' | 'purchasing' | 'viewer';

export interface SupplierReview {
  id: string;
  supplier_id: string;
  review_year: number;
  period_start: string;
  period_end: string;
  due_date: string | null;
  risk_level_at_review: string | null;
  supplier_category: string | null;
  status: ReviewStatus;
  final_score: number | null;
  grade: string | null;
  outcome: string | null;
  knockout_failed: boolean;
  reviewer_id: string | null;
  approver_id: string | null;
  purchasing_input_by: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  returned_at: string | null;
  return_comment: string | null;
  revision_no: number;
  parent_review_id: string | null;
  locked: boolean;
  risk_adjusted: boolean;
  risk_adjustment_reason: string | null;
  new_risk_level: string | null;
  tenant_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewCriteria {
  id: string;
  supplier_category: string;
  code: string;
  name_th: string;
  name_en: string;
  criterion_group: CriterionGroup;
  bsaq_tags: string[];
  weight: number;
  scale_max: number;
  auto_rule: Record<string, unknown> | null;
  score_descriptors: ScoreDescriptor[] | null;
  active: boolean;
  sort_order: number;
}

export interface ScoreDescriptor {
  score: number;
  label: string;
}

export interface ReviewScore {
  id: string;
  review_id: string;
  criterion_id: string;
  auto_score: number | null;
  final_score: number | null;
  override_comment: string | null;
  weight_snapshot: number | null;
}

export interface KnockoutRule {
  id: string;
  code: string;
  description_th: string;
  description_en: string;
  applies_to_categories: string[];
  active: boolean;
  sort_order: number;
}

export interface ReviewKnockout {
  id: string;
  review_id: string;
  rule_id: string;
  passed: boolean;
  detail: string | null;
}

export interface ReviewAction {
  id: string;
  review_id: string;
  action_type: ActionType;
  description: string;
  owner_id: string | null;
  due_date: string | null;
  status: ActionStatus;
  closed_at: string | null;
  created_at: string;
}

export interface ReviewAttachment {
  id: string;
  review_id: string;
  doc_type: string;
  file_path: string;
  file_name: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface SupplierReviewStatus {
  supplier_id: string;
  risk_level: string | null;
  last_review_id: string | null;
  grade: string | null;
  outcome: string | null;
  next_review_due_date: string | null;
  tenant_id: string | null;
  updated_at: string;
}

export interface GradeThreshold {
  id: string;
  supplier_category: string | null;
  grade: string;
  min_score: number;
  outcome: string;
  next_review_months: number | null;
  actions: Record<string, unknown> | null;
  sort_order: number;
}

export interface ReviewFrequencyConfig {
  id: string;
  risk_level: string;
  months: number;
  max_months: number;
  updated_by: string | null;
  updated_at: string;
}

export interface KpiSnapshot {
  review_id: string;
  data: KpiData;
  collected_at: string;
}

export interface KpiData {
  ncr_count?: number;
  ncr_critical_count?: number;
  capa_issued?: number;
  capa_closed?: number;
  capa_overdue?: number;
  cert_type?: string | null;
  cert_expiry_date?: string | null;
  cert_expired?: boolean | null;
  cert_directory_verified?: boolean | null;
  cert_directory_verified_date?: string | null;
  cert_directory_verified_by?: string | null;
  brc_grade?: string | null;
  brc_percent?: number | null;
  risk_score?: number | null;
  lots_received?: number | null;
  lots_rejected?: number | null;
  reject_rate?: number | null;
  complaints_count?: number | null;
  on_time_delivery_pct?: number | null;
  document_accuracy_pct?: number | null;
  approval_method?: string | null;
  questionnaire_issue_date?: string | null;
  traceability_last_date?: string | null;
  traceability_result?: string | null;
  traceability_overdue?: boolean | null;
  change_notifications_received?: number | null;
  change_notifications_open?: number | null;
  spec_current_signed?: boolean | null;
  critical_incident_open_capa?: boolean | null;
  customer_approval_obtained?: boolean | null;
}

export interface StatusHistory {
  id: string;
  supplier_id: string;
  old_status: string | null;
  new_status: string;
  old_grade: string | null;
  new_grade: string | null;
  source_review_id: string | null;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
}

export interface SprNotification {
  id: string;
  user_id: string | null;
  title: string;
  message: string | null;
  type: string | null;
  is_read: boolean;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export interface SupplierForReview {
  id: string;
  company_name: string;
  supplier_code: string | null;
  status: string;
  risk_level: string;
  brc_grade: string | null;
  brc_percent: number | null;
  brc_supplier_type: string | null;
  category: string | null;
  tenant_id: string | null;
}

export interface DashboardStats {
  due_60_days: number;
  due_30_days: number;
  due_7_days: number;
  overdue: number;
  completed_this_year: number;
  planned_this_year: number;
  compliance_pct: number;
  grade_distribution: Record<string, number>;
  suspended_count: number;
  conditional_count: number;
}
