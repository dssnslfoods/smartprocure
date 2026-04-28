import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Area, AreaChart } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, BarChart3, Activity, Users } from 'lucide-react';

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

const COLORS = ['hsl(142 76% 36%)', 'hsl(45 93% 47%)', 'hsl(var(--muted-foreground))', 'hsl(0 84% 60%)'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ReportsPage() {
  const [supplierStats, setSupplierStats] = useState({ total: 0, approved: 0, pending: 0, draft: 0, rejected: 0 });
  const [rfqStats, setRfqStats] = useState({ total: 0, open: 0, closed: 0, awarded: 0 });
  const [_awardCount, setAwardCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [{ data: suppliers }, { data: rfqs }, { data: awards }] = await Promise.all([
        supabase.from('suppliers').select('status'),
        supabase.from('rfqs').select('status'),
        supabase.from('awards').select('id'),
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
    };
    load();
  }, []);

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
          <TabsTrigger value="suppliers">Supplier Status</TabsTrigger>
        </TabsList>

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

        <TabsContent value="suppliers" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Supplier Status Distribution</CardTitle>
                <CardDescription>Current registration status breakdown</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <ChartContainer config={supplierConfig} className="h-[280px] w-full max-w-[320px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie data={supplierPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={3}>
                      {supplierPieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Supplier Summary</CardTitle>
                <CardDescription>Registration status breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                {[
                  { label: 'Approved', value: supplierStats.approved, color: 'bg-emerald-500' },
                  { label: 'Pending Review', value: supplierStats.pending, color: 'bg-amber-500' },
                  { label: 'Draft', value: supplierStats.draft, color: 'bg-muted-foreground' },
                  { label: 'Rejected', value: supplierStats.rejected, color: 'bg-red-500' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{label}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${color}`}
                        style={{ width: `${supplierStats.total > 0 ? (value / supplierStats.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
