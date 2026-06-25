import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, ShieldAlert, TrendingUp, Layers } from 'lucide-react';

/**
 * ABC-XYZ Supplier Risk Matrix — Enhanced Sub-Tier (9×9)
 *
 * Methodology:
 *   ABC axis  = cumulative spend share (Pareto), 9 sub-tiers (A+/A/A−/B+/B/B−/C+/C/C−)
 *   XYZ axis  = supply risk score, 9 sub-tiers (X+/X/X−/Y+/Y/Y−/Z+/Z/Z−)
 *               supply_risk = 0.6 * (1/n_supplier) + 0.4 * CV(demand)
 *   P-Score   = 0.65 * ABC_score + 0.35 * XYZ_score
 *               → P1 (Critical) … P5 (Routine)
 *
 * The component reads real data from Supabase (awards, quotation_items, price_list_items,
 * rfq_suppliers) and falls back to deterministic synthetic data when data is sparse — so the
 * page always renders meaningfully for demo / early-stage tenants.
 */

// ─── Constants ──────────────────────────────────────────────────────────────
const ABC_LABELS = ['A+', 'A', 'A−', 'B+', 'B', 'B−', 'C+', 'C', 'C−'] as const;
const ABC_BREAKS = [0.5, 0.7, 0.8, 0.87, 0.93, 0.95, 0.98, 0.995, 1.0];
const XYZ_LABELS = ['X+', 'X', 'X−', 'Y+', 'Y', 'Y−', 'Z+', 'Z', 'Z−'] as const;
const XYZ_BREAKS = [0.85, 0.7, 0.55, 0.45, 0.3, 0.2, 0.15, 0.08, 0.0];

const P_TIER_META = [
  { name: 'P1 · Critical', color: 'bg-rose-500', text: 'text-rose-700', border: 'border-rose-300' },
  { name: 'P2 · High', color: 'bg-orange-500', text: 'text-orange-700', border: 'border-orange-300' },
  { name: 'P3 · Medium', color: 'bg-yellow-400', text: 'text-yellow-800', border: 'border-yellow-300' },
  { name: 'P4 · Low', color: 'bg-lime-500', text: 'text-lime-700', border: 'border-lime-300' },
  { name: 'P5 · Routine', color: 'bg-teal-500', text: 'text-teal-700', border: 'border-teal-300' },
];

// Cell heat: combined score (abcIdx + xyzIdx) → bg/border classes
const HEAT = [
  'bg-rose-100 border-rose-300', // 0–2
  'bg-rose-50 border-rose-200',
  'bg-orange-100 border-orange-300',
  'bg-orange-50 border-orange-200',
  'bg-yellow-100 border-yellow-300',
  'bg-yellow-50 border-yellow-200',
  'bg-lime-100 border-lime-300',
  'bg-lime-50 border-lime-200',
  'bg-teal-50 border-teal-200',
];

function heatClass(abcIdx: number, xyzIdx: number) {
  const s = abcIdx + xyzIdx;
  if (s <= 1) return HEAT[0];
  if (s <= 3) return HEAT[1];
  if (s <= 5) return HEAT[2];
  if (s <= 7) return HEAT[3];
  if (s <= 9) return HEAT[4];
  if (s <= 11) return HEAT[5];
  if (s <= 13) return HEAT[6];
  if (s <= 15) return HEAT[7];
  return HEAT[8];
}

function pTierFromScore(p: number): number {
  if (p >= 0.75) return 1;
  if (p >= 0.55) return 2;
  if (p >= 0.4) return 3;
  if (p >= 0.25) return 4;
  return 5;
}

// ─── Types ──────────────────────────────────────────────────────────────────
type ItemRow = {
  itemKey: string;
  itemName: string;
  spend: number;
  nSupplier: number;
  cv: number; // coefficient of variation of demand
  topSupplierId?: string;
  topSupplierName?: string;
  abcIdx: number;
  abc: string;
  xyzIdx: number;
  xyz: string;
  supplyRisk: number;
  pScore: number;
  pTier: number;
};

type SupplierRiskRow = {
  supplierId: string;
  supplierName: string;
  totalSpend: number;
  itemCount: number;
  p1Items: number;
  p2Items: number;
  avgPScore: number;
  worstPTier: number;
};

