import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/i18n';
import type { SupplierReview, KpiData } from '../../types';

interface Props {
  review: SupplierReview;
  kpiData: KpiData | null;
}

export function SupplierInfoTab({ review, kpiData }: Props) {
  const { t } = useTranslation();

  const fields = [
    { label: 'Supplier ID', value: review.supplier_id },
    { label: 'Review Year', value: review.review_year },
    { label: 'Period', value: `${review.period_start} — ${review.period_end}` },
    { label: 'Risk Level', value: review.risk_level_at_review ?? '—' },
    { label: 'Category', value: review.supplier_category ?? '—' },
    { label: 'Due Date', value: review.due_date ?? '—' },
  ];

  const certFields = kpiData ? [
    { label: t('spr.kpi.certStatus'), value: kpiData.cert_type ?? '—' },
    { label: t('spr.kpi.certExpiry'), value: kpiData.cert_expiry_date ?? '—' },
    { label: t('spr.kpi.brcGrade'), value: kpiData.brc_grade ?? '—' },
    { label: 'BRC %', value: kpiData.brc_percent != null ? `${kpiData.brc_percent}%` : '—' },
    { label: 'Approval Method', value: kpiData.approval_method ?? '—' },
  ] : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>{t('spr.tabs.supplierInfo')}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {fields.map(f => (
              <div key={f.label}>
                <dt className="text-sm text-muted-foreground">{f.label}</dt>
                <dd className="font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {certFields.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Certification & BRC</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {certFields.map(f => (
                <div key={f.label}>
                  <dt className="text-sm text-muted-foreground">{f.label}</dt>
                  <dd className="font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
