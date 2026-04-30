export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type SupplierType = 'approved' | 'new' | 'nominated' | 'critical' | 'blocked';
export type QaApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';
export type QuotationStatus = 'draft' | 'submitted' | 'under_review' | 'awarded' | 'not_awarded' | 'rejected' | 'withdrawn';
export type AwardLifecycleStatus = 'draft' | 'pending_approval' | 'awarded' | 'cancelled';
export type ApprovalLevel = 'buyer' | 'procurement_manager' | 'qa' | 'finance' | 'director';
export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'skipped';

export interface SupplierRiskAssessment {
  id: string;
  supplier_id: string;
  food_safety_risk: number;
  quality_risk: number;
  delivery_risk: number;
  financial_risk: number;
  certificate_risk: number;
  food_fraud_risk: number;
  allergen_risk: number;
  country_risk: number;
  critical_material_risk: number;
  ncr_history_risk: number;
  total_risk_score: number;
  notes: string | null;
  assessed_by: string | null;
  assessed_at: string;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  company_name: string;
  supplier_code: string | null;
  supplier_name: string | null;
  supplier_type: SupplierType;
  category: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  certificate_type: string | null;
  certificate_expiry_date: string | null;
  qa_approval_status: QaApprovalStatus;
  risk_level: RiskLevel;
  performance_score: number;
  status: string;
  is_blacklisted: boolean;
  created_at: string;
  updated_at: string;
}

export interface RFQItem {
  id: string;
  rfq_id: string;
  item_name: string;
  description: string | null;
  specification: string | null;
  quantity: number | null;
  unit: string | null;
  required_date: string | null;
  estimated_budget: number | null;
  technical_requirement: string | null;
}

export interface RFQ {
  id: string;
  rfq_number: string | null;
  title: string;
  description: string | null;
  requester: string | null;
  requester_id: string | null;
  department: string | null;
  category: string | null;
  required_date: string | null;
  budget: number | null;
  currency: string;
  submission_deadline: string | null;
  deadline: string | null;
  status: string;
  workflow_status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Quotation {
  id: string;
  rfq_id: string;
  supplier_id: string;
  quotation_no: string | null;
  price: number | null;
  discount: number;
  vat: number;
  total_amount: number | null;
  currency: string;
  lead_time_days: number | null;
  payment_term: string | null;
  warranty: string | null;
  validity_date: string | null;
  spec_compliance_score: number | null;
  technical_score: number | null;
  commercial_score: number | null;
  risk_score: number | null;
  final_score: number | null;
  rank: number | null;
  evaluation_status: QuotationStatus;
  remark: string | null;
  submitted_at: string | null;
  created_at: string;
}

export interface AwardApproval {
  id: string;
  rfq_id: string;
  recommended_supplier_id: string;
  quotation_id: string;
  approval_level: ApprovalLevel;
  approver_role: string | null;
  approver_id: string | null;
  approval_status: ApprovalDecision;
  approval_comment: string | null;
  level_order: number;
  required: boolean;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EligibilityResult {
  status: 'eligible' | 'warning' | 'blocked' | 'requires_qa' | 'requires_nomination';
  reasons: string[];
  canInvite: boolean;
  canAward: boolean;
}

export interface ScoringWeights {
  commercial: number;
  technical: number;
  risk: number;
}

export const RISK_FACTORS = [
  { key: 'food_safety_risk',       label: 'Food Safety',       description: 'Risk of food safety incidents or violations' },
  { key: 'quality_risk',           label: 'Quality',           description: 'Product/service quality consistency risk' },
  { key: 'delivery_risk',          label: 'Delivery',          description: 'On-time delivery and logistics reliability' },
  { key: 'financial_risk',         label: 'Financial',         description: 'Financial stability and creditworthiness' },
  { key: 'certificate_risk',       label: 'Certification',     description: 'Compliance certificates and accreditations' },
  { key: 'food_fraud_risk',        label: 'Food Fraud',        description: 'Risk of intentional food fraud or adulteration' },
  { key: 'allergen_risk',          label: 'Allergen',          description: 'Allergen cross-contamination management' },
  { key: 'country_risk',           label: 'Country / Region',  description: 'Geopolitical, regulatory, and import risks' },
  { key: 'critical_material_risk', label: 'Critical Material', description: 'Supply continuity of critical raw materials' },
  { key: 'ncr_history_risk',       label: 'NCR History',       description: 'Non-conformance report history and trends' },
] as const;
