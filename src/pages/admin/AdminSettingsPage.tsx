import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Plus, Users, Shield, Settings, Mail, Save, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabasePagination } from '@/hooks/use-supabase-pagination';
import { PaginationControls } from '@/components/PaginationControls';

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

export default function AdminSettingsPage() {
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'procurement_officer' as string });
  const [creating, setCreating] = useState(false);
  const [emailConfig, setEmailConfig] = useState<EmailConfig>(DEFAULT_EMAIL_CONFIG);
  const [savingEmail, setSavingEmail] = useState(false);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchEmailConfig();
  }, []);

  const filters = useCallback((query: any) => {
    if (search) {
      return query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    return query;
  }, [search]);

  const pagination = useSupabasePagination<any>({
    tableName: 'profiles',
    select: '*, user_roles(role)',
    pageSize: 20,
    filters,
  });

  const fetchEmailConfig = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('*')
      .eq('key', 'email_config')
      .maybeSingle();
    if (data?.value) {
      setEmailConfig({ ...DEFAULT_EMAIL_CONFIG, ...(data.value as Record<string, any>) });
    }
  };

  const saveEmailConfig = async () => {
    setSavingEmail(true);
    const { error } = await supabase.from('system_settings').upsert({
      key: 'email_config',
      value: emailConfig as any,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'key' });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'บันทึกสำเร็จ', description: 'ตั้งค่าอีเมลถูกบันทึกแล้ว' });
    }
    setSavingEmail(false);
  };

  const updateEmail = (key: keyof EmailConfig, val: any) => {
    setEmailConfig(prev => ({ ...prev, [key]: val }));
  };

  const handleCreateUser = async () => {
    setCreating(true);
    const { data, error } = await supabase.auth.signUp({
      email: newUser.email,
      password: newUser.password,
      options: { data: { full_name: newUser.full_name } },
    });
    if (data?.user) {
      await supabase.from('user_roles').insert({
        user_id: data.user.id,
        role: newUser.role as any,
      } as any);
    }
    setCreating(false);
    setShowCreateUser(false);
    setNewUser({ email: '', password: '', full_name: '', role: 'procurement_officer' });
    pagination.refresh();
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

        <TabsContent value="users" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Create User</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
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
                    {creating ? 'Creating...' : 'Create User'}
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
                      <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Role(s)</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.loading ? (
                      <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                    ) : pagination.items.length === 0 ? (
                      <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No users found</td></tr>
                    ) : (
                      pagination.items.map((u) => (
                        <tr key={u.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-medium">{u.full_name || '—'}</td>
                          <td className="p-3 text-muted-foreground">{u.email || '—'}</td>
                          <td className="p-3">
                            {u.user_roles?.map((r: any) => (
                              <Badge key={r.role} variant="secondary" className="mr-1">{r.role}</Badge>
                            )) || '—'}
                          </td>
                          <td className="p-3">
                            <Badge variant="secondary" className={u.is_active !== false ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}>
                              {u.is_active !== false ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationControls {...pagination} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader><CardTitle className="text-base">System Roles</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {['admin', 'procurement_officer', 'approver', 'executive', 'supplier'].map((role) => (
                <div key={role} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <div>
                    <p className="font-medium capitalize">{role.replace('_', ' ')}</p>
                    <p className="text-xs text-muted-foreground">System role</p>
                  </div>
                  <Badge variant="secondary">Built-in</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>การส่งอีเมลแจ้งเตือน</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-normal text-muted-foreground">
                    {emailConfig.email_enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                  </span>
                  <Switch
                    checked={emailConfig.email_enabled}
                    onCheckedChange={(v) => updateEmail('email_enabled', v)}
                  />
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
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <p className="text-sm font-medium">Supplier ลงทะเบียนใหม่ → แจ้ง Admin</p>
                  <p className="text-xs text-muted-foreground">ส่งอีเมลถึง Admin เมื่อมี Supplier ลงทะเบียนใหม่</p>
                </div>
                <Switch checked={emailConfig.notify_admin_new_supplier} onCheckedChange={v => updateEmail('notify_admin_new_supplier', v)} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <p className="text-sm font-medium">อนุมัติ Supplier → แจ้ง Supplier</p>
                  <p className="text-xs text-muted-foreground">ส่งอีเมลถึง Supplier เมื่อได้รับการอนุมัติ</p>
                </div>
                <Switch checked={emailConfig.notify_supplier_approved} onCheckedChange={v => updateEmail('notify_supplier_approved', v)} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <p className="text-sm font-medium">ปฏิเสธ Supplier → แจ้ง Supplier</p>
                  <p className="text-xs text-muted-foreground">ส่งอีเมลถึง Supplier เมื่อถูกปฏิเสธ</p>
                </div>
                <Switch checked={emailConfig.notify_supplier_rejected} onCheckedChange={v => updateEmail('notify_supplier_rejected', v)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">เทมเพลตอีเมล</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">อีเมลอนุมัติ</h4>
                <div className="space-y-1.5">
                  <Label>หัวข้อ</Label>
                  <Input value={emailConfig.approved_subject} onChange={e => updateEmail('approved_subject', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>เนื้อหา</Label>
                  <Textarea rows={5} value={emailConfig.approved_body} onChange={e => updateEmail('approved_body', e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  ตัวแปรที่ใช้ได้: {'{{company_name}}'}, {'{{supplier_name}}'}, {'{{login_url}}'}
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">อีเมลปฏิเสธ</h4>
                <div className="space-y-1.5">
                  <Label>หัวข้อ</Label>
                  <Input value={emailConfig.rejected_subject} onChange={e => updateEmail('rejected_subject', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>เนื้อหา</Label>
                  <Textarea rows={5} value={emailConfig.rejected_body} onChange={e => updateEmail('rejected_body', e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  ตัวแปรที่ใช้ได้: {'{{company_name}}'}, {'{{supplier_name}}'}, {'{{reason}}'}
                </p>
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

        <TabsContent value="config">
          <Card>
            <CardHeader><CardTitle className="text-base">Scoring Weights</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <span className="text-sm">Service Score</span><span className="font-semibold">40%</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <span className="text-sm">Commercial Score</span><span className="font-semibold">25%</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <span className="text-sm">ESG Score</span><span className="font-semibold">20%</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <span className="text-sm">Reliability</span><span className="font-semibold">15%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
