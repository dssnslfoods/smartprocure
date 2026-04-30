import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Search, ShieldAlert, ShieldCheck, ShieldOff, ShieldQuestion, ClipboardEdit } from 'lucide-react';
import { useSupabasePagination } from '@/hooks/use-supabase-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import RiskBadge, { SupplierTypeBadge } from '@/components/RiskBadge';
import type { RiskLevel } from '@/types/procurement';
import { useTranslation } from '@/i18n';

const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function VendorRiskPage() {
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const { t } = useTranslation();

  const filters = useCallback((query: any) => {
    let q = query;
    if (search) {
      q = q.or(`company_name.ilike.%${search}%,supplier_code.ilike.%${search}%`);
    }
    if (riskFilter !== 'all') {
      q = q.eq('risk_level', riskFilter);
    }
    return q;
  }, [search, riskFilter]);

  const pagination = useSupabasePagination<any>({
    tableName: 'suppliers',
    pageSize: 20,
    filters,
    select: 'id, company_name, supplier_code, supplier_name, supplier_type, risk_level, certificate_type, certificate_expiry_date, qa_approval_status, performance_score, status, updated_at, supplier_risk_assessments(total_risk_score, assessed_at)',
  });

  const items = pagination.items;

  const counts = {
    total: items.length,
    high: items.filter(s => s.risk_level === 'high').length,
    critical: items.filter(s => s.risk_level === 'critical').length,
    expired: items.filter(s => {
      if (!s.certificate_expiry_date) return false;
      return new Date(s.certificate_expiry_date) < new Date();
    }).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('vendorRisk.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('vendorRisk.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={ShieldCheck}    label={t('vendorRisk.totalSuppliers')} value={counts.total}    color="bg-blue-500/10 text-blue-600" />
        <StatCard icon={ShieldQuestion} label={t('vendorRisk.highRisk')}       value={counts.high}     color="bg-orange-500/10 text-orange-600" />
        <StatCard icon={ShieldOff}      label={t('vendorRisk.criticalRisk')}   value={counts.critical} color="bg-red-500/10 text-red-600" />
        <StatCard icon={AlertTriangle}  label={t('vendorRisk.expiredCerts')}   value={counts.expired}  color="bg-yellow-500/10 text-yellow-600" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('vendorRisk.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('vendorRisk.riskLevel')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {RISK_LEVELS.map(r => (
              <SelectItem key={r} value={r}>{t(`riskLevel.${r}` as any)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('vendorRisk.supplier')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('vendorRisk.code')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('vendorRisk.type')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('vendorRisk.riskLevel')}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">คะแนน</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('vendorRisk.certificate')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('vendorRisk.expiry')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('vendorRisk.qaStatus')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pagination.loading ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{t('common.loading')}</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{t('common.noData')}</td></tr>
                ) : (
                  items.map((s) => {
                    const expiry = s.certificate_expiry_date ? new Date(s.certificate_expiry_date) : null;
                    const isExpired = expiry ? expiry < new Date() : false;
                    const expiringSoon = expiry && !isExpired
                      ? expiry < new Date(Date.now() + 30 * 86400000)
                      : false;

                    return (
                      <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium">
                          <Link to={`/suppliers/${s.id}`} className="text-primary hover:underline">
                            {s.company_name}
                          </Link>
                        </td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{s.supplier_code || '—'}</td>
                        <td className="p-3"><SupplierTypeBadge type={s.supplier_type} /></td>
                        <td className="p-3">
                          {(() => {
                            const assessments = s.supplier_risk_assessments as any[];
                            const hasAssessment = assessments?.length > 0;
                            return hasAssessment
                              ? <RiskBadge level={s.risk_level} />
                              : <span className="text-muted-foreground text-xs">ยังไม่ประเมิน</span>;
                          })()}
                        </td>
                        <td className="p-3 text-right">
                          {(() => {
                            const latest = (s.supplier_risk_assessments as any[])?.sort(
                              (a: any, b: any) => new Date(b.assessed_at).getTime() - new Date(a.assessed_at).getTime()
                            )[0];
                            return latest?.total_risk_score != null ? (
                              <span className="font-semibold tabular-nums">
                                {Number(latest.total_risk_score).toFixed(1)}
                                <span className="text-[10px] text-muted-foreground font-normal">/100</span>
                              </span>
                            ) : <span className="text-muted-foreground text-xs">—</span>;
                          })()}
                        </td>
                        <td className="p-3 text-muted-foreground">{s.certificate_type || '—'}</td>
                        <td className="p-3">
                          {expiry ? (
                            <span className={
                              isExpired ? 'text-red-600 font-medium' :
                              expiringSoon ? 'text-orange-600 font-medium' :
                              'text-muted-foreground'
                            }>
                              {expiry.toLocaleDateString()}
                              {isExpired && ' ⚠'}
                              {expiringSoon && !isExpired && ' ⚡'}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="p-3"><QaStatusBadge status={s.qa_approval_status} /></td>
                        <td className="p-3">
                          <Link to={`/vendor-risk/${s.id}`}>
                            <Button variant="outline" size="sm">
                              <ClipboardEdit className="w-3.5 h-3.5 mr-1" />
                              {t('vendorRisk.assess')}
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls {...pagination} />
        </CardContent>
      </Card>

      <Card className="border-orange-200 bg-orange-50/50">
        <CardContent className="p-4 flex gap-3">
          <ShieldAlert className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div className="text-sm text-orange-800 space-y-1">
            <p className="font-medium">{t('vendorRisk.businessRules')}</p>
            <ul className="list-disc list-inside space-y-0.5 text-orange-700">
              <li>{t('vendorRisk.rules.blocked')}</li>
              <li>{t('vendorRisk.rules.critical')}</li>
              <li>{t('vendorRisk.rules.high')}</li>
              <li>{t('vendorRisk.rules.expired')}</li>
              <li>{t('vendorRisk.rules.expiring')}</li>
              <li>{t('vendorRisk.rules.nominated')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QaStatusBadge({ status }: { status: string | null }) {
  const { t } = useTranslation();
  const map: Record<string, string> = {
    not_required: 'text-muted-foreground',
    pending:      'text-yellow-700 bg-yellow-500/10',
    approved:     'text-emerald-700 bg-emerald-500/10',
    rejected:     'text-red-700 bg-red-500/10',
  };
  const s = status ?? 'not_required';
  const labels: Record<string, string> = {
    not_required: t('common.noData'),
    pending:  t('common.pending'),
    approved: t('common.approved'),
    rejected: t('common.rejected'),
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[s] ?? ''}`}>
      {labels[s] ?? s}
    </span>
  );
}
