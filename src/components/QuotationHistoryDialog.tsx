import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingDown, TrendingUp, Minus, History, Trash2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';

interface HistoryRow {
  id:                     string;
  price_list_item_id:     string;
  supplier_id:            string;
  unit_price:             number;
  moq:                    number | null;
  lead_time_days:         number | null;
  reference_quotation_no: string | null;
  notes:                  string | null;
  source:                 string;
  submitted_at:           string;
  supplier?: { id: string; company_name: string };
}

interface Props {
  open:       boolean;
  onClose:    () => void;
  itemId:     string;
  itemName:   string;
  itemCode:   string | null;
  unit:       string | null;
}

// Distinct colors for up to 8 suppliers
const COLORS = ['#2563EB', '#16A34A', '#DC2626', '#D97706', '#9333EA', '#0891B2', '#DB2777', '#65A30D'];

const SOURCE_LABEL: Record<string, string> = {
  excel:   'Excel',
  portal:  'Portal',
  manual:  'Manual',
  unknown: '—',
};

export default function QuotationHistoryDialog({ open, onClose, itemId, itemName, itemCode, unit }: Props) {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole('admin');
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open || !itemId) return;
    setLoading(true);
    (async () => {
      // Step 1: fetch history rows
      const { data: histRows, error: histErr } = await supabase
        .from('price_list_quotation_history')
        .select('id, price_list_item_id, supplier_id, unit_price, moq, lead_time_days, reference_quotation_no, notes, source, submitted_at')
        .eq('price_list_item_id', itemId)
        .order('submitted_at', { ascending: true });

      if (histErr || !histRows) {
        console.error(histErr);
        setRows([]);
        setLoading(false);
        return;
      }

      // Step 2: fetch supplier names separately (avoids relationship cache issues)
      const supplierIds = Array.from(new Set(histRows.map(r => r.supplier_id).filter(Boolean)));
      const supplierMap = new Map<string, { id: string; company_name: string }>();
      if (supplierIds.length > 0) {
        const { data: supps } = await supabase
          .from('suppliers')
          .select('id, company_name')
          .in('id', supplierIds);
        (supps || []).forEach(s => supplierMap.set(s.id, s));
      }

      const enriched = histRows.map(r => ({
        ...r,
        supplier: supplierMap.get(r.supplier_id),
      })) as HistoryRow[];

      setRows(enriched);
      setLoading(false);
    })();
  }, [open, itemId, reloadKey]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from('price_list_quotation_history')
      .delete()
      .eq('id', deleteId);
    if (error) {
      toast({ title: 'ลบไม่สำเร็จ', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'ลบประวัติแล้ว' });
      setReloadKey(k => k + 1);
    }
    setDeleteId(null);
  };

  // Distinct suppliers in this item's history
  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(r => {
      if (r.supplier?.id) map.set(r.supplier.id, r.supplier.company_name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [rows]);

  const filteredRows = useMemo(
    () => supplierFilter === 'all' ? rows : rows.filter(r => r.supplier_id === supplierFilter),
    [rows, supplierFilter]
  );

  // Build chart data — pivot rows into one row per date, columns = suppliers
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, any>>();
    rows.forEach(r => {
      const day = r.submitted_at.slice(0, 10);
      if (!dateMap.has(day)) dateMap.set(day, { date: day });
      const slot = dateMap.get(day)!;
      const key = r.supplier?.company_name || 'Unknown';
      // If multiple submissions same day, keep the latest
      slot[key] = Number(r.unit_price);
    });
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  // Stats per supplier — first, last, change %
  const stats = useMemo(() => {
    const bySupplier = new Map<string, HistoryRow[]>();
    rows.forEach(r => {
      const list = bySupplier.get(r.supplier_id) || [];
      list.push(r);
      bySupplier.set(r.supplier_id, list);
    });
    return Array.from(bySupplier.entries()).map(([sid, list]) => {
      list.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
      const first = list[0];
      const last  = list[list.length - 1];
      const change = first.unit_price > 0
        ? ((last.unit_price - first.unit_price) / first.unit_price) * 100
        : 0;
      return {
        supplier_id: sid,
        supplier_name: list[0].supplier?.company_name || '—',
        count: list.length,
        first_price: first.unit_price,
        last_price: last.unit_price,
        first_date: first.submitted_at,
        last_date: last.submitted_at,
        change,
      };
    }).sort((a, b) => a.last_price - b.last_price);
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            ประวัติราคาเสนอ
          </DialogTitle>
          <DialogDescription className="space-y-1">
            <div>
              <span className="font-mono text-xs text-muted-foreground">{itemCode || ''}</span>
              <span className="ml-2 font-medium text-foreground">{itemName}</span>
              {unit && <span className="ml-2 text-muted-foreground">/ {unit}</span>}
            </div>
            <div className="text-xs">
              {loading ? '...' : `${rows.length} ครั้ง · ${suppliers.length} supplier`}
            </div>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <History className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">ยังไม่มีประวัติการเสนอราคาสำหรับรายการนี้</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-4 -mx-6 px-6">
            {/* Stats per supplier */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {stats.map(s => {
                const Trend = s.change > 0.5 ? TrendingUp : s.change < -0.5 ? TrendingDown : Minus;
                const color = s.change > 0.5 ? 'text-red-600' : s.change < -0.5 ? 'text-green-600' : 'text-muted-foreground';
                return (
                  <div key={s.supplier_id} className="rounded-lg border p-3 text-xs">
                    <p className="font-medium text-foreground line-clamp-1">{s.supplier_name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-muted-foreground">{s.count} ครั้ง</span>
                      <span className={`flex items-center gap-1 font-medium ${color}`}>
                        <Trend className="h-3 w-3" />
                        {s.change > 0 ? '+' : ''}{s.change.toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-muted-foreground line-through">
                        {s.first_price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-base font-bold tabular-nums">
                        {s.last_price.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Trend chart */}
            {chartData.length >= 2 && (
              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">📈 แนวโน้มราคาตามเวลา</p>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }}
                      tickFormatter={d => new Date(d).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: any) => [Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2 }) + (unit ? ` /${unit}` : ''), '']}
                      labelFormatter={(d) => new Date(d as string).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {suppliers.map((s, idx) => (
                      <Line
                        key={s.id}
                        type="monotone"
                        dataKey={s.name}
                        stroke={COLORS[idx % COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Filter + table */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">📜 รายการประวัติ</p>
              {suppliers.length > 1 && (
                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                  <SelectTrigger className="w-[220px] h-8 text-xs">
                    <SelectValue placeholder="ทุก supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทุก supplier</SelectItem>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2 font-medium">วันที่</th>
                    <th className="p-2 font-medium">Supplier</th>
                    <th className="p-2 font-medium text-right">ราคาต่อหน่วย</th>
                    <th className="p-2 font-medium text-right">MOQ</th>
                    <th className="p-2 font-medium text-right">Lead</th>
                    <th className="p-2 font-medium">เลขใบเสนอราคา</th>
                    <th className="p-2 font-medium">แหล่งที่มา</th>
                    {isAdmin && <th className="p-2 font-medium w-8"></th>}
                  </tr>
                </thead>
                <tbody>
                  {[...filteredRows].reverse().map((r, i, arr) => {
                    // Compare to previous (chronologically prior) row from same supplier
                    const prior = arr.slice(i + 1).find(p => p.supplier_id === r.supplier_id);
                    const delta = prior ? r.unit_price - prior.unit_price : 0;
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="p-2 whitespace-nowrap">
                          {new Date(r.submitted_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(r.submitted_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="p-2">{r.supplier?.company_name || '—'}</td>
                        <td className="p-2 text-right tabular-nums font-medium">
                          {Number(r.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          {prior && delta !== 0 && (
                            <span className={`ml-1 text-[10px] ${delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums">{r.moq ?? '—'}</td>
                        <td className="p-2 text-right tabular-nums">{r.lead_time_days ?? '—'}</td>
                        <td className="p-2 font-mono text-[10px] text-muted-foreground">{r.reference_quotation_no || '—'}</td>
                        <td className="p-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {SOURCE_LABEL[r.source] || r.source}
                          </Badge>
                        </td>
                        {isAdmin && (
                          <td className="p-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-red-50"
                              onClick={() => setDeleteId(r.id)}
                              title="ลบประวัตินี้"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Confirm delete */}
        <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ลบประวัติราคานี้?</AlertDialogTitle>
              <AlertDialogDescription>
                การลบจะนำรายการนี้ออกจากประวัติและกราฟ trend อย่างถาวร — ใช้สำหรับลบข้อมูลที่ผิดพลาดเท่านั้น
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                ลบ
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
