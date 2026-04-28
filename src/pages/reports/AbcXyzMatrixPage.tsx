import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Building2, Boxes, Banknote, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import SupplierRiskBubble from './SupplierRiskBubble';

type ItemRow = {
  id: string;
  item_code: string | null;
  item_name: string;
  description: string | null;
  group_name: string | null;
  abc_class: number | null;
  xyz_class: number | null;
  seasonality_score: number | null;
  priority_score: number | null;
  risk_label: string | null;
  total_quantity: number | null;
  total_trans_value: number | null;
  avg_trans_value: number | null;
  num_suppliers: number | null;
  price_list_id: string;
  price_lists: { supplier_id: string; suppliers: { company_name: string } | null } | null;
};

const ABC_LABEL: Record<number, string> = {
  3: 'A · มากกว่า 5MB',
  2: 'B · 1–5 MB',
  1: 'C · น้อยกว่า 1MB',
};
const XYZ_LABEL: Record<number, string> = {
  1: 'X · ผู้ขายรายเดียว',
  2: 'Y · 2–4 ราย',
  3: 'Z · มากกว่า 4 ราย',
};
const ABC_LETTER: Record<number, string> = { 3: 'A', 2: 'B', 1: 'C' };
const XYZ_LETTER: Record<number, string> = { 1: 'X', 2: 'Y', 3: 'Z' };

const fmtTHB = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
const fmtTHBShort = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
};

// Cell color: risk increases as value goes up + suppliers go down (top-left = AX = highest risk)
function cellColor(abc: number, xyz: number) {
  // Risk score = (abc * (4 - xyz))  -> AX:9, AY:6, AZ:3, BX:6, BY:4, BZ:2, CX:3, CY:2, CZ:1
  const r = abc * (4 - xyz);
  if (r >= 8) return 'bg-red-50 border-red-200 hover:bg-red-100';
  if (r >= 5) return 'bg-orange-50 border-orange-200 hover:bg-orange-100';
  if (r >= 3) return 'bg-amber-50 border-amber-200 hover:bg-amber-100';
  return 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100';
}
function cellLabelColor(abc: number, xyz: number) {
  const r = abc * (4 - xyz);
  if (r >= 8) return 'text-red-700';
  if (r >= 5) return 'text-orange-700';
  if (r >= 3) return 'text-amber-700';
  return 'text-emerald-700';
}
function strategyForCell(abc: number, xyz: number): string {
  const r = abc * (4 - xyz);
  if (r >= 8) return 'Strategic / Critical — diversify supply, build long-term partnership';
  if (r >= 5) return 'Bottleneck — qualify alternates, secure inventory';
  if (r >= 3) return 'Important — competitive sourcing';
  return 'Routine — leverage / standardize';
}

