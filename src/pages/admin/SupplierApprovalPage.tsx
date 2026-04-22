import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { Search, CheckCircle2, XCircle, Eye, FileText, Download, Building2, User, Landmark, KeyRound } from 'lucide-react';

export default function SupplierApprovalPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [rejectReason, setRejectReason] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const { toast } = useToast();

  const fetchSuppliers = async () => {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .in('status', ['submitted', 'review', 'approved', 'rejected'])
      .order('created_at', { ascending: false });
    if (error) console.error('fetchSuppliers error:', error);
    if (data) setSuppliers(data);
    setLoading(false);
  };

  useEffect(() => { fetchSuppliers(); }, []);

  const openDetail = async (supplier: any) => {
    setSelected(supplier);
    setRejectReason('');
    const [contactsRes, docsRes] = await Promise.all([
      supabase.from('supplier_contacts').select('*').eq('supplier_id', supplier.id),
      supabase.from('supplier_documents').select('*').eq('supplier_id', supplier.id),
    ]);
    setContacts(contactsRes.data || []);
    setDocuments(docsRes.data || []);
    setDetailOpen(true);
  };

  const handleApprove = async (id: string) => {
    const { error } = await supabase.from('suppliers').update({
      status: 'approved',
      approved_by: (await supabase.auth.getUser()).data.user?.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Update the profile's is_active
      const sup = suppliers.find(s => s.id === id);
      if (sup?.created_by) {
        await supabase.from('profiles').update({ is_active: true }).eq('id', sup.created_by);
        // Notify supplier in-app
        await supabase.from('notifications').insert({
          user_id: sup.created_by,
          title: 'การลงทะเบียนได้รับอนุมัติ',
          message: `บริษัท ${sup.company_name} ได้รับการอนุมัติแล้ว คุณสามารถเข้าสู่ระบบได้ทันที`,
          type: 'approval',
          link: '/supplier-portal',
        });
        // Send email notification
        const { data: emailCfg } = await supabase.from('system_settings').select('value').eq('key', 'email_config').maybeSingle();
        const cfg = emailCfg?.value as Record<string, any> | null;
        if (cfg?.email_enabled && cfg?.notify_supplier_approved) {
          const supplierEmail = sup.email || sup.profiles?.email;
          if (supplierEmail) {
            await supabase.functions.invoke('send-email', {
              body: {
                to: supplierEmail,
                subject: cfg.approved_subject || 'การลงทะเบียนได้รับอนุมัติ',
                body: cfg.approved_body || 'บริษัทของท่านได้รับการอนุมัติแล้ว',
                template_vars: {
                  company_name: sup.company_name,
                  supplier_name: sup.profiles?.full_name || sup.company_name,
                  login_url: window.location.origin + '/login',
                },
              },
            });
          }
        }
      }
      await supabase.from('approval_logs').insert({
        entity_type: 'supplier_registration',
        entity_id: id,
        action: 'approved',
        status: 'approved',
        comment: 'Supplier registration approved',
        approved_by: (await supabase.auth.getUser()).data.user?.id,
      });
      toast({ title: 'อนุมัติเรียบร้อย', description: 'Supplier สามารถเข้าสู่ระบบได้แล้ว' });
      setDetailOpen(false);
      fetchSuppliers();
    }
  };

  const handleReject = async (id: string) => {
    const { error } = await supabase.from('suppliers').update({
      status: 'rejected',
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    if (!error) {
      const sup = suppliers.find(s => s.id === id);
      if (sup?.created_by) {
        await supabase.from('notifications').insert({
          user_id: sup.created_by,
          title: 'การลงทะเบียนถูกปฏิเสธ',
          message: rejectReason
            ? `บริษัท ${sup.company_name} ถูกปฏิเสธ เหตุผล: ${rejectReason}`
            : `บริษัท ${sup.company_name} ถูกปฏิเสธ กรุณาติดต่อผู้ดูแลระบบ`,
          type: 'rejection',
          link: '/supplier-portal',
        });
        // Send email notification
        const { data: emailCfg2 } = await supabase.from('system_settings').select('value').eq('key', 'email_config').maybeSingle();
        const cfg2 = emailCfg2?.value as Record<string, any> | null;
        if (cfg2?.email_enabled && cfg2?.notify_supplier_rejected) {
          const supplierEmail = sup.email || sup.profiles?.email;
          if (supplierEmail) {
            await supabase.functions.invoke('send-email', {
              body: {
                to: supplierEmail,
                subject: cfg2.rejected_subject || 'แจ้งผลการพิจารณาลงทะเบียน',
                body: cfg2.rejected_body || 'บริษัทของท่านไม่ผ่านการพิจารณา',
                template_vars: {
                  company_name: sup.company_name,
                  supplier_name: sup.profiles?.full_name || sup.company_name,
                  reason: rejectReason || 'ไม่ระบุ',
                },
              },
            });
          }
        }
      }
      await supabase.from('approval_logs').insert({
        entity_type: 'supplier_registration',
        entity_id: id,
        action: 'rejected',
        status: 'rejected',
        comment: rejectReason || 'Rejected by admin',
        approved_by: (await supabase.auth.getUser()).data.user?.id,
      });
      toast({ title: 'ปฏิเสธเรียบร้อย' });
      setDetailOpen(false);
      setRejectReason('');
      fetchSuppliers();
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', variant: 'destructive' });
      return;
    }
    setResetLoading(true);
    const { error } = await supabase.rpc('admin_reset_supplier_password', {
      p_user_id: resetTarget.created_by,
      p_new_password: newPassword,
    });
    setResetLoading(false);
    if (error) {
      toast({ title: 'เกิดข้อผิดพลาด', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'รีเซ็ตรหัสผ่านสำเร็จ', description: `รหัสผ่านของ ${resetTarget.company_name} ถูกเปลี่ยนแล้ว` });
      setResetOpen(false);
      setNewPassword('');
      setResetTarget(null);
    }
  };

  const filtered = suppliers.filter(s =>
    s.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.tax_id?.toLowerCase().includes(search.toLowerCase())
  );

  const pagination = usePagination(filtered, { pageSize: 20 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">อนุมัติ Supplier ใหม่</h1>
        <p className="text-sm text-muted-foreground">ตรวจสอบข้อมูลและเอกสารของ Supplier ที่ลงทะเบียนใหม่</p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">รอตรวจสอบ</p>
            <p className="text-2xl font-bold text-amber-600">
              {suppliers.filter(s => s.status === 'submitted').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">กำลังตรวจสอบ</p>
            <p className="text-2xl font-bold text-blue-600">
              {suppliers.filter(s => s.status === 'review').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">อนุมัติแล้ว</p>
            <p className="text-2xl font-bold text-emerald-600">
              {suppliers.filter(s => s.status === 'approved').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">ปฏิเสธ</p>
            <p className="text-2xl font-bold text-red-600">
              {suppliers.filter(s => s.status === 'rejected').length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="ค้นหา Supplier..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">บริษัท</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Tax ID</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">ผู้ลงทะเบียน</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">สถานะ</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">วันที่</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : pagination.paginatedItems.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">ไม่มีรายการรออนุมัติ</td></tr>
                ) : (
                  pagination.paginatedItems.map(s => (
                    <tr key={s.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{s.company_name}</td>
                      <td className="p-3 text-muted-foreground">{s.tax_id || '—'}</td>
                      <td className="p-3 text-muted-foreground">{s.email || '—'}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className={
                          s.status === 'submitted' ? 'bg-amber-500/10 text-amber-600' :
                          s.status === 'review'    ? 'bg-blue-500/10 text-blue-600' :
                          s.status === 'approved'  ? 'bg-emerald-500/10 text-emerald-600' :
                          'bg-red-500/10 text-red-600'
                        }>
                          {s.status === 'submitted' ? 'รอตรวจสอบ' :
                           s.status === 'review'    ? 'กำลังตรวจสอบ' :
                           s.status === 'approved'  ? 'อนุมัติแล้ว' : 'ปฏิเสธ'}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{new Date(s.created_at).toLocaleDateString('th-TH')}</td>
                      <td className="p-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => openDetail(s)}>
                            <Eye className="w-3 h-3 mr-1" /> ตรวจสอบ
                          </Button>
                          {s.created_by && (
                            <Button variant="ghost" size="sm" className="text-blue-600" onClick={() => { setResetTarget(s); setNewPassword(''); setResetOpen(true); }}>
                              <KeyRound className="w-3 h-3 mr-1" /> รีเซ็ตรหัสผ่าน
                            </Button>
                          )}
                          {(s.status === 'submitted' || s.status === 'review') && (
                            <Button variant="outline" size="sm" className="text-emerald-600" onClick={() => handleApprove(s.id)}>
                              <CheckCircle2 className="w-3 h-3 mr-1" /> อนุมัติ
                            </Button>
                          )}
                        </div>
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

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ตรวจสอบข้อมูล Supplier</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-6">
              {/* Company Info */}
              <div>
                <h3 className="font-medium flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4" /> ข้อมูลบริษัท
                </h3>
                <div className="grid gap-2 text-sm">
                  <Row label="ชื่อบริษัท" value={selected.company_name} />
                  <Row label="Tax ID" value={selected.tax_id} />
                  <Row label="ที่อยู่" value={selected.address} />
                  <Row label="จังหวัด/เมือง" value={selected.city} />
                  <Row label="ประเทศ" value={selected.country} />
                  <Row label="เบอร์โทร" value={selected.phone} />
                  <Row label="อีเมล" value={selected.email} />
                  <Row label="เว็บไซต์" value={selected.website} />
                  {selected.notes && <Row label="หมายเหตุ" value={selected.notes} />}
                </div>
              </div>

              {/* Contacts */}
              {contacts.length > 0 && (
                <div>
                  <h3 className="font-medium flex items-center gap-2 mb-3">
                    <User className="w-4 h-4" /> ข้อมูลติดต่อ
                  </h3>
                  {contacts.map(c => (
                    <div key={c.id} className="grid gap-2 text-sm border rounded-lg p-3 mb-2">
                      <Row label="ชื่อ" value={c.contact_name} />
                      <Row label="ตำแหน่ง" value={c.position} />
                      <Row label="อีเมล" value={c.email} />
                      <Row label="เบอร์โทร" value={c.phone} />
                    </div>
                  ))}
                </div>
              )}

              {/* Documents */}
              <div>
                <h3 className="font-medium flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4" /> เอกสาร ({documents.length} ไฟล์)
                </h3>
                {documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ไม่มีเอกสาร</p>
                ) : (
                  <div className="space-y-2">
                    {documents.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{doc.document_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.document_type} · {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ''}
                            </p>
                          </div>
                        </div>
                        {doc.file_url && (
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm"><Download className="w-3 h-3 mr-1" /> ดูเอกสาร</Button>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="border-t pt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>เหตุผลกรณีปฏิเสธ</Label>
                  <Textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder="ระบุเหตุผล (กรณีปฏิเสธ)..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(selected.id)}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> อนุมัติ
                  </Button>
                  <Button variant="destructive" onClick={() => handleReject(selected.id)}>
                    <XCircle className="w-4 h-4 mr-1" /> ปฏิเสธ
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> รีเซ็ตรหัสผ่าน
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ตั้งรหัสผ่านใหม่สำหรับ <span className="font-medium text-foreground">{resetTarget?.company_name}</span>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">รหัสผ่านใหม่</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="อย่างน้อย 6 ตัวอักษร"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setResetOpen(false)}>ยกเลิก</Button>
              <Button onClick={handleResetPassword} disabled={resetLoading}>
                <KeyRound className="w-3 h-3 mr-1" />
                {resetLoading ? 'กำลังบันทึก...' : 'ยืนยัน'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value || '—'}</span>
    </div>
  );
}