// ─── Synthetic fallback ─────────────────────────────────────────────────────
function syntheticItems(): { items: Omit<ItemRow, 'abcIdx' | 'abc' | 'xyzIdx' | 'xyz' | 'supplyRisk' | 'pScore' | 'pTier'>[]; suppliers: { id: string; name: string }[] } {
  const TOTAL_ITEMS = 1884;
  const TOTAL_SPEND = 3_715_181_534;
  let seed = 20260429;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const suppliers = Array.from({ length: 310 }, (_, i) => ({
    id: `s-${i}`,
    name: `Supplier ${String(i + 1).padStart(3, '0')}`,
  }));

  // Pareto distributed spend
  const raw: number[] = [];
  let cum = 0;
  for (let i = 0; i < TOTAL_ITEMS; i++) {
    const r = (i + 1) / TOTAL_ITEMS;
    const v = Math.pow(r, -1.4) * (0.6 + rnd() * 0.8);
    raw.push(v);
    cum += v;
  }
  const scale = TOTAL_SPEND / cum;
  const spends = raw.map((v) => v * scale).sort((a, b) => b - a);

  const items = spends.map((spend, i) => {
    const rank = i / TOTAL_ITEMS;
    const u = rnd();
    let nSupplier: number;
    if (rank < 0.05) nSupplier = u < 0.4 ? 1 : u < 0.85 ? 2 : u < 0.97 ? 3 : 4 + Math.floor(rnd() * 3);
    else if (rank < 0.3) nSupplier = u < 0.55 ? 1 : u < 0.85 ? 2 : u < 0.95 ? 3 : 4 + Math.floor(rnd() * 2);
    else if (rank < 0.7) nSupplier = u < 0.65 ? 1 : u < 0.88 ? 2 : 3 + Math.floor(rnd() * 3);
    else nSupplier = u < 0.55 ? 1 : u < 0.75 ? 2 : u < 0.88 ? 3 + Math.floor(rnd() * 2) : 5 + Math.floor(rnd() * 6);

    const cvBase = rank < 0.1 ? 0.15 : rank < 0.5 ? 0.35 : 0.55;
    const cv = Math.max(0.05, cvBase + (rnd() - 0.5) * 0.6);
    const supIdx = Math.floor(rnd() * suppliers.length);

    return {
      itemKey: `item-${i}`,
      itemName: `RM-${String(i + 1).padStart(4, '0')}`,
      spend,
      nSupplier,
      cv,
      topSupplierId: suppliers[supIdx].id,
      topSupplierName: suppliers[supIdx].name,
    };
  });

  return { items, suppliers };
}

