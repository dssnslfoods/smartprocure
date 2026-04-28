import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, FileText, Gavel, Award, Star, Clock, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface KPIData {
  totalSuppliers: number;
  approvedSuppliers: number;
  pendingSuppliers: number;
  openRfqs: number;
  draftRfqs: number;
  activeBids: number;
  pendingAwards: number;
  avgScore: number;
  topSuppliers: { company_name: string; overall_score: number }[];
  suppliersByStatus: Record<string, number>;
  recentActivity: { type: string; title: string; time: string; icon: string }[];
}

export default function Dashboard() {
  const { profile, roles } = useAuth();
  const navigate = useNavigate();
  const [kpi, setKpi] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchKPIs = async () => {
      const [
        suppliersRes,
        rfqRes,
        biddingRes,
        awardsRes,
        scoresRes,
        recentSuppRes,
        recentRfqRes,
        recentBidRes,
      ] = await Promise.all([
        supabase.from('suppliers').select('id, status'),
        supabase.from('rfqs').select('id, status'),
        supabase.from('bidding_events').select('id, status'),
        supabase.from('awards').select('id, status'),
        supabase.from('supplier_score_summary').select('supplier_id, overall_score, suppliers(company_name)').order('overall_score', { ascending: false }).limit(5),
        supabase.from('suppliers').select('id, company_name, status, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('rfqs').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('bidding_events').select('id, title, status, created_at').order('created_at', { ascending: false }).limit(3),
      ]);

      const suppliers = suppliersRes.data || [];
      const rfqs = rfqRes.data || [];
      const bids = biddingRes.data || [];
      const awards = awardsRes.data || [];
      const scores = scoresRes.data || [];

      const suppliersByStatus: Record<string, number> = {};
      suppliers.forEach((s: any) => { suppliersByStatus[s.status] = (suppliersByStatus[s.status] || 0) + 1; });

      const topSuppliers = scores.map((s: any) => ({
        company_name: s.suppliers?.company_name || 'Unknown',
        overall_score: s.overall_score || 0,
      }));

      const avgScore = topSuppliers.length > 0
        ? topSuppliers.reduce((sum: number, s: any) => sum + s.overall_score, 0) / topSuppliers.length
        : 0;

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
        openRfqs: rfqs.filter((r: any) => r.status === 'published').length,
        draftRfqs: rfqs.filter((r: any) => r.status === 'draft').length,
        activeBids: bids.filter((b: any) => b.status === 'active').length,
        pendingAwards: awards.filter((a: any) => a.status === 'pending').length,
        avgScore,
        topSuppliers,
        suppliersByStatus,
        recentActivity: activity.slice(0, 8),
      });
      setLoading(false);
    };

    fetchKPIs();

    // Real-time updates
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => fetchKPIs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rfqs' }, () => fetchKPIs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bidding_events' }, () => fetchKPIs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'awards' }, () => fetchKPIs())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const getScoreColor = (s: number) => {
    if (s >= 4) return 'text-green-600';
    if (s >= 3) return 'text-blue-600';
    if (s >= 2) return 'text-yellow-600';
    return 'text-destructive';
  };

  const getBarColor = (s: number) => {
    if (s >= 4) return 'bg-green-500';
    if (s >= 3) return 'bg-blue-500';
    if (s >= 2) return 'bg-yellow-500';
    return 'bg-destructive';
  };

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Here's your procurement overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/suppliers')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Suppliers</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : kpi?.totalSuppliers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {loading ? '' : `${kpi?.approvedSuppliers} approved · ${kpi?.pendingSuppliers} pending`}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/rfq')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open RFQs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : kpi?.openRfqs}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {loading ? '' : `${kpi?.draftRfqs} draft`}
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/bidding')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Auctions</CardTitle>
            <Gavel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : kpi?.activeBids}</div>
            <p className="text-xs text-muted-foreground mt-1">Live reverse auctions</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/awards')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Awards</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : kpi?.pendingAwards}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
          </CardContent>
        </Card>
      </div>

      {/* Second Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Supplier Breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-base">Suppliers by Status</CardTitle></CardHeader>
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
              <p className="text-sm text-muted-foreground">No suppliers yet</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4" /> Recent Activity</CardTitle>
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
              <p className="text-sm text-muted-foreground">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Suppliers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Star className="w-4 h-4" /> Top Rated Suppliers</CardTitle>
            {kpi && kpi.avgScore > 0 && (
              <span className="text-sm text-muted-foreground">Avg: <span className={`font-semibold ${getScoreColor(kpi.avgScore)}`}>{kpi.avgScore.toFixed(2)}/5</span></span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : kpi && kpi.topSuppliers.length > 0 ? (
            <div className="space-y-3">
              {kpi.topSuppliers.map((s, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-yellow-100 text-yellow-800' : i === 1 ? 'bg-gray-100 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate">{s.company_name}</span>
                      <span className={`text-sm font-bold ${getScoreColor(s.overall_score)}`}>{s.overall_score.toFixed(2)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${getBarColor(s.overall_score)}`} style={{ width: `${(s.overall_score / 5) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No supplier scores available yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
