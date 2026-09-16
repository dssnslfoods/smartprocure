import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/i18n';
import { useSuppliers, useFrequencyConfig, useReviews } from '../../hooks/useReviews';
import { GradeBadge, StatusBadge } from '../shared';
import type { SupplierReview, KpiData } from '../../types';

const CATEGORY_LABELS: Record<string, string> = {
  rm_primary_pk: 'วัตถุดิบ / บรรจุภัณฑ์สัมผัสอาหาร (RM / Primary PK)',
  service: 'ผู้ให้บริการ (Service)',
  outsourced_processor: 'ผู้รับจ้างผลิต (Outsourced Processor)',
  packaging_non_contact: 'บรรจุภัณฑ์ไม่สัมผัสอาหาร',
  trading: 'ตัวแทนจำหน่าย (Trading)',
};

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
};

interface Props {
  review: SupplierReview;
  kpiData: KpiData | null;
}

export function SupplierInfoTab({ review, kpiData }: Props) {
  const { t } = useTranslation();
  const { data: suppliers = [] } = useSuppliers();
  const { data: freqConfig = [] } = useFrequencyConfig();
  const { data: allReviews = [] } = useReviews({ supplier_id: review.supplier_id, limit: 10 });

  const supplier = useMemo(
    () => suppliers.find(s => s.id === review.supplier_id),
    [suppliers, review.supplier_id]
  );

  const lastApproved = useMemo(
    () => allReviews
      .filter(r => r.id !== review.id && r.status === 'APPROVED')
      .sort((a, b) => (b.approved_at ?? '').localeCompare(a.approved_at ?? ''))[0],
    [allReviews, review.id]
  );

  const riskLevel = review.risk_level_at_review ?? supplier?.risk_level ?? '—';
  const freq = freqConfig.find(f => f.risk_level === riskLevel);

  const dueDate = useMemo(() => {
    if (review.due_date) return review.due_date;
    if (lastApproved?.approved_at && freq) {
      const d = new Date(lastApproved.approved_at);
      d.setMonth(d.getMonth() + freq.months);
      return d.toISOString().split('T')[0];
    }
    return '—';
  }, [review.due_date, lastApproved, freq]);

  const categoryLabel = review.supplier_category
    ? CATEGORY_LABELS[review.supplier_category] ?? review.supplier_category
    : '—';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>{t('spr.tabs.supplierInfo')}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <dt className="text-sm text-muted-foreground">{t('spr.info.supplierName')}</dt>
              <dd className="font-medium">
                {supplier ? `${supplier.company_name} (${supplier.supplier_code ?? review.supplier_id.slice(0, 8)})` : review.supplier_id.slice(0, 8)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('spr.info.category')}</dt>
              <dd className="font-medium">{categoryLabel}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('spr.info.reviewYear')}</dt>
              <dd className="font-medium">{review.review_year}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('spr.info.period')}</dt>
              <dd className="font-medium">{review.period_start} — {review.period_end}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('spr.info.riskLevel')}</dt>
              <dd>
                <Badge className={RISK_COLORS[riskLevel] ?? 'bg-slate-100 text-slate-800'}>
                  {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}
                </Badge>
                {freq && (
                  <span className="text-xs text-muted-foreground ml-2">
                    ({t('spr.info.reviewEvery')} {freq.months} {t('spr.info.months')})
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('spr.info.dueDate')}</dt>
              <dd className="font-medium">{dueDate}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('spr.info.approvalMethod')}</dt>
              <dd className="font-medium">{kpiData?.approval_method ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('spr.info.status')}</dt>
              <dd><StatusBadge status={review.status} /></dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Last review summary */}
      {lastApproved && (
        <Card>
          <CardHeader><CardTitle>{t('spr.info.lastReview')}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
              <div>
                <dt className="text-sm text-muted-foreground">{t('spr.info.lastReviewDate')}</dt>
                <dd className="font-medium">{lastApproved.approved_at ? new Date(lastApproved.approved_at).toLocaleDateString() : '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t('spr.info.lastGrade')}</dt>
                <dd>{lastApproved.grade ? <GradeBadge grade={lastApproved.grade} score={lastApproved.final_score} /> : '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t('spr.info.lastScore')}</dt>
                <dd className="font-medium">{lastApproved.final_score != null ? `${lastApproved.final_score}%` : '—'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Certification summary */}
      {kpiData && (
        <Card>
          <CardHeader><CardTitle>{t('spr.info.certSummary')}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <dt className="text-sm text-muted-foreground">{t('spr.kpi.certStatus')}</dt>
                <dd className="font-medium">{kpiData.cert_type ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t('spr.kpi.certExpiry')}</dt>
                <dd className="font-medium">{kpiData.cert_expiry_date ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t('spr.kpi.brcGrade')}</dt>
                <dd className="font-medium">{kpiData.brc_grade ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">BRC %</dt>
                <dd className="font-medium">{kpiData.brc_percent != null ? `${kpiData.brc_percent}%` : '—'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