// ─── Real data fetcher (best-effort aggregation) ────────────────────────────
async function fetchRealData(): Promise<{
  items: Omit<ItemRow, 'abcIdx' | 'abc' | 'xyzIdx' | 'xyz' | 'supplyRisk' | 'pScore' | 'pTier'>[];
  suppliers: { id: string; name: string }[];
}> {
  // Pull in parallel — keep queries small, aggregate in JS
  const [
    { data: awards },
    { data: quotations },
    { data: quotationItems },
    { data: priceListItems },
    { data: priceLists },
    { data: rfqItems },
    { data: rfqSuppliers },
    { data: suppliers },
  ] = await Promise.all([
    supabase.from('awards').select('id, supplier_id, amount, rfq_id, created_at, status'),
    supabase.from('quotations').select('id, rfq_id, supplier_id, total_amount, created_at'),
    supabase.from('quotation_items').select('id, quotation_id, rfq_item_id, item_name, quantity, unit_price, total_price'),
    supabase.from('price_list_items').select('id, price_list_id, item_name, unit_price, lead_time_days'),
    supabase.from('price_lists').select('id, supplier_id, status'),
    supabase.from('rfq_items').select('id, rfq_id, item_name, quantity, created_at'),
    supabase.from('rfq_suppliers').select('rfq_id, supplier_id'),
    supabase.from('suppliers').select('id, company_name'),
  ]);

  const supplierMap = new Map<string, string>();
  (suppliers ?? []).forEach((s) => supplierMap.set(s.id, s.company_name));

  // For each item_name, aggregate:
  //   spend         = sum of awarded quotation_items.total_price (or quantity*unit_price)
  //   nSupplier     = distinct suppliers offering this item across price_lists & quotations
  //   monthlyDemand = quantities by month (from rfq_items.created_at) → CV
  //   topSupplier   = supplier with highest spend in this item
  type Agg = {
    itemName: string;
    spend: number;
    suppliers: Set<string>;
    monthly: Map<string, number>;
    perSupplierSpend: Map<string, number>;
  };
  const byItem = new Map<string, Agg>();
  const get = (name: string): Agg => {
    const k = name.trim().toLowerCase();
    let a = byItem.get(k);
    if (!a) {
      a = { itemName: name, spend: 0, suppliers: new Set(), monthly: new Map(), perSupplierSpend: new Map() };
      byItem.set(k, a);
    }
    return a;
  };

  // Map quotation_id → supplier_id, awarded?
  const quotationMeta = new Map<string, { supplier: string; rfq: string }>();
  (quotations ?? []).forEach((q) => quotationMeta.set(q.id, { supplier: q.supplier_id, rfq: q.rfq_id }));
  const awardedRfqs = new Set((awards ?? []).map((a) => a.rfq_id).filter(Boolean) as string[]);

  // Spend from quotation_items (use awarded RFQs as proxy for actual spend)
  (quotationItems ?? []).forEach((qi) => {
    const meta = quotationMeta.get(qi.quotation_id);
    if (!meta) return;
    const value = Number(qi.total_price ?? (Number(qi.quantity ?? 0) * Number(qi.unit_price ?? 0)));
    if (!qi.item_name || value <= 0) return;
    const a = get(qi.item_name);
    a.suppliers.add(meta.supplier);
    if (awardedRfqs.has(meta.rfq)) {
      a.spend += value;
      a.perSupplierSpend.set(meta.supplier, (a.perSupplierSpend.get(meta.supplier) ?? 0) + value);
    }
  });

  // Add suppliers offering each item via active price lists
  const activePriceLists = new Set(
    (priceLists ?? []).filter((p) => p.status === 'active').map((p) => p.id),
  );
  const priceListSupplier = new Map<string, string>();
  (priceLists ?? []).forEach((p) => priceListSupplier.set(p.id, p.supplier_id));
  (priceListItems ?? []).forEach((pi) => {
    if (!activePriceLists.has(pi.price_list_id)) return;
    const sup = priceListSupplier.get(pi.price_list_id);
    if (!sup || !pi.item_name) return;
    get(pi.item_name).suppliers.add(sup);
  });

  // Demand history from rfq_items
  (rfqItems ?? []).forEach((ri) => {
    if (!ri.item_name) return;
    const a = get(ri.item_name);
    const month = (ri.created_at ?? '').slice(0, 7) || 'unknown';
    a.monthly.set(month, (a.monthly.get(month) ?? 0) + Number(ri.quantity ?? 1));
  });

  // Track invited suppliers as additional candidate count
  const rfqInvitations = new Map<string, Set<string>>();
  (rfqSuppliers ?? []).forEach((rs) => {
    if (!rfqInvitations.has(rs.rfq_id)) rfqInvitations.set(rs.rfq_id, new Set());
    rfqInvitations.get(rs.rfq_id)!.add(rs.supplier_id);
  });
  (rfqItems ?? []).forEach((ri) => {
    if (!ri.item_name) return;
    const a = get(ri.item_name);
    const invs = rfqInvitations.get(ri.rfq_id);
    invs?.forEach((s) => a.suppliers.add(s));
  });

  // Build flat item rows
  const itemsOut: ReturnType<typeof syntheticItems>['items'] = [];
  byItem.forEach((a) => {
    if (a.spend <= 0 && a.suppliers.size === 0) return;
    // CV
    const months = Array.from(a.monthly.values());
    let cv = 0.4;
    if (months.length >= 2) {
      const mean = months.reduce((s, x) => s + x, 0) / months.length;
      const variance = months.reduce((s, x) => s + (x - mean) ** 2, 0) / months.length;
      cv = mean > 0 ? Math.sqrt(variance) / mean : 0.4;
    }
    // Top supplier
    let topId: string | undefined;
    let topVal = 0;
    a.perSupplierSpend.forEach((v, k) => {
      if (v > topVal) {
        topVal = v;
        topId = k;
      }
    });
    if (!topId && a.suppliers.size > 0) topId = Array.from(a.suppliers)[0];

    itemsOut.push({
      itemKey: a.itemName.toLowerCase(),
      itemName: a.itemName,
      spend: a.spend,
      nSupplier: Math.max(1, a.suppliers.size),
      cv: Math.max(0.05, Math.min(2, cv)),
      topSupplierId: topId,
      topSupplierName: topId ? supplierMap.get(topId) ?? topId : undefined,
    });
  });

  return {
    items: itemsOut,
    suppliers: (suppliers ?? []).map((s) => ({ id: s.id, name: s.company_name })),
  };
}

