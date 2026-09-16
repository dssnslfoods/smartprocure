import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/i18n';
import { useCollectKpis, useUpsertKpiSnapshot, useEvaluateKnockouts } from '../../hooks/useReviews';
import type { KpiData } from '../../types';

interface Props {
  reviewId: string;
  kpiData: KpiData | null;
  locked: boolean;
  reviewDate: string | null;
  supplierCategory: string | null;
  onKpiUpdate: (data: KpiData) => void;
}

const APPROVAL_METHODS = [
  { value: 'GFSI_CERT', label: 'GFSI Certification (BRCGS/FSSC/SQF/IFS)' },
  { value: 'SUPPLIER_AUDIT', label: 'Supplier Audit' },
  { value: 'QUESTIONNAIRE', label: 'Questionnaire' },
] as const;

const CERT_SCHEMES = ['BRCGS', 'FSSC 22000', 'SQF', 'IFS', 'Other'] as const;

const TRACEABILITY_RESULTS = [
  { value: 'PASS', label: 'ผ่าน (Pass)' },
  { value: 'FAIL', label: 'ไม่ผ่าน (Fail)' },
  { value: 'PENDING', label: 'รอดำเนินการ (Pending)' },
] as const;

export function PerformanceTab({ reviewId, kpiData, locked, reviewDate, supplierCategory, onKpiUpdate }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<KpiData>(kpiData ?? {});
  const [errors, setErrors] = useState<string[]>([]);
  const collectKpis = useCollectKpis();
  const upsertKpi = useUpsertKpiSnapshot();
  const evaluateKnockouts = useEvaluateKnockouts();

  useEffect(() => {
    if (kpiData && !dirty) setForm(kpiData);
  }, [kpiData]);

  const set = (key: keyof KpiData, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const computeRejectRate = useCallback((data: KpiData): number | null => {
    const received = data.lots_received;
    const rejected = data.lots_rejected;
    if (received != null && received > 0 && rejected != null) {
      return Math.round((rejected / received) * 10000) / 100;
    }
    return null;
  }, []);

  const computeDerivedFlags = useCallback((data: KpiData): KpiData => {
    const result = { ...data };
    const revDate = reviewDate ? new Date(reviewDate) : new Date();

    // cert_expired: cert_expiry_date < review date
    if (data.cert_expiry_date) {
      result.cert_expired = new Date(data.cert_expiry_date) < revDate;
    }

    // traceability_overdue
    if (data.approval_method === 'QUESTIONNAIRE') {
      if (data.traceability_last_date) {
        const lastDate = new Date(data.traceability_last_date);
        lastDate.setFullYear(lastDate.getFullYear() + 3);
        result.traceability_overdue = lastDate < revDate || data.traceability_result === 'FAIL';
      }
    }

    // critical_incident_open_capa
    result.critical_incident_open_capa =
      (data.ncr_critical_count ?? 0) > 0 && (data.capa_overdue ?? 0) > 0;

    // reject_rate
    result.reject_rate = computeRejectRate(data);

    return result;
  }, [reviewDate, computeRejectRate]);

  const validate = (data: KpiData): string[] => {
    const errs: string[] = [];
    if (data.lots_rejected != null && data.lots_received != null && data.lots_rejected > data.lots_received) {
      errs.push(t('spr.perf.errRejectedExceedsReceived'));
    }
    if (data.capa_closed != null && data.capa_issued != null && data.capa_closed > data.capa_issued) {
      errs.push(t('spr.perf.errCapaClosedExceedsIssued'));
    }
    if (data.capa_overdue != null && data.capa_issued != null && data.capa_overdue > data.capa_issued) {
      errs.push(t('spr.perf.errCapaOverdueExceedsIssued'));
    }
    return errs;
  };

  const handleCollect = async () => {
    const result = await collectKpis.mutateAsync(reviewId);
    const merged = { ...form, ...(result as KpiData) };
    const computed = computeDerivedFlags(merged);
    setForm(computed);
    onKpiUpdate(computed);
  };

  const handleSave = async () => {
    const computed = computeDerivedFlags(form);
    const errs = validate(computed);
    setErrors(errs);
    if (errs.length > 0) return;

    await upsertKpi.mutateAsync({ reviewId, kpiData: computed as Record<string, unknown> });
    onKpiUpdate(computed);
    evaluateKnockouts.mutate(reviewId);
    setDirty(false);
  };

  const [dirty, setDirty] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;

  const setTracked = (key: keyof KpiData, value: unknown) => {
    set(key, value);
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty || locked) return;
    const timer = setTimeout(() => {
      const computed = computeDerivedFlags(formRef.current);
      const errs = validate(computed);
      if (errs.length === 0) {
        upsertKpi.mutate({ reviewId, kpiData: computed as Record<string, unknown> });
        setDirty(false);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [dirty]);

  const numField = (key: keyof KpiData, label: string, readOnly = false) => (
    <div key={key}>
      <Label>{label}</Label>
      <Input
        type="number"
        value={(form[key] as number) ?? ''}
        onChange={e => setTracked(key, e.target.value === '' ? null : Number(e.target.value))}
        disabled={locked || readOnly}
        className={readOnly ? 'bg-muted' : ''}
      />
    </div>
  );

  const pctField = (key: keyof KpiData, label: string, readOnly = false) => (
    <div key={key}>
      <Label>{label} (%)</Label>
      <Input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={(form[key] as number) ?? ''}
        onChange={e => setTracked(key, e.target.value === '' ? null : Number(e.target.value))}
        disabled={locked || readOnly}
        className={readOnly ? 'bg-muted' : ''}
      />
    </div>
  );

  const derivedBadge = (key: keyof KpiData, labelTrue: string, labelFalse: string, reason?: string) => {
    const val = form[key];
    if (val == null) return <Badge variant="outline">—</Badge>;
    return (
      <div className="space-y-1">
        <Badge className={val ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>
          {val ? labelTrue : labelFalse}
        </Badge>
        {reason && val && <p className="text-xs text-muted-foreground">{reason}</p>}
      </div>
    );
  };

  const isOutsourced = supplierCategory === 'outsourced_processor';

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Button variant="outline" onClick={handleCollect} disabled={locked || collectKpis.isPending}>
          {collectKpis.isPending ? t('spr.perf.collecting') : t('spr.perf.autoCollect')}
        </Button>
        <Button onClick={handleSave} disabled={locked || upsertKpi.isPending}>
          {upsertKpi.isPending ? t('spr.perf.saving') : t('common.save')}
        </Button>
        {dirty && <Badge variant="outline" className="text-amber-600 border-amber-300">Unsaved</Badge>}
      </div>

      {errors.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <ul className="text-red-700 text-sm list-disc list-inside">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* P0-5: Approval method & certification */}
      <Card>
        <CardHeader><CardTitle>{t('spr.perf.approvalTitle')}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>{t('spr.perf.approvalMethod')}</Label>
            <Select
              value={form.approval_method ?? ''}
              onValueChange={v => setTracked('approval_method', v || null)}
              disabled={locked}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {APPROVAL_METHODS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('spr.perf.certScheme')}</Label>
            <Select
              value={form.cert_type ?? ''}
              onValueChange={v => setTracked('cert_type', v || null)}
              disabled={locked}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {CERT_SCHEMES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('spr.kpi.brcGrade')}</Label>
            <Input
              value={form.brc_grade ?? ''}
              onChange={e => setTracked('brc_grade', e.target.value || null)}
              disabled={locked}
              placeholder="e.g. AA, A, B"
            />
          </div>
        </CardContent>
      </Card>

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
        <CardHeader><CardTitle>{t('spr.perf.deliveryQuality')}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {numField('lots_received', t('spr.kpi.lotsReceived'))}
          {numField('lots_rejected', t('spr.kpi.lotsRejected'))}
          {/* P0-7: reject_rate is computed, read-only */}
          {pctField('reject_rate', t('spr.kpi.rejectRate'), true)}
          {pctField('on_time_delivery_pct', t('spr.kpi.onTimeDelivery'))}
          {pctField('document_accuracy_pct', t('spr.kpi.docAccuracy'))}
          {numField('complaints_count', t('spr.kpi.complaints'))}
          {numField('change_notifications_received', t('spr.perf.changeNotifReceived'))}
          {numField('change_notifications_open', t('spr.perf.changeNotifOpen'))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('spr.perf.certTraceability')}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>{t('spr.kpi.certExpiry')}</Label>
            <Input
              type="date"
              value={form.cert_expiry_date ?? ''}
              onChange={e => setTracked('cert_expiry_date', e.target.value || null)}
              disabled={locked}
            />
          </div>
          {/* P0-4: Derived status badge — not manual checkbox */}
          <div>
            <Label>{t('spr.perf.certStatus')}</Label>
            {derivedBadge('cert_expired', t('spr.perf.expired'), t('spr.perf.valid'),
              form.cert_expiry_date ? `${t('spr.perf.expiryDate')}: ${form.cert_expiry_date}` : undefined
            )}
          </div>

          {/* P0-6: Fixed clause reference — BRCGS 3.5.1.2, not 3.5.4.2 */}
          <div>
            <Label>{t('spr.perf.directoryVerified')} (BRCGS 3.5.1.2)</Label>
            <div className="space-y-2">
              <Input
                type="date"
                value={form.cert_directory_verified_date ?? ''}
                onChange={e => {
                  const v = e.target.value || null;
                  setTracked('cert_directory_verified_date', v);
                  setTracked('cert_directory_verified', !!v);
                }}
                disabled={locked}
                placeholder={t('spr.perf.verifiedOn')}
              />
              <Input
                value={form.cert_directory_verified_by ?? ''}
                onChange={e => setTracked('cert_directory_verified_by', e.target.value || null)}
                disabled={locked}
                placeholder={t('spr.perf.verifiedBy')}
              />
            </div>
          </div>

          <div>
            <Label>{t('spr.perf.questionnaireIssueDate')}</Label>
            <Input
              type="date"
              value={form.questionnaire_issue_date ?? ''}
              onChange={e => setTracked('questionnaire_issue_date', e.target.value || null)}
              disabled={locked}
            />
          </div>
          <div>
            <Label>{t('spr.perf.lastTraceabilityDate')}</Label>
            <Input
              type="date"
              value={form.traceability_last_date ?? ''}
              onChange={e => setTracked('traceability_last_date', e.target.value || null)}
              disabled={locked}
            />
          </div>
          <div>
            <Label>{t('spr.perf.traceabilityResult')}</Label>
            <Select
              value={form.traceability_result ?? ''}
              onValueChange={v => setTracked('traceability_result', v || null)}
              disabled={locked}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {TRACEABILITY_RESULTS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* P0-4: Derived status badges */}
          <div>
            <Label>{t('spr.perf.traceabilityStatus')}</Label>
            {derivedBadge('traceability_overdue',
              t('spr.perf.overdue'),
              t('spr.perf.ok'),
              form.traceability_last_date ? `Last: ${form.traceability_last_date}` : undefined
            )}
          </div>

          <div>
            <Label>{t('spr.perf.criticalIncident')}</Label>
            {derivedBadge('critical_incident_open_capa',
              t('spr.perf.activeIncident'),
              t('spr.perf.noIncident'),
              `Critical NCR: ${form.ncr_critical_count ?? 0}, CAPA overdue: ${form.capa_overdue ?? 0}`
            )}
          </div>

          {/* P0-5: Show customer approval only for outsourced processor */}
          {isOutsourced && (
            <div>
              <Label>{t('spr.perf.customerApproval')}</Label>
              <Select
                value={form.customer_approval_obtained ? 'true' : 'false'}
                onValueChange={v => setTracked('customer_approval_obtained', v === 'true')}
                disabled={locked}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">{t('spr.perf.yes')}</SelectItem>
                  <SelectItem value="false">{t('spr.perf.no')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>{t('spr.perf.specStatus')}</Label>
            <Select
              value={form.spec_current_signed ? 'true' : 'false'}
              onValueChange={v => setTracked('spec_current_signed', v === 'true')}
              disabled={locked}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">{t('spr.perf.currentSigned')}</SelectItem>
                <SelectItem value="false">{t('spr.perf.notCurrent')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
