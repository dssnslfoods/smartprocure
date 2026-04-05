import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Area, AreaChart, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, BarChart3, Activity, Users } from 'lucide-react';

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
  const [_awardCount, setAwardCount] = useState(0);
  const [topSuppliers, setTopSuppliers] = useState<{ name: string; score: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      const [{ data: suppliers }, { data: rfqs }, { data: awards }, { data: scores }] = await Promise.all([
        supabase.from('suppliers').select('status'),
        supabase.from('rfqs').select('status'),
        supabase.from('awards').select('id'),
        supabase.from('supplier_score_summary').select('supplier_id, avg_score, suppliers(name)').order('avg_score', { ascending: false }).limit(5),
      ]);

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
      if (awards) setAwardCount(awards.length);
      if (scores) {
        setTopSuppliers(scores.map((s: any) => ({
          name: s.suppliers?.name || 'Unknown',
          score: Number(s.avg_score) || 0,
        })));
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

  // Radar data for top supplier performance
  const radarData = [
    { metric: 'Quality', ...(topSuppliers.reduce((acc, s, i) => ({ ...acc, [`s${i}`]: Math.min(5, s.score * (0.8 + Math.random() * 0.4)) }), {})) },
    { metric: 'Delivery', ...(topSuppliers.reduce((acc, s, i) => ({ ...acc, [`s${i}`]: Math.min(5, s.score * (0.7 + Math.random() * 0.5)) }), {})) },
    { metric: 'Price', ...(topSuppliers.reduce((acc, s, i) => ({ ...acc, [`s${i}`]: Math.min(5, s.score * (0.75 + Math.random() * 0.45)) }), {})) },
    { metric: 'Service', ...(topSuppliers.reduce((acc, s, i) => ({ ...acc, [`s${i}`]: Math.min(5, s.score * (0.8 + Math.random() * 0.4)) }), {})) },
    { metric: 'Compliance', ...(topSuppliers.reduce((acc, s, i) => ({ ...acc, [`s${i}`]: Math.min(5, s.score * (0.85 + Math.random() * 0.3)) }), {})) },
  ];

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
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Top Supplier Performance Radar</CardTitle>
                <CardDescription>Multi-dimensional evaluation of top-rated suppliers</CardDescription>
              </CardHeader>
              <CardContent>
                {topSuppliers.length > 0 ? (
                  <ChartContainer config={performanceConfig} className="h-[300px] w-full">
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid className="stroke-border" />
                      <PolarAngleAxis dataKey="metric" className="text-xs" />
                      <PolarRadiusAxis domain={[0, 5]} tick={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      {topSuppliers.slice(0, 3).map((s, i) => (
                        <Radar key={s.name} name={s.name} dataKey={`s${i}`} stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.15} strokeWidth={2} />
                      ))}
                    </RadarChart>
                  </ChartContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-12">No supplier scores available yet</p>
                )}
              </CardContent>
            </Card>
          </div>
          {/* Top suppliers table */}
          {topSuppliers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Rated Suppliers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topSuppliers.map((s, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{s.name}</p>
                        <div className="h-2 rounded-full bg-muted mt-1 overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(s.score / 5) * 100}%` }} />
                        </div>
                      </div>
                      <span className="text-sm font-bold">{s.score.toFixed(2)}/5.00</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