// ─── Classifier ─────────────────────────────────────────────────────────────
function classify(rawItems: Omit<ItemRow, 'abcIdx' | 'abc' | 'xyzIdx' | 'xyz' | 'supplyRisk' | 'pScore' | 'pTier'>[]): ItemRow[] {
  if (rawItems.length === 0) return [];
  const sorted = [...rawItems].sort((a, b) => b.spend - a.spend);
  const totalSpend = sorted.reduce((s, x) => s + x.spend, 0) || 1;
  let running = 0;
  return sorted.map((it) => {
    running += it.spend;
    const p = running / totalSpend;
    let abcIdx = ABC_BREAKS.findIndex((b) => p <= b);
    if (abcIdx === -1) abcIdx = ABC_LABELS.length - 1;

    const supplyRisk = 0.6 * (1 / Math.max(1, it.nSupplier)) + 0.4 * Math.min(1, it.cv);
    let xyzIdx = XYZ_BREAKS.findIndex((b) => supplyRisk >= b);
    if (xyzIdx === -1) xyzIdx = XYZ_LABELS.length - 1;

    const abcScore = 1 - abcIdx / 8;
    const xyzScore = 1 - xyzIdx / 8;
    const pScore = 0.65 * abcScore + 0.35 * xyzScore;

    return {
      ...it,
      abcIdx,
      abc: ABC_LABELS[abcIdx],
      xyzIdx,
      xyz: XYZ_LABELS[xyzIdx],
      supplyRisk,
      pScore,
      pTier: pTierFromScore(pScore),
    };
  });
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function SupplierRiskMatrix() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingSynthetic, setUsingSynthetic] = useState(false);
  const [supplierLookup, setSupplierLookup] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const load = async () => {
      try {
        const real = await fetchRealData();
        const sup = new Map(real.suppliers.map((s) => [s.id, s.name]));
        // If real data is too sparse for meaningful tiering, fall back
        if (real.items.length < 20) {
          const synth = syntheticItems();
          setItems(classify(synth.items));
          setSupplierLookup(new Map(synth.suppliers.map((s) => [s.id, s.name])));
          setUsingSynthetic(true);
        } else {
          setItems(classify(real.items));
          setSupplierLookup(sup);
          setUsingSynthetic(false);
        }
      } catch (e) {
        console.warn('[SupplierRiskMatrix] real data fetch failed, using synthetic', e);
        const synth = syntheticItems();
        setItems(classify(synth.items));
        setSupplierLookup(new Map(synth.suppliers.map((s) => [s.id, s.name])));
        setUsingSynthetic(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totals = useMemo(() => {
    const totalSpend = items.reduce((s, x) => s + x.spend, 0);
    const supplierIds = new Set(items.map((x) => x.topSupplierId).filter(Boolean) as string[]);
    const p1 = items.filter((x) => x.pTier === 1);
    const p1Spend = p1.reduce((s, x) => s + x.spend, 0);
    return {
      totalSpend,
      supplierCount: supplierIds.size,
      itemCount: items.length,
      p1Count: p1.length,
      p1Spend,
    };
  }, [items]);

  // 9×9 grid of items
  const grid = useMemo(() => {
    const g: { count: number; spend: number; suppliers: Set<string> }[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => ({ count: 0, spend: 0, suppliers: new Set<string>() })),
    );
    items.forEach((it) => {
      const c = g[it.abcIdx][it.xyzIdx];
      c.count++;
      c.spend += it.spend;
      if (it.topSupplierId) c.suppliers.add(it.topSupplierId);
    });
    return g;
  }, [items]);

  // P-tier distribution
  const pDist = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    const spends = [0, 0, 0, 0, 0];
    items.forEach((it) => {
      counts[it.pTier - 1]++;
      spends[it.pTier - 1] += it.spend;
    });
    return { counts, spends };
  }, [items]);

  // Supplier risk: for each supplier (using topSupplierId per item), aggregate exposure
  const supplierRisk = useMemo<SupplierRiskRow[]>(() => {
    const m = new Map<string, SupplierRiskRow>();
    items.forEach((it) => {
      if (!it.topSupplierId) return;
      let r = m.get(it.topSupplierId);
      if (!r) {
        r = {
          supplierId: it.topSupplierId,
          supplierName: it.topSupplierName ?? supplierLookup.get(it.topSupplierId) ?? it.topSupplierId,
          totalSpend: 0,
          itemCount: 0,
          p1Items: 0,
          p2Items: 0,
          avgPScore: 0,
          worstPTier: 5,
        };
        m.set(it.topSupplierId, r);
      }
      r.totalSpend += it.spend;
      r.itemCount += 1;
      if (it.pTier === 1) r.p1Items += 1;
      if (it.pTier === 2) r.p2Items += 1;
      r.avgPScore += it.pScore;
      if (it.pTier < r.worstPTier) r.worstPTier = it.pTier;
    });
    const arr = Array.from(m.values());
    arr.forEach((r) => (r.avgPScore = r.itemCount > 0 ? r.avgPScore / r.itemCount : 0));
    // Rank: by P1 count desc, then total spend desc
    arr.sort((a, b) => b.p1Items - a.p1Items || b.totalSpend - a.totalSpend);
    return arr.slice(0, 15);
  }, [items, supplierLookup]);

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-12 text-center">
        กำลังโหลดข้อมูลและคำนวณ ABC-XYZ classification…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {usingSynthetic && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <b>โหมด Demo:</b> ข้อมูลจริงไม่เพียงพอสำหรับการจัด tier — แสดงด้วย synthetic data
          (1,884 SKUs, 310 suppliers, ฿3.7B spend) เพื่อให้เห็นการทำงานของ matrix
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="Total Spend"
          value={`฿${(totals.totalSpend / 1e9).toFixed(2)}B`}
          hint="awarded + quoted"
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          label="Suppliers"
          value={totals.supplierCount.toLocaleString()}
          hint="active in tiers"
          icon={<Layers className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          label="SKUs / Items"
          value={totals.itemCount.toLocaleString()}
          hint="classified"
          icon={<Layers className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          label="P1 · Critical"
          value={totals.p1Count.toLocaleString()}
          hint={`฿${(totals.p1Spend / 1e6).toFixed(0)}M at risk`}
          icon={<ShieldAlert className="h-4 w-4 text-rose-500" />}
          accent="text-rose-600"
        />
        <KpiCard
          label="Coverage"
          value={`${grid.flat().filter((c) => c.count > 0).length}/81`}
          hint="cells occupied"
          icon={<AlertTriangle className="h-4 w-4 text-emerald-500" />}
          accent="text-emerald-600"
        />
      </div>

      {/* 9×9 Matrix */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">9 × 9 Sub-Tier Matrix</CardTitle>
              <CardDescription>
                แกน ABC = มูลค่าซื้อสะสม (Pareto) · แกน XYZ = Supply Risk = 0.6·(1/n_supplier) + 0.4·CV(demand) · P-Score = 0.65·ABC + 0.35·XYZ
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {P_TIER_META.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <span className={`w-3 h-3 rounded-full ${p.color}`} />
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1 text-xs w-full min-w-[820px]">
              <thead>
                <tr>
                  <th className="w-10"></th>
                  <th colSpan={3} className="text-center text-muted-foreground py-1 font-medium">
                    X · Single / High Risk
                  </th>
                  <th colSpan={3} className="text-center text-muted-foreground py-1 font-medium">
                    Y · 2–4 ราย
                  </th>
                  <th colSpan={3} className="text-center text-muted-foreground py-1 font-medium">
                    Z · &gt; 4 ราย / Commodity
                  </th>
                </tr>
                <tr className="text-center text-muted-foreground">
                  <th></th>
                  {XYZ_LABELS.map((l) => (
                    <th key={l} className="py-0.5">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ABC_LABELS.map((rowLabel, r) => (
                  <tr key={rowLabel}>
                    <td className="text-right pr-2 align-middle text-muted-foreground font-medium">{rowLabel}</td>
                    {XYZ_LABELS.map((_, c) => {
                      const cell = grid[r][c];
                      const pct = totals.totalSpend > 0 ? ((cell.spend / totals.totalSpend) * 100).toFixed(1) : '0.0';
                      const spendStr = formatSpend(cell.spend);
                      return (
                        <td key={c}>
                          <div
                            className={`border rounded-md px-2 py-2 transition hover:-translate-y-0.5 hover:shadow-md ${heatClass(
                              r,
                              c,
                            )}`}
                            title={`${rowLabel} × ${XYZ_LABELS[c]} · ${cell.count} items · ${spendStr}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[11px]">{cell.count}</span>
                              <span className="text-[9px] text-muted-foreground">{pct}%</span>
                            </div>
                            <div className="text-[9px] text-muted-foreground">{spendStr}</div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* P-Score distribution + supplier risk side-by-side */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Priority Distribution</CardTitle>
            <CardDescription>P-Score = 0.65·ABC_score + 0.35·XYZ_score</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {P_TIER_META.map((p, i) => {
              const c = pDist.counts[i];
              const sp = pDist.spends[i];
              const pctC = totals.itemCount > 0 ? ((c / totals.itemCount) * 100).toFixed(1) : '0';
              const pctS = totals.totalSpend > 0 ? ((sp / totals.totalSpend) * 100).toFixed(1) : '0';
              const max = Math.max(...pDist.counts);
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className={`font-medium ${p.text}`}>{p.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {c} · spend {pctS}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`${p.color} h-full transition-all`} style={{ width: `${(c / Math.max(1, max)) * 100}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{pctC}% ของ items</div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Top Supplier Risk Exposure</CardTitle>
            <CardDescription>
              คู่ค้าที่ผูกกับ items P1/P2 มากสุด — ควรมี mitigation plan ก่อน
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">P1</TableHead>
                  <TableHead className="text-right">P2</TableHead>
                  <TableHead className="text-right">Worst Tier</TableHead>
                  <TableHead className="text-right">Avg P</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierRisk.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                      ยังไม่มีข้อมูล supplier exposure
                    </TableCell>
                  </TableRow>
                )}
                {supplierRisk.map((s, i) => (
                  <TableRow key={s.supplierId}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.supplierName}</TableCell>
                    <TableCell className="text-right tabular-nums">฿{(s.totalSpend / 1e6).toFixed(1)}M</TableCell>
                    <TableCell className="text-right tabular-nums">{s.itemCount}</TableCell>
                    <TableCell className="text-right">
                      {s.p1Items > 0 ? (
                        <Badge variant="destructive" className="font-bold">
                          {s.p1Items}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.p2Items}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-medium ${P_TIER_META[s.worstPTier - 1].text}`}>P{s.worstPTier}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.avgPScore.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Action playbook */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk Mitigation Playbook</CardTitle>
          <CardDescription>แนวทางจัดการตาม P-tier — ใช้กับ supplier ที่ติด tier นั้น</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-5 gap-3 text-xs">
            {[
              {
                t: 'P1 · Critical',
                cls: 'border-rose-300 bg-rose-50',
                bullets: ['Dual / multi-sourcing', 'Safety stock 60–90 วัน', 'BCP & supplier audit รายไตรมาส', 'Long-term contract + escalation clause'],
              },
              {
                t: 'P2 · High',
                cls: 'border-orange-300 bg-orange-50',
                bullets: ['Qualify backup supplier', 'SLA + KPI ติดตาม', 'Frame agreement 12–24 เดือน', 'Risk review 6 เดือน'],
              },
              {
                t: 'P3 · Medium',
                cls: 'border-yellow-300 bg-yellow-50',
                bullets: ['RFQ ทุก 6–12 เดือน', 'Monitor demand variance', 'Periodic price benchmark'],
              },
              {
                t: 'P4 · Low',
                cls: 'border-lime-300 bg-lime-50',
                bullets: ['Frame agreement', 'E-catalog / standardize', 'ลด admin cost'],
              },
              {
                t: 'P5 · Routine',
                cls: 'border-teal-300 bg-teal-50',
                bullets: ['Auto-PO / consignment', 'Vendor consolidation', 'Self-service portal'],
              },
            ].map((p, i) => (
              <div key={i} className={`rounded-md border p-3 ${p.cls}`}>
                <div className="font-semibold mb-1">{p.t}</div>
                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                  {p.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatSpend(v: number): string {
  if (v >= 1e9) return `฿${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `฿${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `฿${(v / 1e3).toFixed(0)}K`;
  return `฿${Math.round(v)}`;
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-xl font-bold tabular-nums ${accent ?? ''}`}>{value}</div>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
