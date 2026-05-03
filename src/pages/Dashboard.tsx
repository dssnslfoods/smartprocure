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
  openNcrs: number;
  overdueNcrs: number;
  criticalNcrs: number;
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
  const isSupplier = roles.includes('supplier');
  const mySupplierId = profile?.supplier_id ?? null;
  const [kpi, setKpi] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expiredOpen, setExpiredOpen] = useState(false);

  useEffect(() => {
    // Supplier role: skip global fetch — supplier data is rendered by <SupplierDashboard/>
    if (isSupplier) { setLoading(false); return; }
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

        // Pull NCR aggregate stats — supplier risk-history signal
        const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const ncrRes = await supabase.from('supplier_ncrs').select('id, status, severity, detected_date');
        const ncrRows = ncrRes.data || [];
        const openNcrs     = ncrRows.filter((r: any) => r.status === 'open' || r.status === 'in_progress').length;
        const overdueNcrs  = ncrRows.filter((r: any) => (r.status === 'open' || r.status === 'in_progress') && r.detected_date < cutoff30).length;
        const criticalNcrs = ncrRows.filter((r: any) => r.severity === 'critical' && (r.status === 'open' || r.status === 'in_progress')).length;

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
          openNcrs,
          overdueNcrs,
          criticalNcrs,
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
  }, [isSupplier]);

  // After hooks: render supplier-scoped dashboard for supplier role.
  if (isSupplier) {
    return <SupplierDashboard supplierId={mySupplierId} fullName={profile?.full_name || ''} />;
  }

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

      {/* NCR row — non-conformance signal */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-blue-200" onClick={() => navigate('/ncrs')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">NCR ที่เปิดอยู่</CardTitle>
            <AlertTriangle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stat(kpi?.openNcrs)}</div>
            <p className="text-xs text-muted-foreground mt-1">รวมที่ยังไม่ปิด CAPA</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-amber-200" onClick={() => navigate('/ncrs')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">NCR ค้างเกิน 30 วัน</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stat(kpi?.overdueNcrs)}</div>
            <p className="text-xs text-muted-foreground mt-1">CAPA ยังไม่ปิดเกินกำหนด</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-red-200" onClick={() => navigate('/ncrs')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">NCR ระดับ Critical</CardTitle>
            <ShieldX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stat(kpi?.criticalNcrs)}</div>
            <p className="text-xs text-muted-foreground mt-1">ต้องตอบสนองทันที</p>
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

// ───────────────────────── Supplier-scoped dashboard ─────────────────────────
// Suppliers only see their OWN data. No cross-supplier visibility.
interface SupplierKPI {
  myStatus:           string;
  myRiskLevel:        string | null;
  myCompanyName:      string;
  invitesOpen:        number;
  invitesPending:     number;
  invitesSubmitted:   number;
  myQuotations:       number;
  myAwards:           number;
  myAwardedValue:     number;
  myExpiredCerts:     ExpiredCertRow[];
  myExpiringCerts:    ExpiredCertRow[];   // ≤30 days
  recentInvites:      { id: string; title: string; status: string; due_date: string | null; created_at: string }[];
  recentQuotations:   { id: string; rfq_id: string | null; total: number | null; status: string; created_at: string; rfq_title?: string }[];
}

