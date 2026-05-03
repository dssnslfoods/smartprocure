import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Plus, Search, ShieldAlert, CheckCircle2, Clock, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SEVERITY_CONFIG: Record<string, { color: string; label: string }> = {
  minor:    { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'Minor' },
  major:    { color: 'bg-orange-100 text-orange-700 border-orange-300', label: 'Major' },
  critical: { color: 'bg-red-100 text-red-700 border-red-300',           label: 'Critical' },
};

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: any }> = {
  open:        { color: 'bg-blue-100 text-blue-700',     label: 'เปิดใหม่',         icon: AlertTriangle },
  in_progress: { color: 'bg-amber-100 text-amber-700',   label: 'กำลังดำเนินการ',   icon: Clock },
  closed:      { color: 'bg-emerald-100 text-emerald-700', label: 'ปิดเรียบร้อย',  icon: CheckCircle2 },
  cancelled:   { color: 'bg-muted text-muted-foreground', label: 'ยกเลิก',          icon: X },
};

interface NCRRow {
  id: string;
  ncr_number: string;
  supplier_id: string;
  category: string;
  severity: string;
  product_description: string | null;
  detected_date: string;
  status: string;
  description: string;
  capa_due_date: string | null;
  closed_date: string | null;
  suppliers?: { company_name: string };
}

export default function NCRListPage() {
  const { roles } = useAuth();
  const navigate = useNavigate();
  const canCreate = roles.includes('admin') || roles.includes('procurement_officer') || roles.includes('approver');

  const [ncrs, setNcrs] = useState<NCRRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [stats, setStats] = useState({ open: 0, overdue: 0, critical: 0, total: 0 });

  const fetchData = async () => {
    setLoading(true);
    let query = supabase
      .from('supplier_ncrs')
      .select('id, ncr_number, supplier_id, category, severity, product_description, detected_date, status, description, capa_due_date, closed_date, suppliers(company_name)')
      .order('detected_date', { ascending: false });

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (severityFilter !== 'all') query = query.eq('severity', severityFilter);

    const { data } = await query;
    let rows = (data || []) as NCRRow[];

    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(r =>
        (r.ncr_number || '').toLowerCase().includes(s) ||
        (r.description || '').toLowerCase().includes(s) ||
        (r.product_description || '').toLowerCase().includes(s) ||
        (r.suppliers?.company_name || '').toLowerCase().includes(s),
      );
    }
    setNcrs(rows);

    // Stats
    const today = new Date().toISOString().slice(0, 10);
    const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: all } = await supabase.from('supplier_ncrs').select('id, status, severity, detected_date');
    const allRows = all || [];
    setStats({
      open:     allRows.filter((r: any) => r.status === 'open' || r.status === 'in_progress').length,
      overdue:  allRows.filter((r: any) => (r.status === 'open' || r.status === 'in_progress') && r.detected_date < cutoff30).length,
      critical: allRows.filter((r: any) => r.severity === 'critical').length,
      total:    allRows.length,
    });

    setLoading(false);
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [statusFilter, severityFilter]);
  useEffect(() => { const t = setTimeout(fetchData, 200); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-orange-500" /> Non-Conformance Reports (NCR)
          </h1>
          <p className="text-sm text-muted-foreground">
            บันทึกและติดตามความไม่เป็นไปตามข้อกำหนดจาก supplier — ใช้เป็นข้อมูลประเมินความเสี่ยง
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate('/ncrs/new')}>
            <Plus className="h-4 w-4 mr-2" /> เปิด NCR ใหม่
          </Button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">NCR ทั้งหมด</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </CardContent></Card>
        <Card className="border-blue-200"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">ยังเปิดอยู่</div>
          <div className="text-2xl font-bold text-blue-600">{stats.open}</div>
        </CardContent></Card>
        <Card className="border-amber-200"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">ค้างเกิน 30 วัน</div>
          <div className="text-2xl font-bold text-amber-600">{stats.overdue}</div>
        </CardContent></Card>
        <Card className="border-red-200"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">ระดับ Critical</div>
          <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="ค้นหา NCR, supplier, หรือคำอธิบาย..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="สถานะ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสถานะ</SelectItem>
            <SelectItem value="open">เปิดใหม่</SelectItem>
            <SelectItem value="in_progress">กำลังดำเนินการ</SelectItem>
            <SelectItem value="closed">ปิดเรียบร้อย</SelectItem>
            <SelectItem value="cancelled">ยกเลิก</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="ความรุนแรง" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกระดับ</SelectItem>
            <SelectItem value="minor">Minor</SelectItem>
            <SelectItem value="major">Major</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">เลข NCR</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                <th className="text-left p-3 font-medium text-muted-foreground">ประเภท</th>
                <th className="text-left p-3 font-medium text-muted-foreground">ความรุนแรง</th>
                <th className="text-left p-3 font-medium text-muted-foreground">วันที่ตรวจพบ</th>
                <th className="text-left p-3 font-medium text-muted-foreground">CAPA Due</th>
                <th className="text-left p-3 font-medium text-muted-foreground">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">กำลังโหลด...</td></tr>
              ) : ncrs.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">ยังไม่มีข้อมูล NCR</td></tr>
              ) : ncrs.map(n => {
                const sev = SEVERITY_CONFIG[n.severity] || SEVERITY_CONFIG.minor;
                const st  = STATUS_CONFIG[n.status]   || STATUS_CONFIG.open;
                const StIcon = st.icon;
                const overdue = (n.status === 'open' || n.status === 'in_progress') &&
                  n.capa_due_date && n.capa_due_date < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={n.id} onClick={() => navigate(`/ncrs/${n.id}`)}
                      className="border-b hover:bg-muted/30 cursor-pointer">
                    <td className="p-3 font-mono text-primary font-medium">{n.ncr_number}</td>
                    <td className="p-3">{n.suppliers?.company_name || '—'}</td>
                    <td className="p-3 text-muted-foreground capitalize">{n.category}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={sev.color}>{sev.label}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{new Date(n.detected_date).toLocaleDateString('th-TH')}</td>
                    <td className={`p-3 ${overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {n.capa_due_date ? new Date(n.capa_due_date).toLocaleDateString('th-TH') : '—'}
                      {overdue && ' (เกินกำหนด)'}
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className={`${st.color} gap-1`}>
                        <StIcon className="h-3 w-3" />{st.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