export default function AbcXyzMatrixPage() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<{ abc: number; xyz: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const all: ItemRow[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await (supabase as any)
          .from('price_list_items')
          .select(
            'id, item_code, item_name, description, group_name, abc_class, xyz_class, seasonality_score, priority_score, risk_label, total_quantity, total_trans_value, avg_trans_value, num_suppliers, price_list_id, price_lists!inner(supplier_id, suppliers!inner(company_name))'
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
    }
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // Build matrix aggregations
  const { matrix, totals, byGroup, topCritical, riskTotals } = useMemo(() => {
    const m: Record<string, { count: number; spend: number; suppliers: Set<string>; items: ItemRow[] }> = {};
    for (let a = 1; a <= 3; a++) for (let x = 1; x <= 3; x++) m[`${a}-${x}`] = { count: 0, spend: 0, suppliers: new Set(), items: [] };

    let totalSpend = 0;
    const allSuppliers = new Set<string>();
    const groupAgg: Record<string, { spend: number; count: number }> = {};
    const riskAgg: Record<string, { count: number; spend: number }> = {
      'ความเสี่ยงมาก': { count: 0, spend: 0 },
      'ความเสี่ยงปานกลาง': { count: 0, spend: 0 },
      'ความเสี่ยงน้อย': { count: 0, spend: 0 },
    };

    for (const it of items) {
      const a = it.abc_class ?? 0;
      const x = it.xyz_class ?? 0;
      const v = Number(it.total_trans_value || 0);
      const sup = it.price_lists?.suppliers?.company_name || '';
      totalSpend += v;
      if (sup) allSuppliers.add(sup);
      if (a >= 1 && a <= 3 && x >= 1 && x <= 3) {
        const cell = m[`${a}-${x}`];
        cell.count++;
        cell.spend += v;
        if (sup) cell.suppliers.add(sup);
        cell.items.push(it);
      }
      const g = it.group_name || 'ไม่ระบุ';
      if (!groupAgg[g]) groupAgg[g] = { spend: 0, count: 0 };
      groupAgg[g].spend += v;
      groupAgg[g].count++;

      const rl = it.risk_label || 'ความเสี่ยงน้อย';
      if (riskAgg[rl]) {
        riskAgg[rl].count++;
        riskAgg[rl].spend += v;
      }
    }

    const groups = Object.entries(groupAgg)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8);

    const supplierAgg: Record<string, { spend: number; max_priority: number; items: number }> = {};
    for (const it of items) {
      const sup = it.price_lists?.suppliers?.company_name || '';
      if (!sup) continue;
      const p = it.priority_score ?? 0;
      if (!supplierAgg[sup]) supplierAgg[sup] = { spend: 0, max_priority: 0, items: 0 };
      supplierAgg[sup].spend += Number(it.total_trans_value || 0);
      supplierAgg[sup].max_priority = Math.max(supplierAgg[sup].max_priority, p);
      supplierAgg[sup].items++;
    }
    const top = Object.entries(supplierAgg)
      .map(([name, v]) => ({ name, ...v }))
      .filter((s) => s.max_priority >= 7)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);

    return {
      matrix: m,
      totals: { totalSpend, totalSuppliers: allSuppliers.size, totalItems: items.length },
      byGroup: groups,
      topCritical: top,
      riskTotals: riskAgg,
    };
  }, [items]);

  const drillItems = useMemo(() => {
    if (!drill) return [];
    return matrix[`${drill.abc}-${drill.xyz}`]?.items ?? [];
  }, [drill, matrix]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-primary" /> ABC-XYZ Supplier Risk Matrix
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          แบ่งกลุ่ม supplier ตามมูลค่าการซื้อ (ABC) และจำนวนผู้ขาย/ฤดูกาล (XYZ) เพื่อจัดลำดับความเสี่ยงในการจัดซื้อ
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Banknote} label="Total Spend (ปี 2025)" value={`฿${fmtTHB(totals.totalSpend)}`} sub="รวมทุกหมวดวัตถุดิบ" loading={loading} />
        <KpiCard icon={Building2} label="Suppliers" value={`${totals.totalSuppliers}`} sub="ทั้งหมดในระบบ" loading={loading} />
        <KpiCard icon={Boxes} label="SKUs / Items" value={`${totals.totalItems.toLocaleString()}`} sub="รหัสวัตถุดิบ + บรรจุภัณฑ์" loading={loading} />
        <KpiCard
          icon={AlertTriangle}
          label="Critical Risk"
          value={`${riskTotals['ความเสี่ยงมาก']?.count || 0}`}
          sub={`฿${fmtTHB(riskTotals['ความเสี่ยงมาก']?.spend)} · มูลค่าเสี่ยง`}
          tone="danger"
          loading={loading}
        />
      </div>

      {/* Matrix */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <CardTitle>ABC-XYZ Matrix</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                คลิกที่ช่องเพื่อดูรายการสินค้า · แกนตั้ง ABC = มูลค่า · แกนนอน XYZ = จำนวนผู้ขาย/ฤดูกาล
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <LegendDot color="bg-red-100 border-red-300" label="Critical" />
              <LegendDot color="bg-orange-100 border-orange-300" label="Bottleneck" />
              <LegendDot color="bg-amber-100 border-amber-300" label="Important" />
              <LegendDot color="bg-emerald-100 border-emerald-300" label="Routine" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="grid gap-2 min-w-[640px]" style={{ gridTemplateColumns: '120px repeat(3, 1fr)' }}>
              {/* Header row */}
              <div />
              {[1, 2, 3].map((x) => (
                <div key={`h-${x}`} className="text-xs font-semibold text-center text-muted-foreground py-2">
                  {XYZ_LABEL[x]}
                </div>
              ))}
              {/* Data rows: A, B, C from top to bottom */}
              {[3, 2, 1].map((a) => (
                <RowFragment key={a} a={a} matrix={matrix} totalSpend={totals.totalSpend} onClick={(x) => setDrill({ abc: a, xyz: x })} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Supplier Risk Bubble Chart */}
      <SupplierRiskBubble />

      {/* Risk + Group breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">การกระจายความเสี่ยง</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(['ความเสี่ยงมาก', 'ความเสี่ยงปานกลาง', 'ความเสี่ยงน้อย'] as const).map((rl) => {
              const data = riskTotals[rl];
              const pct = totals.totalSpend > 0 ? (data.spend / totals.totalSpend) * 100 : 0;
              const tone = rl === 'ความเสี่ยงมาก' ? 'bg-red-500' : rl === 'ความเสี่ยงปานกลาง' ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div key={rl}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{rl}</span>
                    <span className="text-xs text-muted-foreground">{data.count} items · ฿{fmtTHB(data.spend)} ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top Spend ตามหมวดวัตถุดิบ</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {byGroup.map((g) => {
              const pct = totals.totalSpend > 0 ? (g.spend / totals.totalSpend) * 100 : 0;
              return (
                <div key={g.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate pr-2" title={g.name}>{g.name}</span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">฿{fmtTHBShort(g.spend)} · {g.count}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {!loading && byGroup.length === 0 && <p className="text-sm text-muted-foreground">No data</p>}
          </CardContent>
        </Card>
      </div>

      {/* Top critical suppliers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Top Critical Suppliers (ความเสี่ยงมาก)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topCritical.length === 0 ? (
            <p className="text-sm text-muted-foreground">{loading ? 'Loading...' : 'No critical suppliers'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total Spend (THB)</TableHead>
                  <TableHead className="text-right">Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCritical.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">{s.items}</TableCell>
                    <TableCell className="text-right">{fmtTHB(s.spend)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive">P{s.max_priority}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drill-down dialog */}
      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {drill ? `${ABC_LETTER[drill.abc]}${XYZ_LETTER[drill.xyz]} — ${ABC_LABEL[drill.abc]} × ${XYZ_LABEL[drill.xyz]}` : ''}
            </DialogTitle>
            {drill && (
              <p className="text-xs text-muted-foreground pt-1">{strategyForCell(drill.abc, drill.xyz)}</p>
            )}
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead className="text-right">Suppliers</TableHead>
                <TableHead className="text-right">Priority</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drillItems
                .sort((a, b) => Number(b.total_trans_value || 0) - Number(a.total_trans_value || 0))
                .slice(0, 100)
                .map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-mono text-xs">{it.item_code}</TableCell>
                    <TableCell className="max-w-xs truncate" title={it.item_name}>{it.item_name}</TableCell>
                    <TableCell className="text-xs">{it.price_lists?.suppliers?.company_name}</TableCell>
                    <TableCell className="text-right">{fmtTHB(it.total_trans_value)}</TableCell>
                    <TableCell className="text-right">{it.num_suppliers ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={it.priority_score && it.priority_score >= 7 ? 'destructive' : 'secondary'}>
                        P{it.priority_score ?? '—'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {drillItems.length > 100 && (
            <p className="text-xs text-muted-foreground pt-2">แสดง 100 รายการแรกจากทั้งหมด {drillItems.length}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowFragment({
  a, matrix, totalSpend, onClick,
}: {
  a: number;
  matrix: Record<string, { count: number; spend: number; suppliers: Set<string>; items: any[] }>;
  totalSpend: number;
  onClick: (x: number) => void;
}) {
  return (
    <>
      <div className="text-xs font-semibold flex items-center justify-end pr-3 text-muted-foreground">
        {ABC_LABEL[a]}
      </div>
      {[1, 2, 3].map((x) => {
        const cell = matrix[`${a}-${x}`];
        const pct = totalSpend > 0 ? (cell.spend / totalSpend) * 100 : 0;
        return (
          <button
            key={`${a}-${x}`}
            onClick={() => onClick(x)}
            className={cn(
              'border-2 rounded-lg p-4 text-left transition-all min-h-[120px] flex flex-col justify-between',
              cellColor(a, x),
            )}
          >
            <div className="flex items-start justify-between">
              <span className={cn('text-2xl font-bold tracking-tight', cellLabelColor(a, x))}>
                {ABC_LETTER[a]}{XYZ_LETTER[x]}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">{pct.toFixed(1)}%</span>
            </div>
            <div className="space-y-1">
              <div className="text-lg font-bold leading-none">{cell.count}<span className="text-xs font-normal text-muted-foreground"> items</span></div>
              <div className="text-xs text-muted-foreground">฿{fmtTHBShort(cell.spend)} · {cell.suppliers.size} suppliers</div>
            </div>
          </button>
        );
      })}
    </>
  );
}

function KpiCard({
  icon: Icon, label, value, sub, tone, loading,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  tone?: 'danger';
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={cn('h-4 w-4', tone === 'danger' ? 'text-red-500' : 'text-muted-foreground')} />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', tone === 'danger' && 'text-red-600')}>{loading ? '...' : value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('w-3 h-3 rounded border', color)} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
