import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Banknote, Building2, Boxes, TrendingUp, Package, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ItemRow {
  id: string;
  item_code: string | null;
  item_name: string;
  group_name: string | null;
  abc_class: number | null;
  xyz_class: number | null;
  priority_score: number | null;
  risk_label: string | null;
  total_quantity: number | null;
  total_trans_value: number | null;
  num_suppliers: number | null;
  price_lists: { supplier_id: string; suppliers: { id: string; company_name: string } | null } | null;
}

const ABC_LETTER: Record<number, string> = { 3: 'A', 2: 'B', 1: 'C' };
const XYZ_LETTER: Record<number, string> = { 1: 'X', 2: 'Y', 3: 'Z' };

const fmtTHB = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
const fmtTHBShort = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${Math.round(n)}`;
};

export default function AnalyticsPage() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all: ItemRow[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await (supabase as any)
          .from('price_list_items')
          .select(
            'id, item_code, item_name, group_name, abc_class, xyz_class, priority_score, risk_label, total_quantity, total_trans_value, num_suppliers, price_lists!inner(supplier_id, suppliers!inner(id, company_name))'
          )
          .range(from, from + PAGE - 1);
        if (error) { console.error(error); break; }
        if (!data || data.length === 0) break;
        all.push(...(data as ItemRow[]));
        if (data.length < PAGE) break;
      }
      if (!cancelled) {
        setItems(all);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allGroups = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.group_name && set.add(i.group_name));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (groupFilter !== 'all' && i.group_name !== groupFilter) return false;
      if (riskFilter !== 'all' && i.risk_label !== riskFilter) return false;
      return true;
    });
  }, [items, groupFilter, riskFilter]);

  const stats = useMemo(() => {
    let totalSpend = 0, totalQty = 0;
    const supplierAgg = new Map<string, { id: string; name: string; spend: number; items: number; max_priority: number }>();
    const groupAgg = new Map<string, { spend: number; items: number; suppliers: Set<string> }>();
    const itemAgg = new Map<string, { name: string; group: string; spend: number; suppliers: Set<string>; priority: number; risk: string }>();

    for (const it of filtered) {
      const v = Number(it.total_trans_value || 0);
      const q = Number(it.total_quantity || 0);
      totalSpend += v;
      totalQty += q;

      const sup = it.price_lists?.suppliers;
      if (sup) {
        const cur = supplierAgg.get(sup.id) || { id: sup.id, name: sup.company_name, spend: 0, items: 0, max_priority: 0 };
        cur.spend += v;
        cur.items += 1;
        cur.max_priority = Math.max(cur.max_priority, it.priority_score ?? 0);
        supplierAgg.set(sup.id, cur);
      }

      const g = it.group_name || 'ไม่ระบุ';
      const gAgg = groupAgg.get(g) || { spend: 0, items: 0, suppliers: new Set() };
      gAgg.spend += v;
      gAgg.items += 1;
      if (sup) gAgg.suppliers.add(sup.id);
      groupAgg.set(g, gAgg);

      const key = it.item_code || it.id;
      const cur = itemAgg.get(key) || {
        name: it.item_name,
        group: g,
        spend: 0,
        suppliers: new Set(),
        priority: it.priority_score ?? 0,
        risk: it.risk_label || '',
      };
      cur.spend += v;
      if (sup) cur.suppliers.add(sup.id);
      cur.priority = Math.max(cur.priority, it.priority_score ?? 0);
      itemAgg.set(key, cur);
    }

    const topSuppliers = Array.from(supplierAgg.values()).sort((a, b) => b.spend - a.spend).slice(0, 15);
    const topGroups = Array.from(groupAgg.entries())
      .map(([name, v]) => ({ name, spend: v.spend, items: v.items, suppliers: v.suppliers.size }))
      .sort((a, b) => b.spend - a.spend);
    const topItems = Array.from(itemAgg.entries())
      .map(([code, v]) => ({ code, ...v, suppliers: v.suppliers.size }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 20);

    return { totalSpend, totalQty, topSuppliers, topGroups, topItems, supplierCount: supplierAgg.size };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> Procurement Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">วิเคราะห์การจัดซื้อ — Top spend by supplier, group และ item</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {allGroups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All risks</SelectItem>
              <SelectItem value="ความเสี่ยงมาก">🔴 มาก</SelectItem>
              <SelectItem value="ความเสี่ยงปานกลาง">🟡 ปานกลาง</SelectItem>
              <SelectItem value="ความเสี่ยงน้อย">🟢 น้อย</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Banknote} label="Total Spend" value={`฿${fmtTHB(stats.totalSpend)}`} sub="ปี 2025" loading={loading} />
        <Kpi icon={Building2} label="Suppliers" value={`${stats.supplierCount}`} sub="active in scope" loading={loading} />
        <Kpi icon={Boxes} label="Items / SKUs" value={`${filtered.length.toLocaleString()}`} sub={`from ${items.length.toLocaleString()} total`} loading={loading} />
        <Kpi icon={TrendingUp} label="Avg Spend / Supplier" value={`฿${fmtTHBShort(stats.supplierCount ? stats.totalSpend / stats.supplierCount : 0)}`} sub="mean" loading={loading} />
      </div>

      <Tabs defaultValue="suppliers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="suppliers">Top Suppliers</TabsTrigger>
          <TabsTrigger value="groups">By Group</TabsTrigger>
          <TabsTrigger value="items">Top Items</TabsTrigger>
        </TabsList>

        {/* TOP SUPPLIERS */}
        <TabsContent value="suppliers">
          <Card>
            <CardHeader><CardTitle className="text-base">Top 15 Suppliers by Spend</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Total Spend (THB)</TableHead>
                    <TableHead>Spend Share</TableHead>
                    <TableHead className="text-right">Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topSuppliers.map((s, i) => {
                    const pct = stats.totalSpend > 0 ? (s.spend / stats.totalSpend) * 100 : 0;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">
                          <Link to={`/suppliers/${s.id}`} className="text-primary hover:underline">{s.name}</Link>
                        </TableCell>
                        <TableCell className="text-right">{s.items}</TableCell>
                        <TableCell className="text-right font-mono">{fmtTHB(s.spend)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[100px]">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-12 text-right">{pct.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={s.max_priority >= 7 ? 'destructive' : s.max_priority >= 4 ? 'default' : 'secondary'}>P{s.max_priority}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BY GROUP */}
        <TabsContent value="groups">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Spend by Material Group</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {stats.topGroups.map((g) => {
                  const pct = stats.totalSpend > 0 ? (g.spend / stats.totalSpend) * 100 : 0;
                  return (
                    <div key={g.name}>
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="text-sm font-medium truncate" title={g.name}>{g.name}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">฿{fmtTHBShort(g.spend)} · {pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{g.items} items · {g.suppliers} suppliers</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Group Breakdown</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Suppliers</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.topGroups.map((g) => (
                      <TableRow key={g.name}>
                        <TableCell className="text-xs max-w-[180px] truncate" title={g.name}>{g.name}</TableCell>
                        <TableCell className="text-right">{g.items}</TableCell>
                        <TableCell className="text-right">{g.suppliers}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmtTHB(g.spend)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TOP ITEMS */}
        <TabsContent value="items">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Top 20 Items by Total Value</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">Suppliers</TableHead>
                    <TableHead className="text-right">Total Value (THB)</TableHead>
                    <TableHead className="text-right">Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topItems.map((it, i) => (
                    <TableRow key={it.code}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{it.code}</TableCell>
                      <TableCell className="max-w-xs truncate" title={it.name}>{it.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={it.group}>{it.group}</TableCell>
                      <TableCell className="text-right">{it.suppliers}</TableCell>
                      <TableCell className="text-right font-mono">{fmtTHB(it.spend)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={it.priority >= 7 ? 'destructive' : it.priority >= 4 ? 'default' : 'secondary'}>P{it.priority}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sub, loading,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={cn('h-4 w-4 text-muted-foreground')} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{loading ? '...' : value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
