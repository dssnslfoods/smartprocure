import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from '@/i18n';
import { useCollectKpis, useUpsertKpiSnapshot } from '../../hooks/useReviews';
import type { KpiData } from '../../types';

interface Props {
  reviewId: string;
  kpiData: KpiData | null;
  locked: boolean;
  onKpiUpdate: (data: KpiData) => void;
}

export function PerformanceTab({ reviewId, kpiData, locked, onKpiUpdate }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<KpiData>(kpiData ?? {});
  const collectKpis = useCollectKpis();
  const upsertKpi = useUpsertKpiSnapshot();

  const set = (key: keyof KpiData, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleCollect = async () => {
    const result = await collectKpis.mutateAsync(reviewId);
    const merged = { ...form, ...(result as KpiData) };
    setForm(merged);
    onKpiUpdate(merged);
  };

  const handleSave = async () => {
    await upsertKpi.mutateAsync({ reviewId, kpiData: form as Record<string, unknown> });
    onKpiUpdate(form);
  };

  const numField = (key: keyof KpiData, label: string) => (
    <div key={key}>
      <Label>{label}</Label>
      <Input
        type="number"
        value={(form[key] as number) ?? ''}
        onChange={e => set(key, e.target.value === '' ? null : Number(e.target.value))}
        disabled={locked}
      />
    </div>
  );

  const pctField = (key: keyof KpiData, label: string) => (
    <div key={key}>
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={(form[key] as number) ?? ''}
        onChange={e => set(key, e.target.value === '' ? null : Number(e.target.value))}
        disabled={locked}
      />
    </div>
  );

  const checkField = (key: keyof KpiData, label: string) => (
    <div key={key} className="flex items-center gap-2">
      <Checkbox
        checked={!!form[key]}
        onCheckedChange={v => set(key, v)}
        disabled={locked}
      />
      <Label>{label}</Label>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleCollect} disabled={locked || collectKpis.isPending}>
          {collectKpis.isPending ? 'Collecting...' : 'Auto-Collect KPIs'}
        </Button>
        <Button onClick={handleSave} disabled={locked || upsertKpi.isPending}>
          {upsertKpi.isPending ? 'Saving...' : t('common.save')}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>NCR & CAPA</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {numField('ncr_count', t('spr.kpi.ncrCount'))}
          {numField('ncr_critical_count', t('spr.kpi.ncrCritical'))}
          {numField('capa_issued', t('spr.kpi.capaIssued'))}
          {numField('capa_closed', t('spr.kpi.capaClosed'))}
          {numField('capa_overdue', t('spr.kpi.capaOverdue'))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Delivery & Quality</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {numField('lots_received', t('spr.kpi.lotsReceived'))}
          {numField('lots_rejected', t('spr.kpi.lotsRejected'))}
          {pctField('reject_rate', t('spr.kpi.rejectRate'))}
          {pctField('on_time_delivery_pct', t('spr.kpi.onTimeDelivery'))}
          {pctField('document_accuracy_pct', t('spr.kpi.docAccuracy'))}
          {numField('complaints_count', t('spr.kpi.complaints'))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Certification & Traceability</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>{t('spr.kpi.certStatus')}</Label>
            <Input value={form.cert_type ?? ''} onChange={e => set('cert_type', e.target.value || null)} disabled={locked} />
          </div>
          <div>
            <Label>{t('spr.kpi.certExpiry')}</Label>
            <Input type="date" value={form.cert_expiry_date ?? ''} onChange={e => set('cert_expiry_date', e.target.value || null)} disabled={locked} />
          </div>
          {checkField('cert_expired', 'Certification Expired')}
          {checkField('cert_directory_verified', 'Directory Verified (BRCGS 3.5.4.2)')}
          <div>
            <Label>Questionnaire Issue Date</Label>
            <Input type="date" value={form.questionnaire_issue_date ?? ''} onChange={e => set('questionnaire_issue_date', e.target.value || null)} disabled={locked} />
          </div>
          <div>
            <Label>Last Traceability Date</Label>
            <Input type="date" value={form.traceability_last_date ?? ''} onChange={e => set('traceability_last_date', e.target.value || null)} disabled={locked} />
          </div>
          {checkField('traceability_overdue', 'Traceability Overdue')}
          {checkField('critical_incident_open_capa', 'Critical Incident (Open CAPA)')}
          {checkField('customer_approval_obtained', 'Customer Approval Obtained (Outsourced)')}
          {checkField('spec_current_signed', 'Spec Current & Signed')}
        </CardContent>
      </Card>
    </div>
  );
}
