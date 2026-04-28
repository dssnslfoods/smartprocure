import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const ABC_LETTER: Record<number, string> = { 3: 'A', 2: 'B', 1: 'C' };
const XYZ_LETTER: Record<number, string> = { 1: 'X', 2: 'Y', 3: 'Z' };

const fmtTHB = (n: number | null | undefined) => n == null ? '—' : Number(n).toLocaleString('th-TH', { maximumFractionDigits: 0 });

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
  avg_trans_value: number | null;
  num_suppliers: number | null;
  unit_price: number;
}

export default function SupplierItems({ supplierId }: { supplierId: string }) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data: priceLists } = await supabase
        .from('price_lists')
        .select('id')
        .eq('supplier_id', supplierId);
      const ids = (priceLists || []).map((p: any) => p.id);
      if (ids.length === 0) { setItems([]); setLoading(false); return; }

      const all: ItemRow[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await (supabase as any)
          .from('price_list_items')
          .select('id, item_code, item_name, group_name, abc_class, xyz_class, priority_score, risk_label, total_quantity, total_trans_value, avg_trans_value, num_suppliers, unit_price')
          .in('price_list_id', ids)
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
    load();
    return () => { cancelled = true; };
  }, [supplierId]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.group_name && set.add(i.group_name));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items
      .filter((i) => {
        if (search && !(`${i.item_code || ''} ${i.item_name}`.toLowerCase().includes(search.toLowerCase()))) return false;
        if (groupFilter !== 'all' && i.group_name !== groupFilter) return false;
        if (riskFilter !== 'all' && i.risk_label !== riskFilter) return false;
        return true;
      })
      .sort((a, b) => Number(b.total_trans_value || 0) - Number(a.total_trans_value || 0));
  }, [items, search, groupFilter, riskFilter]);

  const summary = useMemo(() => {
    let totalSpend = 0, criticalCount = 0;
    items.forEach((i) => {
      totalSpend += Number(i.total_trans_value || 0);
      if ((i.priority_score ?? 0) >= 7) criticalCount++;
    });
    return { totalSpend, criticalCount, count: items.length };
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Total Items</p>
            <p className="text-2xl font-bold">{summary.count.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Total Spend (ปี 2025)</p>
            <p className="text-2xl font-bold">฿{fmtTHB(summary.totalSpend)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Critical Items (P≥7)</p>
            <p className={cn('text-2xl font-bold', summary.criticalCount > 0 && 'text-red-600')}>{summary.criticalCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Items / Price List (ABC-XYZ)</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search item..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
              </div>
              <Select value={groupFilter} onValueChange={setGroupFilter}>
                <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groups</SelectItem>
                  {groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All risks</SelectItem>
                  <SelectItem value="ความเสี่ยงมาก">🔴 มาก</SelectItem>
                  <SelectItem value="ความเสี่ยงปานกลาง">🟡 ปานกลาง</SelectItem>
                  <SelectItem value="ความเสี่ยงน้อย">🟢 น้อย</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>ABC-XYZ</TableHead>
                  <TableHead className="text-right">Total Value (THB)</TableHead>
                  <TableHead className="text-right">Avg Qty</TableHead>
                  <TableHead className="text-right">Suppliers</TableHead>
                  <TableHead className="text-right">Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No items</TableCell></TableRow>
                ) : (
                  filtered.slice(0, 200).map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-mono text-xs">{it.item_code || '—'}</TableCell>
                      <TableCell className="max-w-xs truncate" title={it.item_name}>{it.item_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={it.group_name || ''}>{it.group_name || '—'}</TableCell>
                      <TableCell>
                        {it.abc_class && it.xyz_class ? (
                          <span className={cn(
                            'font-mono font-semibold text-xs px-2 py-0.5 rounded border',
                            (it.priority_score ?? 0) >= 7 ? 'bg-red-50 border-red-200 text-red-700' :
                            (it.priority_score ?? 0) >= 4 ? 'bg-amber-50 border-amber-200 text-amber-700' :
                            'bg-emerald-50 border-emerald-200 text-emerald-700'
                          )}>
                            {ABC_LETTER[it.abc_class]}{XYZ_LETTER[it.xyz_class]}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtTHB(it.total_trans_value)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtTHB(it.avg_trans_value)}</TableCell>
                      <TableCell className="text-right">{it.num_suppliers ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        {it.priority_score == null ? '—' : (
                          <Badge variant={it.priority_score >= 7 ? 'destructive' : it.priority_score >= 4 ? 'default' : 'secondary'}>
                            P{it.priority_score}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {filtered.length > 200 && (
              <p className="text-xs text-muted-foreground pt-2">แสดง 200 รายการแรกจาก {filtered.length} (ใช้ filter เพื่อดูเพิ่ม)</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