function SupplierDashboard({ supplierId, fullName }: { supplierId: string | null; fullName: string }) {
  const navigate = useNavigate();
  const [kpi, setKpi] = useState<SupplierKPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [certDialogMode, setCertDialogMode] = useState<'expired' | 'expiring' | null>(null);

  useEffect(() => {
    if (!supplierId) { setLoading(false); return; }
    (async () => {
      try {
        const todayIso = new Date().toISOString().slice(0, 10);
        const in30Iso  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

        const [meRes, invRes, qRes, awardsRes, certsRes] = await Promise.all([
          supabase.from('suppliers').select('id, company_name, status, risk_level').eq('id', supplierId).maybeSingle(),
          supabase.from('rfq_suppliers')
            .select('id, status, invited_at, rfqs(id, title, status, due_date, created_at)')
            .eq('supplier_id', supplierId),
          supabase.from('quotations')
            .select('id, total_amount, status, created_at, rfq_id, rfqs(title)')
            .eq('supplier_id', supplierId)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase.from('awards')
            .select('id, status, final_amount, amount')
            .eq('supplier_id', supplierId),
          supabase.from('supplier_certificates')
            .select('id, supplier_id, certificate_type, certificate_no, expiry_date')
            .eq('supplier_id', supplierId),
        ]);

        const me      = meRes.data || { company_name: '', status: 'unknown', risk_level: null };
        const invites = invRes.data || [];
        const quotes  = qRes.data || [];
        const awards  = awardsRes.data || [];
        const certs   = certsRes.data || [];

        const expired:  ExpiredCertRow[] = [];
        const expiring: ExpiredCertRow[] = [];
        certs.forEach((c: any) => {
          if (!c.expiry_date) return;
          const row: ExpiredCertRow = {
            cert_id:          c.id,
            supplier_id:      c.supplier_id,
            company_name:     me.company_name || '',
            certificate_type: c.certificate_type,
            certificate_no:   c.certificate_no,
            expiry_date:      c.expiry_date,
            daysOverdue:      Math.floor((Date.now() - new Date(c.expiry_date).getTime()) / 86400000),
          };
          if (c.expiry_date < todayIso) expired.push(row);
          else if (c.expiry_date <= in30Iso) expiring.push(row);
        });

        const recentInvites = invites
          .filter((i: any) => i.rfqs)
          .sort((a: any, b: any) => (b.invited_at || '').localeCompare(a.invited_at || ''))
          .slice(0, 5)
          .map((i: any) => ({
            id: i.rfqs.id,
            title: i.rfqs.title,
            status: i.status,
            due_date: i.rfqs.due_date,
            created_at: i.invited_at || i.rfqs.created_at,
          }));

        setKpi({
          myStatus:        me.status || 'unknown',
          myRiskLevel:     me.risk_level || null,
          myCompanyName:   me.company_name || fullName,
          invitesOpen:     invites.filter((i: any) => i.rfqs?.status === 'published' && i.status !== 'submitted').length,
          invitesPending:  invites.filter((i: any) => i.status === 'pending' || i.status === 'invited').length,
          invitesSubmitted:invites.filter((i: any) => i.status === 'submitted').length,
          myQuotations:    quotes.length,
          myAwards:        awards.filter((a: any) => a.status === 'awarded' || a.status === 'accepted').length,
          myAwardedValue:  awards.reduce((s: number, a: any) => s + (Number(a.final_amount) || Number(a.amount) || 0), 0),
          myExpiredCerts:  expired,
          myExpiringCerts: expiring,
          recentInvites,
          recentQuotations: quotes.map((q: any) => ({
            id: q.id, rfq_id: q.rfq_id || null, total: q.total_amount, status: q.status, created_at: q.created_at,
            rfq_title: q.rfqs?.title || '',
          })),
        });
      } catch (e) {
        console.error('SupplierDashboard fetch error:', e);
      } finally { setLoading(false); }
    })();
  }, [supplierId, fullName]);

  const stat = (v: number | null | undefined) => loading ? '...' : (v ?? 0);

  const statusBadge: Record<string, string> = {
    approved:  'bg-green-100 text-green-800',
    submitted: 'bg-blue-100 text-blue-800',
    review:    'bg-yellow-100 text-yellow-800',
    rejected:  'bg-destructive/10 text-destructive',
    suspended: 'bg-orange-100 text-orange-800',
    draft:     'bg-muted text-muted-foreground',
    unknown:   'bg-muted text-muted-foreground',
  };
  const riskBadge: Record<string, string> = {
    low:      'bg-green-100 text-green-800',
    medium:   'bg-yellow-100 text-yellow-800',
    high:     'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          ยินดีต้อนรับ{kpi?.myCompanyName ? `, ${kpi.myCompanyName}` : (fullName ? `, ${fullName}` : '')}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">ภาพรวมข้อมูลของคุณในระบบ NSL Foods Procurement</p>
      </div>

      {/* Personal status row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/supplier-portal')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">สถานะของฉัน</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge className={statusBadge[kpi?.myStatus || 'unknown']} variant="secondary">
              {kpi?.myStatus || '...'}
            </Badge>
            {kpi?.myRiskLevel && (
              <Badge className={`ml-2 ${riskBadge[kpi.myRiskLevel] || 'bg-muted'}`} variant="secondary">
                ความเสี่ยง: {kpi.myRiskLevel}
              </Badge>
            )}
            <p className="text-xs text-muted-foreground mt-2">คลิกเพื่อดู Supplier Portal</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/rfq')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">คำเชิญ RFQ ที่เปิดอยู่</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat(kpi?.invitesOpen)}</div>
            <p className="text-xs text-muted-foreground mt-1">รอเสนอราคา {kpi?.invitesPending ?? 0} ใบ</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/rfq')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ใบเสนอราคาที่ส่งแล้ว</CardTitle>
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat(kpi?.invitesSubmitted)}</div>
            <p className="text-xs text-muted-foreground mt-1">รวม {kpi?.myQuotations ?? 0} ใบในระบบ</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/awards')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">งานที่ได้รับ</CardTitle>
            <Award className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{stat(kpi?.myAwards)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              มูลค่ารวม ${(kpi?.myAwardedValue || 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Certificates row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-amber-200"
          onClick={() => setCertDialogMode('expired')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ใบรับรองที่หมดอายุ</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stat(kpi?.myExpiredCerts.length)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {(kpi?.myExpiredCerts.length ?? 0) > 0 ? 'คลิกเพื่อดูรายการ — ต้องต่ออายุก่อนเสนอราคา' : 'ใบรับรองทั้งหมดอยู่ในเกณฑ์'}
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-yellow-200"
          onClick={() => setCertDialogMode('expiring')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ใบรับรองใกล้หมดอายุ (≤30 วัน)</CardTitle>
            <FileBadge className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stat(kpi?.myExpiringCerts.length)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {(kpi?.myExpiringCerts.length ?? 0) > 0 ? 'คลิกเพื่อดูรายการ' : 'เตรียมต่ออายุล่วงหน้า'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity — supplier scope */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">คำเชิญ RFQ ล่าสุด</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : kpi && kpi.recentInvites.length > 0 ? (
              <div className="space-y-3">
                {kpi.recentInvites.map(r => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/rfq/${r.id}`)}
                    className="w-full flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0 text-left hover:bg-muted/40 rounded-md px-2 -mx-2 py-1 transition-colors"
                  >
                    <div className="mt-0.5 w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.status} · {r.due_date ? `ครบกำหนด ${new Date(r.due_date).toLocaleDateString('th-TH')}` : 'ไม่ระบุกำหนด'}
                      </p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-2" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ยังไม่มีคำเชิญ RFQ</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">ใบเสนอราคาล่าสุดของฉัน</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : kpi && kpi.recentQuotations.length > 0 ? (
              <div className="space-y-3">
                {kpi.recentQuotations.map(q => (
                  <button
                    key={q.id}
                    onClick={() => q.rfq_id && navigate(`/rfq/${q.rfq_id}`)}
                    disabled={!q.rfq_id}
                    className="w-full flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0 text-left hover:bg-muted/40 rounded-md px-2 -mx-2 py-1 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
                  >
                    <div className="mt-0.5 w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <BarChart2 className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{q.rfq_title || `Quotation ${q.id.slice(0, 8)}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {q.status} · ${(q.total || 0).toLocaleString()} · {new Date(q.created_at).toLocaleDateString('th-TH')}
                      </p>
                    </div>
                    {q.rfq_id && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-2" />}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ยังไม่ได้ส่งใบเสนอราคา</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Certificate dialog — supplier sees only their own certs */}
      <Dialog open={certDialogMode !== null} onOpenChange={(o) => !o && setCertDialogMode(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {certDialogMode === 'expired'
                ? <AlertTriangle className="h-5 w-5 text-red-500" />
                : <FileBadge className="h-5 w-5 text-yellow-500" />}
              {certDialogMode === 'expired' ? 'ใบรับรองที่หมดอายุ' : 'ใบรับรองใกล้หมดอายุ (≤30 วัน)'}
            </DialogTitle>
            <DialogDescription>
              {certDialogMode === 'expired'
                ? 'ต้องดำเนินการต่ออายุก่อนเสนอราคาในระบบ'
                : 'เตรียมต่ออายุล่วงหน้าเพื่อหลีกเลี่ยงผลกระทบต่อการเสนอราคา'}
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const list = certDialogMode === 'expired'
              ? (kpi?.myExpiredCerts || [])
              : (kpi?.myExpiringCerts || []);
            if (list.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileBadge className="h-10 w-10 mb-2 opacity-30" />
                  <p className="text-sm">ไม่พบใบรับรองในรายการนี้</p>
                </div>
              );
            }
            return (
              <div className="overflow-y-auto flex-1 -mx-6 px-6">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b z-10">
                    <tr className="text-muted-foreground text-xs">
                      <th className="text-left p-2 font-medium">ประเภท</th>
                      <th className="text-left p-2 font-medium">เลขที่</th>
                      <th className="text-left p-2 font-medium">หมดอายุ</th>
                      <th className="text-right p-2 font-medium">
                        {certDialogMode === 'expired' ? 'เกินกำหนด' : 'เหลือ'}
                      </th>
                      <th className="p-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(c => {
                      const days = certDialogMode === 'expired' ? c.daysOverdue : -c.daysOverdue;
                      return (
                        <tr key={c.cert_id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2">
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {c.certificate_type}
                            </Badge>
                          </td>
                          <td className="p-2 text-muted-foreground font-mono text-xs">
                            {c.certificate_no || '—'}
                          </td>
                          <td className={`p-2 font-medium ${certDialogMode === 'expired' ? 'text-red-700' : 'text-yellow-700'}`}>
                            {new Date(c.expiry_date).toLocaleDateString('th-TH')}
                          </td>
                          <td className="p-2 text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              certDialogMode === 'expired'
                                ? (days > 90 ? 'bg-red-100 text-red-700' : days > 30 ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700')
                                : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {days} วัน
                            </span>
                          </td>
                          <td className="p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => { setCertDialogMode(null); navigate('/supplier-portal'); }}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              จัดการ
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
