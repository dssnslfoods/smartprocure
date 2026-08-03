import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { supabaseAdmin } from '@/integrations/supabase/adminClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Users, Shield, Settings, Mail, Save, Search, KeyRound, ChevronLeft, ChevronRight, FileSpreadsheet, Trash2, AlertTriangle, Database, Loader2, FileText, ArrowUp, ArrowDown, Pencil, Info, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_CYCLE, loadPricelistCycle, savePricelistCycle,
  type PricelistCycleSettings,
} from '@/lib/pricelistCycle';
import { DEFAULT_SCORING_WEIGHTS, loadScoringWeights, SCORING_WEIGHTS_KEY } from '@/lib/scoringWeights';
import type { ScoringWeights } from '@/types/procurement';

interface EmailConfig {
  email_enabled: boolean;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password: string;
  sender_name: string;
  sender_email: string;
  notify_supplier_approved: boolean;
  notify_supplier_rejected: boolean;
  notify_admin_new_supplier: boolean;
  approved_subject: string;
  approved_body: string;
  rejected_subject: string;
  rejected_body: string;
}

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  is_active: boolean | null;
  created_at: string | null;
  user_roles: { role: string }[];
}

const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  email_enabled: false,
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_password: '',
  sender_name: 'Smart Procurement',
  sender_email: 'noreply@company.com',
  notify_supplier_approved: true,
  notify_supplier_rejected: true,
  notify_admin_new_supplier: true,
  approved_subject: 'การลงทะเบียนได้รับอนุมัติ - {{company_name}}',
  approved_body: 'เรียน {{supplier_name}},\n\nบริษัท {{company_name}} ได้รับการอนุมัติให้เข้าใช้งานระบบ Smart Procurement แล้ว\n\nท่านสามารถเข้าสู่ระบบได้ที่: {{login_url}}\n\nขอแสดงความนับถือ,\nทีมงาน Smart Procurement',
  rejected_subject: 'แจ้งผลการพิจารณาลงทะเบียน - {{company_name}}',
  rejected_body: 'เรียน {{supplier_name}},\n\nบริษัท {{company_name}} ไม่ผ่านการพิจารณาในครั้งนี้\n\nเหตุผล: {{reason}}\n\nหากมีข้อสงสัย กรุณาติดต่อผู้ดูแลระบบ\n\nขอแสดงความนับถือ,\nทีมงาน Smart Procurement',
};

const PAGE_SIZE = 20;

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  procurement_officer: 'bg-blue-100 text-blue-700',
  approver: 'bg-purple-100 text-purple-700',
  executive: 'bg-amber-100 text-amber-700',
  supplier: 'bg-green-100 text-green-700',
};

