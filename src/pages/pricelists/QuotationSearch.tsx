import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, Search, Loader2, ExternalLink, Filter } from 'lucide-react';
import QuotationHistoryDialog from '@/components/QuotationHistoryDialog';

interface HistoryRow {
  id:                     string;
  price_list_item_id:     string;
  supplier_id:            string;
  unit_price:             number;
  moq:                    number | null;
  lead_time_days:         number | null;
  reference_quotation_no: string | null;
  source:                 string;
  submitted_at:           string;
  supplier:  { id: string; company_name: string } | null;
  item:      { id: string; item_code: string | null; item_name: string; unit: string | null;
                price_list: { id: string; title: string; category: string } | null } | null;
}

const SOURCE_LABEL: Record<string, string> = {
  excel:   'Excel',
  portal:  'Portal',
  manual:  'Manual',
  unknown: '—',
};

export default function QuotationSearch() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [days, setDays] = useState<string>('90');
  const [historyItem, setHistoryItem] = useState<{ id: string; name: string; code: string | null; unit: string | null } | null>(null);

  useEffect(() => {
    setLoading(true);
    const since = days === 'all' ? null : new Date(Date.now() - Number(days) * 86400_000).toISOString();
    let query = supabase
      .from('price_list_quotation_history')
      .select(`
        id, price_list_item_id, supplier_id, unit_price, moq, lead_time_days,
        reference_quotation_no, source, submitted_at,
        supplier:suppliers(id, company_name),
        item:price_list_items(id, item_code, item_name, unit,
          price_list:price_lists(id, title, category)
        )
      `)
      .order('submitted_at', { ascending: false })
      .limit(500);
    if (since) query = query.gte('submitted_at', since);

    query.then(({ data, error }) => {
      if (error) console.error(error);
      setRows((data as any) || []);
      setLoading(false);
    });
  }, [days]);

  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(r => {
      if (r.supplier?.id) map.set(r.supplier.id, r.supplier.company_name);
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (supplierFilter !== 'all' && r.supplier_id !== supplierFilter) return false;
      if (sourceFilter   !== 'all' && r.source      !== sourceFilter)   return false;
      if (!q) return true;
      const hay = [
        r.item?.item_code, r.item?.item_name, r.supplier?.company_name,
        r.reference_quotation_no, r.item?.price_list?.title,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, supplierFilter, sourceFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            ประวัติใบเสนอราคา
          </h1>
          <p className="text-sm text-muted-foreground">สืบค้นและวิเคราะห์แนวโน้มราคาที่ supplier เสนอมาในแต่ละครั้ง</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> ตัวกรอง
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="ค้นหา รหัส / ชื่อสินค้า / supplier / RFQ..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger><SelectValue placeholder="ทุก supplier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุก supplier</SelectItem>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger><SelectValue placeholder="แหล่งที่มา" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกแหล่ง</SelectItem>
                <SelectItem value="excel">Excel Import</SelectItem>
                <SelectItem value="portal">Supplier Portal</SelectItem>
                <SelectItem value="manual">บันทึกเอง</SelectItem>
                <SelectItem value="unknown">ไม่ระบุ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">ช่วงเวลา:</span>
            {['7','30','90','180','365','all'].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2 py-1 rounded border transition-colors ${
                  days === d ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/30 hover:bg-muted'
                }`}
              >
                {d === 'all' ? 'ทั้งหมด' : `${d} วัน`}
              </button>
            ))}
            <span className="text-muted-foreground ml-auto">{loading ? '...' : `${filtered.length} รายการ`}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <History className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">ไม่พบประวัติตามเงื่อนไขที่กำหนด</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground bg-muted/30">
                    <th className="text-left p-3 font-medium">วันที่</th>
                    <th className="text-left p-3 font-medium">หมวด / Catalog</th>
                    <th className="text-left p-3 font-medium">สินค้า</th>
                    <th className="text-left p-3 font-medium">Supplier</th>
                    <th className="text-right p-3 font-medium">ราคาต่อหน่วย</th>
                    <th className="text-right p-3 font-medium">MOQ</th>
                    <th className="text-right p-3 font-medium">Lead</th>
                    <th className="text-left p-3 font-medium">ใบเสนอราคา</th>
                    <th className="text-left p-3 font-medium">แหล่ง</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 whitespace-nowrap text-xs">
                        {new Date(r.submitted_at).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' })}
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(r.submitted_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="p-3 text-xs">
                        {r.item?.price_list ? (
                          <Link to={`/pricelists/${r.item.price_list.id}`}
                            className="text-primary hover:underline line-clamp-1">
                            {r.item.price_list.title}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="p-3">
                        <div className="font-mono text-[10px] text-muted-foreground">{r.item?.item_code || '—'}</div>
                        <div className="font-medium text-xs line-clamp-1">{r.item?.item_name || '—'}</div>
                      </td>
                      <td className="p-3 text-xs">{r.supplier?.company_name || '—'}</td>
                      <td className="p-3 text-right tabular-nums font-medium">
                        {Number(r.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right tabular-nums text-xs">{r.moq ?? '—'}</td>
                      <td className="p-3 text-right tabular-nums text-xs">{r.lead_time_days ?? '—'}</td>
                      <td className="p-3 font-mono text-[10px] text-muted-foreground">{r.reference_quotation_no || '—'}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className="text-[10px]">
                          {SOURCE_LABEL[r.source] || r.source}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {r.item && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs"
                            onClick={() => setHistoryItem({
                              id: r.item!.id, name: r.item!.item_name,
                              code: r.item!.item_code, unit: r.item!.unit,
                            })}>
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Trend
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {historyItem && (
        <QuotationHistoryDialog
          open={!!historyItem}
          onClose={() => setHistoryItem(null)}
          itemId={historyItem.id}
          itemName={historyItem.name}
          itemCode={historyItem.code}
          unit={historyItem.unit}
        />
      )}
    </div>
  );
}
