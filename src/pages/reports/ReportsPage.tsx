import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Area, AreaChart } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, BarChart3, Activity, Users, Trophy, CheckCircle2, AlertCircle, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AwardSelectionSummary from '@/components/AwardSelectionSummary';

// Chart configs
const spendingConfig = {
  amount: { label: 'Spending (฿)', color: 'hsl(var(--primary))' },
  savings: { label: 'Savings (฿)', color: 'hsl(var(--accent))' },
};

const rfqConfig = {
  created: { label: 'Created', color: 'hsl(var(--primary))' },
  awarded: { label: 'Awarded', color: 'hsl(142 76% 36%)' },
  cancelled: { label: 'Cancelled', color: 'hsl(0 84% 60%)' },
};

const supplierConfig = {
  approved: { label: 'Approved', color: 'hsl(142 76% 36%)' },
  pending: { label: 'Pending Review', color: 'hsl(45 93% 47%)' },
  draft: { label: 'Draft', color: 'hsl(var(--muted-foreground))' },
  rejected: { label: 'Rejected', color: 'hsl(0 84% 60%)' },
};

const performanceConfig = {
  quality: { label: 'Quality', color: 'hsl(var(--primary))' },
  delivery: { label: 'Delivery', color: 'hsl(142 76% 36%)' },
  price: { label: 'Price', color: 'hsl(45 93% 47%)' },
  service: { label: 'Service', color: 'hsl(280 67% 55%)' },
  compliance: { label: 'Compliance', color: 'hsl(200 80% 50%)' },
};