export default function AdminSettingsPage() {
  // ── User list state ──────────────────────────────────────────
  const [users, setUsers] = useState<UserRow[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Create user state ────────────────────────────────────────
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'procurement_officer' as string });
  const [creating, setCreating] = useState(false);

  // ── Reset password state ─────────────────────────────────────
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // ── Email config state ───────────────────────────────────────
  const [emailConfig, setEmailConfig] = useState<EmailConfig>(DEFAULT_EMAIL_CONFIG);
  const [savingEmail, setSavingEmail] = useState(false);

  // ── Scoring weights state ────────────────────────────────────
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_SCORING_WEIGHTS);
  const [savingWeights, setSavingWeights] = useState(false);
  const weightsTotal = weights.commercial + weights.technical + weights.risk;

  // ── Pricelist cycle state ────────────────────────────────────
  const [cycle, setCycle] = useState<PricelistCycleSettings>(DEFAULT_CYCLE);
  const [savingCycle, setSavingCycle] = useState(false);

  // ── Clear transaction data state ─────────────────────────────
  const [txnCounts, setTxnCounts] = useState<Record<string, number> | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  // ── Company document types state ─────────────────────────────
  const [docTypes, setDocTypes] = useState<any[]>([]);
  const [dtDialogOpen, setDtDialogOpen] = useState(false);
  const [dtEditing, setDtEditing] = useState<string | null>(null);
  const [dtForm, setDtForm] = useState({ name_th: '', description: '', is_required: true, has_expiry: false });
  const [savingDt, setSavingDt] = useState(false);

  const { toast } = useToast();

  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));

  // ── Fetch users ──────────────────────────────────────────────
  const fetchUsers = useCallback(async (pg: number, q: string) => {
    setLoadingUsers(true);
    const from = (pg - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let countQ = supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true });
    let dataQ = supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, is_active, created_at')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (q.trim()) {
      const like = `%${q.trim()}%`;
      countQ = countQ.or(`full_name.ilike.${like},email.ilike.${like}`);
      dataQ = dataQ.or(`full_name.ilike.${like},email.ilike.${like}`);
    }

    const [{ count }, { data, error }] = await Promise.all([countQ, dataQ]);

    if (error) {
      toast({ title: 'Error loading users', description: error.message, variant: 'destructive' });
      setLoadingUsers(false);
      return;
    }

    const profiles = data || [];

    // Fetch roles separately (user_roles.user_id → auth.users, no FK to profiles)
    let mergedUsers: UserRow[] = profiles.map(p => ({ ...p, user_roles: [] }));
    if (profiles.length > 0) {
      const ids = profiles.map(p => p.id);
      const { data: roles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', ids);
      if (roles) {
        const roleMap: Record<string, { role: string }[]> = {};
        roles.forEach(r => {
          if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
          roleMap[r.user_id].push({ role: r.role });
        });
        mergedUsers = profiles.map(p => ({ ...p, user_roles: roleMap[p.id] || [] }));
      }
    }

    setUsers(mergedUsers as unknown as UserRow[]);
    setTotalUsers(count || 0);
    setLoadingUsers(false);
  }, [toast]);

  useEffect(() => {
    fetchUsers(page, search);
  }, [page, fetchUsers]);

  // Debounce search
  const handleSearchChange = (val: string) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchUsers(1, val);
    }, 400);
  };

  // ── Email config ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('system_settings').select('*').eq('key', 'email_config').maybeSingle();
      if (data?.value) setEmailConfig({ ...DEFAULT_EMAIL_CONFIG, ...(data.value as Record<string, any>) });
    })();
  }, []);

  const saveEmailConfig = async () => {
    setSavingEmail(true);
    const { error } = await supabase.from('system_settings').upsert(
      { key: 'email_config', value: emailConfig as any, updated_at: new Date().toISOString() } as any,
      { onConflict: 'key' },
    );
    setSavingEmail(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'บันทึกสำเร็จ', description: 'ตั้งค่าอีเมลถูกบันทึกแล้ว' });
  };

  const updateEmail = (key: keyof EmailConfig, val: any) => setEmailConfig(prev => ({ ...prev, [key]: val }));

  // ── Scoring weights ──────────────────────────────────────────
  useEffect(() => { loadScoringWeights().then(setWeights); }, []);

  const saveWeights = async () => {
    if (weightsTotal !== 100) {
      toast({ title: 'น้ำหนักต้องรวมกันได้ 100%', description: `ตอนนี้รวม ${weightsTotal}%`, variant: 'destructive' });
      return;
    }
    setSavingWeights(true);
    const { error } = await supabase.from('system_settings').upsert(
      { key: SCORING_WEIGHTS_KEY, value: weights as any, updated_at: new Date().toISOString() } as any,
      { onConflict: 'key' },
    );
    setSavingWeights(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'บันทึกสำเร็จ', description: 'น้ำหนักการให้คะแนนถูกบันทึกแล้ว' });
  };

  const updateWeight = (key: keyof ScoringWeights, val: string) =>
    setWeights(prev => ({ ...prev, [key]: Math.max(0, Math.min(100, parseInt(val) || 0)) }));

  // ── Pricelist cycle ──────────────────────────────────────────
  useEffect(() => { loadPricelistCycle().then(setCycle); }, []);
  const saveCycle = async () => {
    if (cycle.update_cycle_days < 1 || cycle.update_cycle_days > 730) {
      toast({ title: 'ค่าไม่ถูกต้อง', description: 'รอบการอัปเดตต้องอยู่ระหว่าง 1–730 วัน', variant: 'destructive' });
      return;
    }
    setSavingCycle(true);
    const { error } = await savePricelistCycle(cycle);
    setSavingCycle(false);
    if (error) toast({ title: 'Error', description: error, variant: 'destructive' });
    else toast({ title: 'บันทึกสำเร็จ', description: `รอบ Pricelist = ${cycle.update_cycle_days} วัน` });
  };

  // ── Clear transaction data ───────────────────────────────────
  const loadTxnCounts = useCallback(async () => {
    setLoadingCounts(true);
    const { data, error } = await (supabase.rpc as any)('count_transaction_data');
    setLoadingCounts(false);
    if (error) {
      toast({ title: 'โหลดจำนวนข้อมูลไม่สำเร็จ', description: error.message, variant: 'destructive' });
      return;
    }
    setTxnCounts((data as Record<string, number>) ?? {});
  }, [toast]);

  const handleClearTransactions = async () => {
    setClearing(true);
    const { data, error } = await (supabase.rpc as any)('clear_transaction_data');
    setClearing(false);
    if (error) {
      toast({ title: 'ล้างข้อมูลไม่สำเร็จ', description: error.message, variant: 'destructive' });
      return;
    }
    const total = Object.values((data as Record<string, number>) ?? {}).reduce((a, b) => a + Number(b), 0);
    toast({ title: '✓ ล้างข้อมูล Transaction สำเร็จ', description: `ลบทั้งหมด ${total.toLocaleString('th-TH')} รายการ` });
    setShowClearConfirm(false);
    setClearConfirmText('');
    loadTxnCounts();
  };

  const TXN_LABELS: Record<string, string> = {
    rfqs: 'ใบขอราคา (RFQ)',
    rfq_items: '— รายการใน RFQ',
    rfq_suppliers: '— ผู้ขายที่เชิญ',
    rfq_evaluations: '— การประเมิน RFQ',
    quotations: 'ใบเสนอราคา',
    quotation_items: '— รายการในใบเสนอราคา',
    bidding_events: 'การประมูล (e-Bidding)',
    bid_entries: '— รายการเสนอราคาประมูล',
    final_quotations: 'ใบเสนอราคาสุดท้าย',
    awards: 'การมอบงาน (Awards)',
    award_approvals: '— การอนุมัติมอบงาน',
    approval_logs: '— บันทึกการอนุมัติ',
  };
  const txnTotal = txnCounts ? Object.values(txnCounts).reduce((a, b) => a + Number(b), 0) : 0;
  const CLEAR_PHRASE = 'ล้างข้อมูล';

  // ── Create user ──────────────────────────────────────────────
  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.full_name) {
      toast({ title: 'กรุณากรอกข้อมูลให้ครบ', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: newUser.email,
        password: newUser.password,
        email_confirm: true,
        user_metadata: { full_name: newUser.full_name },
      });
      if (error) throw error;
      if (data?.user) {
        await supabaseAdmin.from('user_roles').insert({ user_id: data.user.id, role: newUser.role as any } as any);
        await supabaseAdmin.from('profiles').upsert({
          id: data.user.id,
          email: newUser.email,
          full_name: newUser.full_name,
          is_active: true,
        });
        toast({ title: 'สร้างผู้ใช้สำเร็จ', description: `${newUser.email} ถูกสร้างแล้ว` });
      }
    } catch (err: any) {
      toast({ title: 'เกิดข้อผิดพลาด', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
      setShowCreateUser(false);
      setNewUser({ email: '', password: '', full_name: '', role: 'procurement_officer' });
      fetchUsers(page, search);
    }
  };

  // ── Toggle active ─────────────────────────────────────────────
  const handleToggleActive = async (u: UserRow) => {
    const next = !(u.is_active !== false);
    const { error } = await supabaseAdmin.from('profiles').update({ is_active: next }).eq('id', u.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setUsers(prev => prev.map(p => p.id === u.id ? { ...p, is_active: next } : p));
      toast({ title: next ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว', description: u.email || u.full_name || '' });
    }
  };

  // ── Reset password ────────────────────────────────────────────
  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword) return;
    setResetting(true);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(resetTarget.id, { password: newPassword });
    setResetting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'รีเซ็ตรหัสผ่านสำเร็จ', description: `${resetTarget.email}` });
      setResetTarget(null);
      setNewPassword('');
    }
  };

  // ── Company document types ───────────────────────────────────
  const loadDocTypes = useCallback(async () => {
    const { data } = await supabase.from('company_document_types' as any).select('*').order('sort_order');
    setDocTypes((data as any[]) || []);
  }, []);
  useEffect(() => { loadDocTypes(); }, [loadDocTypes]);

  const openNewDt = () => {
    setDtEditing(null);
    setDtForm({ name_th: '', description: '', is_required: true, has_expiry: false });
    setDtDialogOpen(true);
  };
  const openEditDt = (d: any) => {
    setDtEditing(d.id);
    setDtForm({ name_th: d.name_th, description: d.description || '', is_required: d.is_required, has_expiry: d.has_expiry });
    setDtDialogOpen(true);
  };
  const saveDt = async () => {
    if (!dtForm.name_th.trim()) { toast({ title: 'กรุณาระบุชื่อเอกสาร', variant: 'destructive' }); return; }
    setSavingDt(true);
    const payload = {
      name_th: dtForm.name_th.trim(),
      description: dtForm.description.trim() || null,
      is_required: dtForm.is_required,
      has_expiry: dtForm.has_expiry,
    };
    let error;
    if (dtEditing) {
      ({ error } = await supabase.from('company_document_types' as any).update(payload).eq('id', dtEditing));
    } else {
      const maxOrder = docTypes.reduce((m, d) => Math.max(m, d.sort_order || 0), 0);
      ({ error } = await supabase.from('company_document_types' as any).insert({ ...payload, sort_order: maxOrder + 10 }));
    }
    setSavingDt(false);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: dtEditing ? 'อัปเดตเอกสารแล้ว' : 'เพิ่มเอกสารแล้ว' });
    setDtDialogOpen(false);
    loadDocTypes();
  };
  const deleteDt = async (d: any) => {
    const { error } = await supabase.from('company_document_types' as any).delete().eq('id', d.id);
    if (error) { toast({ title: 'ลบไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'ลบเอกสารแล้ว' });
    loadDocTypes();
  };
  const toggleDtField = async (d: any, field: 'is_required' | 'active') => {
    await supabase.from('company_document_types' as any).update({ [field]: !d[field] }).eq('id', d.id);
    loadDocTypes();
  };
  const moveDt = async (index: number, dir: -1 | 1) => {
    const other = index + dir;
    if (other < 0 || other >= docTypes.length) return;
    const a = docTypes[index], b = docTypes[other];
    await Promise.all([
      supabase.from('company_document_types' as any).update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('company_document_types' as any).update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    loadDocTypes();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Settings</h1>
        <p className="text-sm text-muted-foreground">System configuration and user management</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-2"><Users className="w-4 h-4" />Users</TabsTrigger>
          <TabsTrigger value="roles" className="gap-2"><Shield className="w-4 h-4" />Roles</TabsTrigger>
          <TabsTrigger value="email" className="gap-2"><Mail className="w-4 h-4" />Email</TabsTrigger>
          <TabsTrigger value="docs" className="gap-2"><FileText className="w-4 h-4" />เอกสารบริษัท</TabsTrigger>
          <TabsTrigger value="pricelist" className="gap-2"><FileSpreadsheet className="w-4 h-4" />Pricelist</TabsTrigger>
          <TabsTrigger value="config" className="gap-2"><Settings className="w-4 h-4" />Config</TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-2" onClick={() => { if (!txnCounts) loadTxnCounts(); }}><Database className="w-4 h-4" />ระบบ</TabsTrigger>
        </TabsList>

        {/* ── Users Tab ── */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่อ / อีเมล..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>

            <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />สร้างผู้ใช้</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>สร้างผู้ใช้ใหม่</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>ชื่อ-นามสกุล</Label>
                    <Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>อีเมล</Label>
                    <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>รหัสผ่าน</Label>
                    <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>บทบาท</Label>
                    <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="procurement_officer">Procurement Officer</SelectItem>
                        <SelectItem value="approver">Approver</SelectItem>
                        <SelectItem value="executive">Executive</SelectItem>
                        <SelectItem value="supplier">Supplier</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreateUser} disabled={creating} className="w-full">
                    {creating ? 'กำลังสร้าง...' : 'สร้างผู้ใช้'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">ชื่อ</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">อีเมล</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">บทบาท</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">สถานะ</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingUsers ? (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">กำลังโหลด...</td></tr>
                    ) : users.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">ไม่พบผู้ใช้</td></tr>
                    ) : (
                      users.map((u) => {
                        const isActive = u.is_active !== false;
                        return (
                          <tr key={u.id} className="border-b hover:bg-muted/30">
                            <td className="p-3 font-medium">{u.full_name || '—'}</td>
                            <td className="p-3 text-muted-foreground">{u.email || '—'}</td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                {u.user_roles?.length > 0
                                  ? u.user_roles.map((r) => (
                                    <span
                                      key={r.role}
                                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[r.role] ?? 'bg-gray-100 text-gray-700'}`}
                                    >
                                      {r.role}
                                    </span>
                                  ))
                                  : <span className="text-muted-foreground text-xs">—</span>}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={isActive}
                                  onCheckedChange={() => handleToggleActive(u)}
                                  className="scale-90"
                                />
                                <span className={`text-xs font-medium ${isActive ? 'text-emerald-600' : 'text-destructive'}`}>
                                  {isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 gap-1 text-xs"
                                onClick={() => { setResetTarget(u); setNewPassword(''); }}
                              >
                                <KeyRound className="w-3 h-3" />
                                Reset Password
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                <span>{totalUsers} รายการ · หน้า {page} / {totalPages}</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="w-8 h-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Roles Tab ── */}
        <TabsContent value="roles">
          <Card>
            <CardHeader><CardTitle className="text-base">System Roles</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(['admin', 'procurement_officer', 'approver', 'executive', 'supplier'] as const).map((role) => (
                <div key={role} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <div>
                    <p className="font-medium capitalize">{role.replace('_', ' ')}</p>
                    <p className="text-xs text-muted-foreground">System role</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[role]}`}>
                    {role}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Email Tab ── */}
        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>การส่งอีเมลแจ้งเตือน</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-normal text-muted-foreground">
                    {emailConfig.email_enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                  </span>
                  <Switch checked={emailConfig.email_enabled} onCheckedChange={(v) => updateEmail('email_enabled', v)} />
                </div>
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">SMTP Server</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>SMTP Host</Label>
                  <Input value={emailConfig.smtp_host} onChange={e => updateEmail('smtp_host', e.target.value)} placeholder="smtp.gmail.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>Port</Label>
                  <Input value={emailConfig.smtp_port} onChange={e => updateEmail('smtp_port', e.target.value)} placeholder="587" />
                </div>
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input value={emailConfig.smtp_user} onChange={e => updateEmail('smtp_user', e.target.value)} placeholder="user@company.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" value={emailConfig.smtp_password} onChange={e => updateEmail('smtp_password', e.target.value)} placeholder="••••••••" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>ชื่อผู้ส่ง</Label>
                  <Input value={emailConfig.sender_name} onChange={e => updateEmail('sender_name', e.target.value)} placeholder="Smart Procurement" />
                </div>
                <div className="space-y-1.5">
                  <Label>อีเมลผู้ส่ง</Label>
                  <Input value={emailConfig.sender_email} onChange={e => updateEmail('sender_email', e.target.value)} placeholder="noreply@company.com" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">เหตุการณ์ที่ส่งอีเมล</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'notify_admin_new_supplier' as const, label: 'Supplier ลงทะเบียนใหม่ → แจ้ง Admin', desc: 'ส่งอีเมลถึง Admin เมื่อมี Supplier ลงทะเบียนใหม่' },
                { key: 'notify_supplier_approved' as const, label: 'อนุมัติ Supplier → แจ้ง Supplier', desc: 'ส่งอีเมลถึง Supplier เมื่อได้รับการอนุมัติ' },
                { key: 'notify_supplier_rejected' as const, label: 'ปฏิเสธ Supplier → แจ้ง Supplier', desc: 'ส่งอีเมลถึง Supplier เมื่อถูกปฏิเสธ' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch checked={emailConfig[key]} onCheckedChange={v => updateEmail(key, v)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">เทมเพลตอีเมล</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">อีเมลอนุมัติ</h4>
                <div className="space-y-1.5">
                  <Label>หัวข้อ</Label>
                  <Input value={emailConfig.approved_subject} onChange={e => updateEmail('approved_subject', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>เนื้อหา</Label>
                  <Textarea rows={5} value={emailConfig.approved_body} onChange={e => updateEmail('approved_body', e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">ตัวแปร: {'{{company_name}}'}, {'{{supplier_name}}'}, {'{{login_url}}'}</p>
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">อีเมลปฏิเสธ</h4>
                <div className="space-y-1.5">
                  <Label>หัวข้อ</Label>
                  <Input value={emailConfig.rejected_subject} onChange={e => updateEmail('rejected_subject', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>เนื้อหา</Label>
                  <Textarea rows={5} value={emailConfig.rejected_body} onChange={e => updateEmail('rejected_body', e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">ตัวแปร: {'{{company_name}}'}, {'{{supplier_name}}'}, {'{{reason}}'}</p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveEmailConfig} disabled={savingEmail}>
              <Save className="w-4 h-4 mr-2" />
              {savingEmail ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </Button>
          </div>
        </TabsContent>

        {/* ── Company Documents Tab ── */}
        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">รายการเอกสารบริษัทที่ขอจาก Supplier</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  กำหนดรายการเอกสารที่ต้องการให้ Supplier อัปโหลด (เช่น หนังสือรับรองบริษัท, ภพ.20, หน้า Book Bank) — จะแสดงเป็นช่องอัปโหลดในแท็บ "เอกสารบริษัท" ของแต่ละ Supplier
                </p>
              </div>
              <Button size="sm" onClick={openNewDt}><Plus className="w-4 h-4 mr-1" />เพิ่มเอกสาร</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {docTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">ยังไม่มีรายการเอกสาร — กด "เพิ่มเอกสาร"</p>
              ) : (
                docTypes.map((d, i) => (
                  <div key={d.id} className={`flex items-start gap-3 rounded-lg border p-3 ${d.active ? '' : 'opacity-50 bg-muted/30'}`}>
                    <div className="flex flex-col gap-0.5 pt-0.5">
                      <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => moveDt(i, -1)}><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === docTypes.length - 1} onClick={() => moveDt(i, 1)}><ArrowDown className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{d.name_th}</span>
                        {d.is_required
                          ? <Badge variant="outline" className="text-[10px] border-red-200 bg-red-50 text-red-600">บังคับ</Badge>
                          : <Badge variant="outline" className="text-[10px]">ถ้ามี</Badge>}
                        {d.has_expiry && <Badge variant="outline" className="text-[10px] border-amber-200 bg-amber-50 text-amber-700">มีวันหมดอายุ</Badge>}
                        {!d.active && <Badge variant="secondary" className="text-[10px]">ปิดใช้งาน</Badge>}
                      </div>
                      {d.description && <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="flex items-center gap-1.5 mr-2">
                        <Switch checked={d.is_required} onCheckedChange={() => toggleDtField(d, 'is_required')} className="scale-75" />
                        <span className="text-[11px] text-muted-foreground">บังคับ</span>
                      </div>
                      <div className="flex items-center gap-1.5 mr-2">
                        <Switch checked={d.active} onCheckedChange={() => toggleDtField(d, 'active')} className="scale-75" />
                        <span className="text-[11px] text-muted-foreground">ใช้งาน</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDt(d)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteDt(d)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pricelist Tab ── */}
        <TabsContent value="pricelist" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">รอบการอัปเดต Pricelist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>รอบการอัปเดตราคา (วัน)</Label>
                  <Input type="number" min={1} max={730}
                    value={cycle.update_cycle_days}
                    onChange={e => setCycle(c => ({ ...c, update_cycle_days: Number(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Supplier ต้องส่ง pricelist ใหม่ทุก ๆ {cycle.update_cycle_days} วัน
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>ระยะเวลายืนราคา (วัน)</Label>
                  <Input type="number" min={1} max={730}
                    value={cycle.hold_until_days ?? ''}
                    onChange={e => setCycle(c => ({ ...c, hold_until_days: Number(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Supplier ต้องยืนราคาตาม pricelist อย่างน้อย {cycle.hold_until_days || 0} วัน
                  </p>
                </div>
              </div>

              <div className="bg-muted/50 p-3 rounded text-xs space-y-1">
                <div className="font-medium">ผลของการตั้งค่า:</div>
                <div>• Supplier จะเห็น banner เตือนเมื่อใกล้ครบรอบ ({'<='} 7 วัน)</div>
                <div>• เมื่อเกินรอบจะแสดงสถานะ "เกินรอบ" สีแดง — ต้องส่ง pricelist ใหม่</div>
                <div>• Procurement เห็นสถานะของ supplier แต่ละรายในหน้า catalog</div>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveCycle} disabled={savingCycle}>
                  <Save className="w-4 h-4 mr-2" />
                  {savingCycle ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Config Tab ── */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">น้ำหนักการให้คะแนนจัดซื้อ (Scoring Weights)</CardTitle>
              <p className="text-sm text-muted-foreground">
                กำหนดน้ำหนักของแต่ละด้านที่ใช้คิด Final Score ในการเปรียบเทียบใบเสนอราคา — ต้องรวมกันได้ <strong>100%</strong>
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                {([
                  { key: 'commercial', label: 'Commercial', desc: 'ราคา + Lead Time + Payment Term' },
                  { key: 'technical',  label: 'Technical',  desc: 'จาก Technical checklist' },
                  { key: 'risk',       label: 'Risk Score', desc: 'จากเกณฑ์ความเสี่ยง (BRC)' },
                ] as const).map(({ key, label, desc }) => (
                  <div key={key} className="p-3 rounded-lg border space-y-2">
                    <div>
                      <Label className="text-sm font-medium">{label}</Label>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                      {key === 'risk' && (
                        <p className="text-[11px] text-teal-700 mt-1 flex items-start gap-1">
                          <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>= เกรด BRCGS · ตั้งค่าที่หน้า "เกณฑ์ความเสี่ยง" (ปัจจุบัน = ความปลอดภัย/คุณภาพ 100%)</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="number" min={0} max={100} value={weights[key]}
                        onChange={e => updateWeight(key, e.target.value)} className="text-right font-semibold" />
                      <span className="text-muted-foreground">%</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className={`flex items-center justify-between rounded-lg border p-3 text-sm ${weightsTotal === 100 ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-300 bg-amber-50'}`}>
                <span className="font-medium">รวมทั้งหมด</span>
                <span className={`font-bold ${weightsTotal === 100 ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {weightsTotal}% {weightsTotal !== 100 && `(ต้องเป็น 100%)`}
                </span>
              </div>

              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">สูตร Final Score</p>
                <p>Final = Commercial×{weights.commercial}% + Technical×{weights.technical}% + Risk×{weights.risk}%</p>
              </div>

              {/* 2-layer relationship note */}
              <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs space-y-2">
                <p className="font-medium text-blue-900 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />การให้คะแนนมี 2 ชั้น (ไม่นับซ้ำ)
                </p>
                <div className="space-y-1 text-muted-foreground">
                  <p><b className="text-foreground">ชั้นที่ 1 — หน้านี้:</b> น้ำหนักตัดสินผู้ชนะ RFQ ว่าแต่ละด้านสำคัญแค่ไหน (Commercial / Technical / Risk)</p>
                  <p><b className="text-foreground">ชั้นที่ 2 — หน้า "เกณฑ์ความเสี่ยง":</b> กำหนดว่า "เกรด BRCGS" (ที่ป้อนเข้าเสา Risk) คิดจากอะไร</p>
                </div>
                <div className="pt-1 border-t border-blue-200/60 text-muted-foreground">
                  <p>• <b>ราคา</b> → นับที่เสา <b>Commercial</b> เท่านั้น</p>
                  <p>• <b>Delivery + Credit term</b> → นับที่ <b>เกณฑ์ BRCGS</b> (เข้ามาทางเสา Risk)</p>
                  <p>• <b>ความปลอดภัย/คุณภาพ</b> → นับที่ <b>เกณฑ์ BRCGS</b> เช่นกัน</p>
                  <p>• <b>Technical</b> → เกณฑ์ทางเทคนิคที่นอกเหนือจาก BRCGS</p>
                  <p className="text-[11px] mt-0.5">แต่ละด้านถูกนับที่เดียว จึงไม่ทับซ้อน และสอดคล้อง BRCGS Clause 3.5.1.3</p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setWeights(DEFAULT_SCORING_WEIGHTS)}>
                  ค่าเริ่มต้น (60/25/15)
                </Button>
                <Button onClick={saveWeights} disabled={savingWeights || weightsTotal !== 100}>
                  <Save className="w-4 h-4 mr-2" />{savingWeights ? 'กำลังบันทึก...' : 'บันทึก'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Maintenance / System Tab ── */}
        <TabsContent value="maintenance" className="space-y-4">
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <Trash2 className="w-4 h-4" />
                ล้างข้อมูล Transaction (เริ่มใช้งานระบบจริง)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">ใช้สำหรับล้างข้อมูลทดสอบก่อนเริ่มใช้งานจริง</p>
                  <p className="text-xs">
                    ระบบจะลบ <strong>เฉพาะข้อมูล Transaction ในกลุ่มจัดซื้อ</strong> ได้แก่ ใบขอราคา (RFQ),
                    การประมูล (e-Bidding), ใบเสนอราคา/ใบเสนอราคาสุดท้าย และการมอบงาน (Awards) พร้อมรายการที่เกี่ยวข้อง
                    — <strong>เฉพาะของบริษัทที่คุณสังกัด</strong>
                  </p>
                  <p className="text-xs">
                    ✅ <strong>ไม่ลบ</strong> Master Data: ผู้จัดจำหน่าย (Suppliers) และ Catalog/รายการราคา (Price Lists)
                  </p>
                </div>
              </div>

              {/* Current counts */}
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">ข้อมูลปัจจุบันที่จะถูกลบ</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadTxnCounts} disabled={loadingCounts}>
                    {loadingCounts ? <Loader2 className="w-3 h-3 animate-spin" /> : 'รีเฟรช'}
                  </Button>
                </div>
                {txnCounts === null ? (
                  <p className="text-xs text-muted-foreground">{loadingCounts ? 'กำลังโหลด...' : 'กดรีเฟรชเพื่อดูจำนวน'}</p>
                ) : txnTotal === 0 ? (
                  <p className="text-xs text-emerald-600">ไม่มีข้อมูล Transaction — ระบบสะอาดพร้อมใช้งานจริงแล้ว</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                    {Object.entries(TXN_LABELS).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between text-xs">
                        <span className={label.startsWith('—') ? 'text-muted-foreground pl-2' : 'font-medium'}>{label}</span>
                        <span className={`font-mono ${(txnCounts[key] ?? 0) > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {(txnCounts[key] ?? 0).toLocaleString('th-TH')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  รวม <strong className="text-foreground">{txnTotal.toLocaleString('th-TH')}</strong> รายการ
                </span>
                <Button
                  variant="destructive"
                  onClick={() => { setClearConfirmText(''); setShowClearConfirm(true); }}
                  disabled={txnTotal === 0}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  ล้างข้อมูล Transaction
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Clear Transaction Confirm Dialog ── */}
      <Dialog open={showClearConfirm} onOpenChange={(open) => { if (!open) { setShowClearConfirm(false); setClearConfirmText(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              ยืนยันการล้างข้อมูล Transaction
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              การลบนี้ <strong className="text-destructive">ไม่สามารถกู้คืนได้</strong> ระบบจะลบข้อมูล Transaction ทั้งหมด
              จำนวน <strong className="text-foreground">{txnTotal.toLocaleString('th-TH')}</strong> รายการ
              (RFQ, e-Bidding, ใบเสนอราคา, Awards) ของบริษัทคุณ — Suppliers และ Catalog จะไม่ถูกลบ
            </p>
            <div className="space-y-2">
              <Label className="text-sm">พิมพ์ <span className="font-mono font-semibold text-destructive">{CLEAR_PHRASE}</span> เพื่อยืนยัน</Label>
              <Input
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                placeholder={CLEAR_PHRASE}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowClearConfirm(false); setClearConfirmText(''); }} disabled={clearing}>
                ยกเลิก
              </Button>
              <Button
                variant="destructive"
                onClick={handleClearTransactions}
                disabled={clearing || clearConfirmText.trim() !== CLEAR_PHRASE}
              >
                {clearing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                {clearing ? 'กำลังลบ...' : 'ยืนยันล้างข้อมูล'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Company Document Type Dialog ── */}
      <Dialog open={dtDialogOpen} onOpenChange={setDtDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dtEditing ? 'แก้ไขเอกสาร' : 'เพิ่มเอกสารบริษัท'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ชื่อเอกสาร *</Label>
              <Input value={dtForm.name_th} onChange={e => setDtForm(f => ({ ...f, name_th: e.target.value }))} placeholder="เช่น หนังสือรับรองบริษัท" />
            </div>
            <div className="space-y-2">
              <Label>คำอธิบาย</Label>
              <Textarea rows={2} value={dtForm.description} onChange={e => setDtForm(f => ({ ...f, description: e.target.value }))} placeholder="รายละเอียด / เงื่อนไข เช่น อายุไม่เกิน 6 เดือน" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <div>
                <p className="text-sm font-medium">บังคับส่ง</p>
                <p className="text-xs text-muted-foreground">Supplier ต้องอัปโหลดเอกสารนี้</p>
              </div>
              <Switch checked={dtForm.is_required} onCheckedChange={v => setDtForm(f => ({ ...f, is_required: v }))} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <div>
                <p className="text-sm font-medium">มีวันหมดอายุ</p>
                <p className="text-xs text-muted-foreground">ให้กรอกวันหมดอายุตอนอัปโหลด + แจ้งเตือนเมื่อใกล้หมด</p>
              </div>
              <Switch checked={dtForm.has_expiry} onCheckedChange={v => setDtForm(f => ({ ...f, has_expiry: v }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDtDialogOpen(false)}>ยกเลิก</Button>
              <Button onClick={saveDt} disabled={savingDt || !dtForm.name_th.trim()}>
                {savingDt ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />กำลังบันทึก...</> : 'บันทึก'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ── */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) { setResetTarget(null); setNewPassword(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>รีเซ็ตรหัสผ่าน</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ผู้ใช้: <span className="font-medium text-foreground">{resetTarget?.email}</span>
            </p>
            <div className="space-y-2">
              <Label>รหัสผ่านใหม่</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setResetTarget(null); setNewPassword(''); }}>ยกเลิก</Button>
              <Button onClick={handleResetPassword} disabled={resetting || newPassword.length < 6}>
                {resetting ? 'กำลังบันทึก...' : 'บันทึก'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
