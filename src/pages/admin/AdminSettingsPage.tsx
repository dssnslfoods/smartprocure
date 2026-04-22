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
import { Plus, Users, Shield, Settings, Mail, Save, Search, KeyRound, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
      .select('id, email, full_name, is_active, created_at, user_roles(role)')
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
    } else {
      setUsers((data as unknown as UserRow[]) || []);
      setTotalUsers(count || 0);
    }
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
          <TabsTrigger value="config" className="gap-2"><Settings className="w-4 h-4" />Config</TabsTrigger>
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

        {/* ── Config Tab ── */}
        <TabsContent value="config">
          <Card>
            <CardHeader><CardTitle className="text-base">Scoring Weights</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  { label: 'Service Score', val: '40%' },
                  { label: 'Commercial Score', val: '25%' },
                  { label: 'ESG Score', val: '20%' },
                  { label: 'Reliability', val: '15%' },
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                    <span className="text-sm">{label}</span>
                    <span className="font-semibold">{val}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