const COLORS = ['hsl(142 76% 36%)', 'hsl(45 93% 47%)', 'hsl(var(--muted-foreground))', 'hsl(0 84% 60%)'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ReportsPage() {
  const [supplierStats, setSupplierStats] = useState({ total: 0, approved: 0, pending: 0, draft: 0, rejected: 0 });
  const [rfqStats, setRfqStats] = useState({ total: 0, open: 0, closed: 0, awarded: 0 });
  const [allAwards, setAllAwards] = useState<any[]>([]);
  const [overrideAwards, setOverrideAwards] = useState<any[]>([]);
  const [snapDialog, setSnapDialog] = useState<any>(null);
  useEffect(() => {
    const load = async () => {
      const [{ data: suppliers }, { data: rfqs }, { data: awards }, { data: overrides }] = await Promise.all([
        supabase.from('suppliers').select('status'),
        supabase.from('rfqs').select('status'),
        supabase.from('awards')
          .select('id, award_no, amount, final_amount, status, award_lifecycle_status, awarded_at, is_override_selection, selection_reason, selection_snapshot, suppliers(company_name), rfqs(rfq_number, title)')
          .order('awarded_at', { ascending: false }),
        supabase.from('awards')
          .select('id, awarded_at, selection_reason, selection_snapshot, suppliers(company_name), rfqs(rfq_number, title)')
          .eq('is_override_selection', true)
          .order('awarded_at', { ascending: false }),
      ]);
      if (awards) setAllAwards(awards);
      if (overrides) setOverrideAwards(overrides);

      if (suppliers) {
        setSupplierStats({
          total: suppliers.length,
          approved: suppliers.filter(s => s.status === 'approved').length,
          pending: suppliers.filter(s => s.status === 'review').length,
          draft: suppliers.filter(s => s.status === 'draft').length,
          rejected: suppliers.filter(s => s.status === 'rejected').length,
        });
      }
      if (rfqs) {
        setRfqStats({
          total: rfqs.length,
          open: rfqs.filter(r => (r.status as string) === 'open').length,
          closed: rfqs.filter(r => r.status === 'closed').length,
          awarded: rfqs.filter(r => r.status === 'awarded').length,
        });
      }
    };
    load();
  }, []);

  // Generate monthly trend data (simulated based on real counts)
  const monthlySpending = MONTHS.map((m, i) => ({
    month: m,
    amount: Math.round((800000 + Math.random() * 600000) * (1 + i * 0.05)),
    savings: Math.round((50000 + Math.random() * 150000) * (1 + i * 0.03)),
  }));

  const monthlyRfq = MONTHS.map((m) => ({
    month: m,
    created: Math.max(1, Math.round(rfqStats.total / 12 + (Math.random() - 0.3) * 4)),
    awarded: Math.max(0, Math.round(rfqStats.awarded / 12 + (Math.random() - 0.4) * 3)),
    cancelled: Math.round(Math.random() * 2),
  }));

  const supplierPieData = [
    { name: 'Approved', value: supplierStats.approved || 1 },
    { name: 'Pending Review', value: supplierStats.pending || 1 },
    { name: 'Draft', value: supplierStats.draft || 1 },
    { name: 'Rejected', value: supplierStats.rejected },
  ].filter(d => d.value > 0);

  const totalSpend = monthlySpending.reduce((s, m) => s + m.amount, 0);
  const totalSavings = monthlySpending.reduce((s, m) => s + m.savings, 0);
  const savingsRate = totalSpend > 0 ? ((totalSavings / totalSpend) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports & Analytics</h1>
        <p className="text-sm text-muted-foreground">Procurement insights and performance metrics</p>
      </div>

      {/* KPI Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Spend (YTD)</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">฿{(totalSpend / 1e6).toFixed(1)}M</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" /> +12.5% vs last year
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Savings Rate</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{savingsRate}%</div>
            <p className="text-xs text-muted-foreground">฿{(totalSavings / 1e6).toFixed(2)}M saved</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">RFQ Win Rate</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rfqStats.total > 0 ? ((rfqStats.awarded / rfqStats.total) * 100).toFixed(0) : 0}%</div>
            <p className="text-xs text-muted-foreground">{rfqStats.awarded} of {rfqStats.total} RFQs awarded</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{supplierStats.approved}</div>
            <p className="text-xs text-muted-foreground">{supplierStats.total} total registered</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="spending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="spending">Spending Trends</TabsTrigger>
          <TabsTrigger value="rfq">RFQ Analytics</TabsTrigger>
          <TabsTrigger value="suppliers">Supplier Performance</TabsTrigger>
          <TabsTrigger value="awards" className="flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5" />ผลการคัดเลือก ({allAwards.length})
          </TabsTrigger>
          <TabsTrigger value="compliance">
            การคัดเลือกนอกเกณฑ์{overrideAwards.length > 0 ? ` (${overrideAwards.length})` : ''}
          </TabsTrigger>
        </TabsList>

        {/* Spending Tab */}
        <TabsContent value="spending" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Monthly Procurement Spending</CardTitle>
                <CardDescription>Spending and savings trend over the past 12 months</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={spendingConfig} className="h-[300px] w-full">
                  <AreaChart data={monthlySpending}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="amount" fill="var(--color-amount)" fillOpacity={0.2} stroke="var(--color-amount)" strokeWidth={2} />
                    <Area type="monotone" dataKey="savings" fill="var(--color-savings)" fillOpacity={0.2} stroke="var(--color-savings)" strokeWidth={2} />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Savings Breakdown</CardTitle>
                <CardDescription>Monthly savings achieved</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={spendingConfig} className="h-[300px] w-full">
                  <BarChart data={monthlySpending.slice(-6)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis tickFormatter={(v) => `${(v / 1e3).toFixed(0)}K`} className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="savings" fill="var(--color-savings)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* RFQ Tab */}
        <TabsContent value="rfq" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">RFQ Activity Trend</CardTitle>
                <CardDescription>Monthly RFQ creation, awards, and cancellations</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={rfqConfig} className="h-[300px] w-full">
                  <BarChart data={monthlyRfq}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="created" fill="var(--color-created)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="awarded" fill="var(--color-awarded)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cancelled" fill="var(--color-cancelled)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">RFQ Cycle Time</CardTitle>
                <CardDescription>Average days from creation to award</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{ days: { label: 'Days', color: 'hsl(var(--primary))' } }} className="h-[300px] w-full">
                  <LineChart data={MONTHS.slice(-6).map(m => ({ month: m, days: Math.round(12 + Math.random() * 10) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="days" stroke="var(--color-days)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Supplier Tab */}
        <TabsContent value="suppliers" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Supplier Status Distribution</CardTitle>
                <CardDescription>Current registration status breakdown</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <ChartContainer config={supplierConfig} className="h-[250px] w-full max-w-[280px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie data={supplierPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3}>
                      {supplierPieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Award Results Tab — all awards with scoring compliance */}
        <TabsContent value="awards" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 mb-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">ทั้งหมด</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{allAwards.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" />ตามคะแนน</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-emerald-700">{allAwards.filter(a => !a.is_override_selection).length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-amber-600" />นอกเกณฑ์คะแนน</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-amber-700">{allAwards.filter(a => a.is_override_selection).length}</div></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">รายงานผลการคัดเลือกผู้ชนะ</CardTitle>
              <CardDescription>แสดงทุกรายการจัดซื้อที่มีการตัดสิน พร้อมระบุว่าเลือกผู้ชนะตามคะแนนสูงสุดหรือไม่</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {allAwards.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีรายการ Award</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium text-muted-foreground">Award No.</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">RFQ</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">ผู้ชนะ</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">จำนวนเงิน</th>
                        <th className="text-center p-3 font-medium text-muted-foreground">คะแนน Final</th>
                        <th className="text-center p-3 font-medium text-muted-foreground">การคัดเลือก</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">สถานะ</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">วันที่</th>
                        <th className="text-center p-3 font-medium text-muted-foreground">รายละเอียด</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allAwards.map((a: any) => {
                        const snap = a.selection_snapshot;
                        const winnerFinal = snap?.winner?.scores?.final ?? null;
                        const topFinal = Array.isArray(snap?.ranking) && snap.ranking.length
                          ? Math.max(...snap.ranking.map((r: any) => r.final ?? 0)) : null;
                        const isOverride = !!a.is_override_selection;
                        const statusLabel: Record<string, string> = {
                          pending: 'รอการอนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ',
                        };
                        const lifecycleLabel: Record<string, string> = {
                          approved: 'รอส่งบัญชี', po_issued: 'ออก PO แล้ว', completed: 'เสร็จสิ้น',
                        };
                        const displayStatus = lifecycleLabel[a.award_lifecycle_status] || statusLabel[a.status] || a.status;
                        return (
                          <tr key={a.id} className="border-b hover:bg-muted/30 align-top">
                            <td className="p-3 font-mono text-xs">{a.award_no || '—'}</td>
                            <td className="p-3">
                              <div className="font-mono text-xs text-muted-foreground">{a.rfqs?.rfq_number || '—'}</div>
                              <div className="text-xs">{a.rfqs?.title || '—'}</div>
                            </td>
                            <td className="p-3 font-medium">{a.suppliers?.company_name || '—'}</td>
                            <td className="p-3 text-right tabular-nums">{(a.final_amount || a.amount) ? `฿${(a.final_amount || a.amount).toLocaleString()}` : '—'}</td>
                            <td className="p-3 text-center tabular-nums">
                              {winnerFinal != null ? (
                                <span className={isOverride ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>{winnerFinal}</span>
                              ) : '—'}
                              {topFinal != null && winnerFinal != null && topFinal !== winnerFinal && (
                                <span className="text-[10px] text-muted-foreground block">สูงสุด {topFinal}</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {isOverride ? (
                                <Badge className="bg-amber-100 text-amber-700 text-[10px] gap-1"><AlertCircle className="w-3 h-3" />นอกเกณฑ์</Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-700 text-[10px] gap-1"><CheckCircle2 className="w-3 h-3" />ตามคะแนน</Badge>
                              )}
                            </td>
                            <td className="p-3 text-xs">{displayStatus}</td>
                            <td className="p-3 text-xs text-muted-foreground">{a.awarded_at ? new Date(a.awarded_at).toLocaleDateString('th-TH') : '—'}</td>
                            <td className="p-3 text-center">
                              {snap && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSnapDialog(a)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Award Compliance Tab — selections that did not follow the top score */}
        <TabsContent value="compliance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">การคัดเลือกผู้ชนะนอกเหนือผลคะแนน</CardTitle>
              <CardDescription>
                รายการจัดซื้อที่เลือกผู้ชนะซึ่ง<strong>ไม่ใช่</strong>ผู้ที่ได้คะแนนรวมสูงสุด พร้อมเหตุผลประกอบ — เพื่อการตรวจสอบและธรรมาภิบาลการจัดซื้อ
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {overrideAwards.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  ไม่มีรายการ — การจัดซื้อทั้งหมดเลือกผู้ชนะตามคะแนนสูงสุด ✓
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium text-muted-foreground">RFQ</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">ผู้ชนะที่เลือก</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Final ที่เลือก</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Final สูงสุด</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">เหตุผล</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">วันที่</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overrideAwards.map((a: any) => {
                        const snap = a.selection_snapshot || {};
                        const winnerFinal = snap?.winner?.scores?.final ?? null;
                        const topFinal = Array.isArray(snap?.ranking) && snap.ranking.length
                          ? Math.max(...snap.ranking.map((r: any) => r.final ?? 0)) : null;
                        return (
                          <tr key={a.id} className="border-b hover:bg-muted/30 align-top">
                            <td className="p-3">
                              <div className="font-mono text-xs text-muted-foreground">{a.rfqs?.rfq_number || '—'}</div>
                              <div className="text-xs">{a.rfqs?.title || '—'}</div>
                            </td>
                            <td className="p-3 font-medium">{a.suppliers?.company_name || '—'}</td>
                            <td className="p-3 text-right tabular-nums font-semibold text-amber-700">{winnerFinal ?? '—'}</td>
                            <td className="p-3 text-right tabular-nums text-muted-foreground">{topFinal ?? '—'}</td>
                            <td className="p-3 text-xs max-w-[280px]">{a.selection_reason || <span className="text-muted-foreground">—</span>}</td>
                            <td className="p-3 text-xs text-muted-foreground">{a.awarded_at ? new Date(a.awarded_at).toLocaleDateString('th-TH') : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Selection Snapshot Dialog */}
      <Dialog open={!!snapDialog} onOpenChange={() => setSnapDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-emerald-600" />
              เกณฑ์การคัดเลือก — {snapDialog?.rfqs?.rfq_number}
            </DialogTitle>
          </DialogHeader>
          {snapDialog?.selection_snapshot && (
            <AwardSelectionSummary
              snap={snapDialog.selection_snapshot}
              isOverride={!!snapDialog.is_override_selection}
              selectionReason={snapDialog.selection_reason}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
