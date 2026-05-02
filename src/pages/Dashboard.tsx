import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Building2, FileText, Gavel, Award, Clock, Activity,
  ShieldAlert, ShieldX, AlertTriangle, Trophy, BarChart2, TrendingDown,
  ExternalLink, FileBadge,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n';

interface ExpiredCertRow {
  cert_id:          string;
  supplier_id:      string;
  company_name:     string;
  certificate_type: string;
  certificate_no:   string | null;
  expiry_date:      string;
  daysOverdue:      number;
}

interface KPIData {
  totalSuppliers: number;
  approvedSuppliers: number;
  pendingSuppliers: number;
  highRiskSuppliers: number;
  criticalRiskSuppliers: number;
  expiredCerts: number;
  expiredCertList: ExpiredCertRow[];
  openRfqs: number;
  draftRfqs: number;
  pendingBidReview: number;
  pendingApproval: number;
  awardedRfqs: number;
  activeBids: number;
  pendingAwards: number;
  awardsToHighRisk: number;
  totalSavings: number;
  avgCycleDays: number | null;
  suppliersByStatus: Record<string, number>;
  recentActivity: { type: string; title: string; time: string; icon: string }[];
}

export default function Dashboard() {
  const { profile, roles } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [kpi, setKpi] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expiredOpen, setExpiredOpen] = useState(false);

  useEffect(() => {
    const fetchKPIs = async () => {
      try {
        const [
          suppliersRes,
          rfqRes,
          biddingRes,
          awardsRes,
          recentSuppRes,
          recentRfqRes,
          recentBidRes,
          savingsRes,
        ] = await Promise.all([
          supabase.from('suppliers').select('id, status, risk_level, certificate_expiry_date'),
          supabase.from('rfqs').select('id, status, workflow_status, created_at, updated_at'),
          supabase.from('bidding_events').select('id, status'),
          supabase.from('awards').select('id, status, award_lifecycle_status, final_amount, amount, supplier_id, suppliers(risk_level)'),
          supabase.from('suppliers').select('id, company_name, status, created_at').order('created_at', { ascending: false }).limit(5),
          supabase.from('rfqs').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(5),
          supabase.from('bidding_events').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(3),
          supabase.from('quotations').select('discount').not('discount', 'is', null).gt('discount', 0),
        ]);

        // Pull expired certificates with supplier names — joins supplier_certificates with suppliers
        const todayIso = new Date().toISOString().slice(0, 10);
        const expiredCertsRes = await supabase
          .from('supplier_certificates')
          .select('id, supplier_id, certificate_type, certificate_no, expiry_date, suppliers(company_name)')
          .lt('expiry_date', todayIso)
          .order('expiry_date', { ascending: true });

        const expiredCertList: ExpiredCertRow[] = (expiredCertsRes.data || []).map((c: any) => {
          const expiry = new Date(c.expiry_date);
          const daysOverdue = Math.floor((Date.now() - expiry.getTime()) / 86400000);
          return {
            cert_id:          c.id,
            supplier_id:      c.supplier_id,
            company_name:     c.suppliers?.company_name || '(ไม่ระบุชื่อบริษัท)',
            certificate_type: c.certificate_type,
            certificate_no:   c.certificate_no,
            expiry_date:      c.expiry_date,
            daysOverdue,
          };
        });

        const suppliers = suppliersRes.data || [];
        const rfqs = rfqRes.data || [];
        const bids = biddingRes.data || [];
        const awards = awardsRes.data || [];
        const suppliersByStatus: Record<string, number> = {};
        suppliers.forEach((s: any) => { suppliersByStatus[s.status] = (suppliersByStatus[s.status] || 0) + 1; });

        // Compute risk stats from already-fetched suppliers
        const now = new Date().toISOString();
        const highRiskSuppliers = suppliers.filter((s: any) => s.risk_level === 'high').length;
        const criticalRiskSuppliers = suppliers.filter((s: any) => s.risk_level === 'critical').length;
        // Count unique suppliers that have at least one expired cert (more meaningful than total certs)
        const expiredSupplierIds = new Set(expiredCertList.map(c => c.supplier_id));
        const expiredCerts = expiredSupplierIds.size;

        // Awards to high/critical risk — computed from awards data
        const awardsToHighRisk = awards.filter((a: any) => {
          const rl = a.suppliers?.risk_level;
          return rl === 'high' || rl === 'critical';
        }).length;

        // Savings from discounts on quotations
        const totalSavings = (savingsRes.data || []).reduce((sum: number, q: any) => sum + (q.discount || 0), 0);

        // Average RFQ cycle time
        const awardedRfqList = rfqs.filter((r: any) => r.status === 'awarded' && r.created_at && r.updated_at);
        const avgCycleDays = awardedRfqList.length > 0
          ? awardedRfqList.reduce((sum: number, r: any) => {
              const days = (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 86400000;
              return sum + days;
            }, 0) / awardedRfqList.length
          : null;

        // Build recent activity feed
        const activity: { type: string; title: string; time: string; icon: string }[] = [];
        (recentSuppRes.data || []).forEach((s: any) => {
          activity.push({ type: 'supplier', title: `Supplier "${s.company_name}" — ${s.status}`, time: s.created_at, icon: 'building' });
        });
        (recentRfqRes.data || []).forEach((r: any) => {
          activity.push({ type: 'rfq', title: `RFQ "${r.title}" — ${r.status}`, time: r.created_at, icon: 'file' });
        });
        (recentBidRes.data || []).forEach((b: any) => {
          activity.push({ type: 'bidding', title: `Auction "${b.title}" — ${b.status}`, time: b.created_at, icon: 'gavel' });
        });
        activity.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        setKpi({
          totalSuppliers: suppliers.length,
          approvedSuppliers: suppliersByStatus['approved'] || 0,
          pendingSuppliers: (suppliersByStatus['submitted'] || 0) + (suppliersByStatus['review'] || 0),
          highRiskSuppliers,
          criticalRiskSuppliers,
          expiredCerts,
          expiredCertList,
          openRfqs: rfqs.filter((r: any) => r.status === 'published').length,
          draftRfqs: rfqs.filter((r: any) => r.status === 'draft').length,
          pendingBidReview: rfqs.filter((r: any) => r.status === 'closed' || r.workflow_status === 'under_evaluation').length,
          pendingApproval: rfqs.filter((r: any) => r.workflow_status === 'pending_approval').length,
          awardedRfqs: rfqs.filter((r: any) => r.status === 'awarded').length,
          activeBids: bids.filter((b: any) => b.status === 'active').length,
          pendingAwards: awards.filter((a: any) => a.status === 'pending' || a.award_lifecycle_status === 'pending_approval').length,
          awardsToHighRisk,
          totalSavings,
          avgCycleDays,
          suppliersByStatus,
          recentActivity: activity.slice(0, 8),
        });
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchKPIs();

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => fetchKPIs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rfqs' }, () => fetchKPIs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bidding_events' }, () => fetchKPIs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'awards' }, () => fetchKPIs())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const getActivityIcon = (icon: string) => {
    switch (icon) {
      case 'building': return <Building2 className="w-4 h-4 text-primary" />;
      case 'file': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'gavel': return <Gavel className="w-4 h-4 text-orange-500" />;
      default: return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    submitted: 'bg-blue-100 text-blue-800',
    review: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-destructive/10 text-destructive',
    suspended: 'bg-orange-100 text-orange-800',
  };

  const stat = (val: number | null | undefined) => loading ? '...' : (val ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {t('dashboard.welcome')}{profile?.full_name ? `, ${profile.full_name}` : ''}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t('dashboard.overview')}</p>
      </div>

      {/* Primary KPI row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/suppliers')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.totalSuppliers')}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat(kpi?.totalSuppliers)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {loading ? '' : t('dashboard.suppliersSub', { approved: kpi?.approvedSuppliers, pending: kpi?.pendingSuppliers })}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/rfq')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.openRfqs')}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat(kpi?.openRfqs)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {loading ? '' : t('dashboard.rfqsSub', { draft: kpi?.draftRfqs, awarded: kpi?.awardedRfqs })}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/rfq')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.pendingBidReview')}</CardTitle>
            <BarChart2 className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stat(kpi?.pendingBidReview)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {loading ? '' : t('dashboard.pendingBidReviewSub', { count: kpi?.pendingApproval })}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/awards')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.pendingAwards')}</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat(kpi?.pendingAwards)}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('dashboard.pendingAwardsSub')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Risk & Compliance KPI row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-orange-200" onClick={() => navigate('/vendor-risk')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.highRiskSuppliers')}</CardTitle>
            <ShieldAlert className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stat(kpi?.highRiskSuppliers)}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('dashboard.highRiskSub')}</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow border-red-200" onClick={() => navigate('/vendor-risk')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.criticalRisk')}</CardTitle>
            <ShieldX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stat(kpi?.criticalRiskSuppliers)}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('dashboard.criticalSub')}</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-amber-200"
          onClick={() => setExpiredOpen(true)}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.expiredCerts')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stat(kpi?.expiredCerts)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpi && kpi.expiredCertList.length > 0
                ? `${kpi.expiredCertList.length} ใบรับรอง · คลิกเพื่อดูรายการ`
                : t('dashboard.expiredSub')}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow border-orange-200" onClick={() => navigate('/awards')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.awardsToHighRisk')}</CardTitle>
            <Trophy className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stat(kpi?.awardsToHighRisk)}</div>
            <p className="text-xs text-muted-foreground mt-1">{t('dashboard.awardsHighRiskSub')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Savings & Cycle Time */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.totalSavings')}</CardTitle>
            <TrendingDown className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {loading ? '...' : `$${(kpi?.totalSavings || 0).toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('dashboard.savingsSub')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('dashboard.avgCycleTime')}</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {loading ? '...' : kpi?.avgCycleDays != null ? t('dashboard.days', { count: kpi.avgCycleDays.toFixed(1) }) : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('dashboard.avgCycleSub')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Second section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Supplier Breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-base">{t('dashboard.suppliersByStatus')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : kpi && Object.keys(kpi.suppliersByStatus).length > 0 ? (
              Object.entries(kpi.suppliersByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[status] || 'bg-muted'} variant="secondary">{status}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(count / (kpi.totalSuppliers || 1)) * 100}%` }} />
                    </div>
                    <span className="text-sm font-semibold w-8 text-right">{count}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('dashboard.noSuppliersYet')}</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4" /> {t('dashboard.recentActivity')}</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : kpi && kpi.recentActivity.length > 0 ? (
              <div className="space-y-3">
                {kpi.recentActivity.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                    <div className="mt-0.5 w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {getActivityIcon(a.icon)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.time).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('dashboard.noActivity')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expired Certificates Dialog */}
      <Dialog open={expiredOpen} onOpenChange={setExpiredOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              ใบรับรองที่หมดอายุ
            </DialogTitle>
            <DialogDescription>
              {kpi && kpi.expiredCertList.length > 0
                ? `พบ ${kpi.expiredCertList.length} ใบรับรองจาก ${kpi.expiredCerts} บริษัท ที่หมดอายุแล้ว — ต้องดำเนินการต่ออายุก่อนทำธุรกรรม`
                : 'ไม่พบใบรับรองที่หมดอายุ'}
            </DialogDescription>
          </DialogHeader>

          {kpi && kpi.expiredCertList.length > 0 ? (
            <div className="overflow-y-auto flex-1 -mx-6 px-6">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b z-10">
                  <tr className="text-muted-foreground text-xs">
                    <th className="text-left p-2 font-medium">บริษัท</th>
                    <th className="text-left p-2 font-medium">ประเภท</th>
                    <th className="text-left p-2 font-medium">เลขที่</th>
                    <th className="text-left p-2 font-medium">หมดอายุ</th>
                    <th className="text-right p-2 font-medium">เกินกำหนด</th>
                    <th className="p-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {kpi.expiredCertList.map((c) => (
                    <tr key={c.cert_id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-2 font-medium">{c.company_name}</td>
                      <td className="p-2">
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {c.certificate_type}
                        </Badge>
                      </td>
                      <td className="p-2 text-muted-foreground font-mono text-xs">
                        {c.certificate_no || '—'}
                      </td>
                      <td className="p-2 text-red-700 font-medium">
                        {new Date(c.expiry_date).toLocaleDateString('th-TH')}
                      </td>
                      <td className="p-2 text-right">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.daysOverdue > 90 ? 'bg-red-100 text-red-700' :
                          c.daysOverdue > 30 ? 'bg-amber-100 text-amber-700' :
                                               'bg-yellow-100 text-yellow-700'
                        }`}>
                          {c.daysOverdue} วัน
                        </span>
                      </td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setExpiredOpen(false);
                            navigate(`/suppliers/${c.supplier_id}`);
                          }}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          เปิด
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileBadge className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">ไม่พบใบรับรองที่หมดอายุ</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
