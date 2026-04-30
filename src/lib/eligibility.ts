import type { EligibilityResult, RiskLevel, SupplierType } from '@/types/procurement';

export function checkSupplierEligibility(supplier: {
  supplier_type?: SupplierType | null;
  risk_level?: RiskLevel | null;
  is_blacklisted?: boolean;
  certificate_expiry_date?: string | null;
  qa_approval_status?: string | null;
  status?: string;
}): EligibilityResult {
  const reasons: string[] = [];
  let canInvite = true;
  let canAward = true;
  let status: EligibilityResult['status'] = 'eligible';

  const type = supplier.supplier_type ?? 'new';
  const risk = supplier.risk_level ?? 'low';

  if (supplier.is_blacklisted || type === 'blocked') {
    reasons.push('Supplier is blocked and cannot be invited or awarded.');
    canInvite = false;
    canAward = false;
    return { status: 'blocked', reasons, canInvite, canAward };
  }

  if (risk === 'critical') {
    reasons.push('Critical risk supplier cannot be awarded. Invitation allowed for review only.');
    canAward = false;
    status = 'blocked';
  }

  if (risk === 'high') {
    reasons.push('High risk supplier requires QA approval before award.');
    if (supplier.qa_approval_status !== 'approved') {
      canAward = false;
      status = 'requires_qa';
    }
  }

  if (supplier.certificate_expiry_date) {
    const expiry = new Date(supplier.certificate_expiry_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expiry < today) {
      reasons.push('Certificate has expired. An exception approval is required before award.');
      canAward = false;
      if (status === 'eligible') status = 'warning';
    } else {
      const thirtyDays = new Date(today);
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      if (expiry < thirtyDays) {
        reasons.push('Certificate expires within 30 days.');
        if (status === 'eligible') status = 'warning';
      }
    }
  }

  if (type === 'nominated') {
    reasons.push('Nominated supplier must have customer nomination evidence before award.');
    canAward = false;
    if (status === 'eligible') status = 'requires_nomination';
  }

  if (supplier.status === 'suspended') {
    reasons.push('Supplier account is suspended.');
    canInvite = false;
    canAward = false;
    status = 'blocked';
  }

  return { status, reasons, canInvite, canAward };
}

export function riskLevelToScore(level: RiskLevel | null | undefined): number {
  switch (level) {
    case 'low':      return 100;
    case 'medium':   return 75;
    case 'high':     return 50;
    case 'critical': return 0;
    default:         return 100;
  }
}

export function classifyRiskLevel(score: number): RiskLevel {
  if (score <= 30) return 'low';
  if (score <= 60) return 'medium';
  if (score <= 80) return 'high';
  return 'critical';
}
