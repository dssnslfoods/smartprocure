import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Search, CheckCircle2, XCircle, Eye, FileText, Download, Building2, User, KeyRound, Pencil, Save, Loader2, Trash2, AlertTriangle, History } from 'lucide-react';
import SupplierBlacklistAction from '@/components/SupplierBlacklistAction';

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
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [deleteTxDetails, setDeleteTxDetails] = useState<any[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const { toast } = useToast();

  const fetchSuppliers = async () => {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .in('status', ['draft', 'submitted', 'review', 'approved', 'rejected'])
      .order('created_at', { ascending: false });
    if (error) console.error('fetchSuppliers error:', error);
    if (data) setSuppliers(data);
    setLoading(false);
  };

  useEffect(() => { fetchSuppliers(); }, []);

  const openDetail = async (supplier: any, startEditing = false) => {
    setSelected(supplier);
    setRejectReason('');
    setEditing(startEditing);
    setEditForm({
      company_name: supplier.company_name || '',
      tax_id: supplier.tax_id || '',
      address: supplier.address || '',
      city: supplier.city || '',
      country: supplier.country || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      website: supplier.website || '',
      contact_person: supplier.contact_person || '',
      notes: supplier.notes || '',
    });
    const [contactsRes, docsRes] = await Promise.all([
      supabase.from('supplier_contacts').select('*').eq('supplier_id', supplier.id),
      supabase.from('supplier_documents').select('*').eq('supplier_id', supplier.id),
    ]);
    setContacts(contactsRes.data || []);
    setDocuments(docsRes.data || []);
    setDetailOpen(true);
  };

  const handleEditChange = (field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    // Only contact-type fields are editable here — everything else on the
    // registration (company name, tax ID, address, ...) is locked.
    const changed = EDIT_FIELDS.filter(f => (editForm[f.key] || '') !== (selected[f.key] || ''));
    if (changed.length === 0) { setEditing(false); return; }

    setSaving(true);
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    changed.forEach(f => { payload[f.key] = editForm[f.key] || null; });
    const { error } = await supabase.from('suppliers').update(payload).eq('id', selected.id);

    if (error) {
      setSaving(false);
      toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' });
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    await supabase.from('supplier_contact_history').insert(changed.map(f => ({
      supplier_id: selected.id,
      field: f.key,
      old_value: selected[f.key] || null,
      new_value: editForm[f.key] || null,
      changed_by: userData.user?.id ?? null,
      changed_by_email: userData.user?.email ?? null,
    })));

    setSaving(false);
    toast({ title: 'บันทึกสำเร็จ', description: `อัปเดตข้อมูลติดต่อของ ${selected.company_name} เรียบร้อย — เก็บค่าเดิมไว้ในประวัติแล้ว` });
    setEditing(false);
    setSelected((prev: any) => ({ ...prev, ...payload }));
    fetchSuppliers();
  };

  const loadHistory = async (supplierId: string) => {
    setHistoryLoading(true);
    setHistoryOpen(true);
    const { data } = await supabase.from('supplier_contact_history')
      .select('*').eq('supplier_id', supplierId).order('changed_at', { ascending: false });
    setHistory(data || []);
    setHistoryLoading(false);
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
      const sup = suppliers.find(s => s.id === id);
      if (sup?.created_by) {
        await supabase.from('profiles').update({ is_active: true }).eq('id', sup.created_by);
        await supabase.from('notifications').insert({
          user_id: sup.created_by,
          title: 'การลงทะเบียนได้รับอนุมัติ',
          message: `บริษัท ${sup.company_name} ได้รับการอนุมัติแล้ว คุณสามารถเข้าสู่ระบบได้ทันที`,
          type: 'approval',
          link: '/supplier-portal',
        });
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
    if (!resetTarget.email) {
      toast({ title: 'Supplier ไม่มี email', description: 'ต้องมี email ก่อนจึงจะสร้าง account ได้', variant: 'destructive' });
      return;
    }
    setResetLoading(true);
    const { data, error } = await supabase.rpc('admin_reset_or_create_supplier_login', {
      p_supplier_id: resetTarget.id,
      p_new_password: newPassword,
    });
    setResetLoading(false);
    if (error) {
      toast({ title: 'เกิดข้อผิดพลาด', description: error.message, variant: 'destructive' });
    } else {
      const action = data?.action === 'created' ? 'สร้าง account ใหม่และ' : '';
      toast({ title: `${action}รีเซ็ตรหัสผ่านสำเร็จ`, description: `${resetTarget.email} — ใช้ login ได้แล้ว` });
      setResetOpen(false);
      setNewPassword('');
      setResetTarget(null);
      fetchSuppliers();
    }
  };

  const handleDeleteClick = async (supplier: any) => {
    setDeleteTarget(supplier);
    setDeleteBlocked(false);
    setDeleteTxDetails([]);
    setDeleteChecking(true);
    setDeleteOpen(true);

    const { data, error } = await supabase.rpc('check_supplier_transactions', { p_supplier_id: supplier.id });
    setDeleteChecking(false);

    if (error) {
      toast({ title: 'ตรวจสอบไม่สำเร็จ', description: error.message, variant: 'destructive' });
      setDeleteOpen(false);
      return;
    }

    if (data?.has_transactions) {
      setDeleteBlocked(true);
      setDeleteTxDetails(data.details || []);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleteBlocked) return;
    setDeleting(true);
    const { error } = await supabase.from('suppliers').delete().eq('id', deleteTarget.id);
    setDeleting(false);

    if (error) {
      toast({ title: 'ลบไม่สำเร็จ', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'ลบสำเร็จ', description: `ลบ ${deleteTarget.company_name} เรียบร้อย` });
      if (detailOpen && selected?.id === deleteTarget.id) setDetailOpen(false);
      fetchSuppliers();
    }
    setDeleteOpen(false);
    setDeleteTarget(null);
  };

  const filtered = suppliers.filter(s =>
    s.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.tax_id?.toLowerCase().includes(search.toLowerCase())
  );

  const pagination = usePagination(filtered, { pageSize: 20 });

  // Only contact-type info may be edited from this screen — company name, tax
  // ID, address, etc. are part of the verified registration and stay locked.
  // Every change here is kept in supplier_contact_history.
  const EDIT_FIELDS: { key: string; label: string; required?: boolean }[] = [
    { key: 'contact_person', label: 'ผู้ติดต่อ' },
    { key: 'phone', label: 'เบอร์โทร' },
    { key: 'email', label: 'อีเมล' },
  ];
  const LOCKED_FIELDS: { key: string; label: string }[] = [
    { key: 'company_name', label: 'ชื่อบริษัท' },
    { key: 'tax_id', label: 'เลขประจำตัวผู้เสียภาษี' },
    { key: 'website', label: 'เว็บไซต์' },
    { key: 'address', label: 'ที่อยู่' },
    { key: 'city', label: 'จังหวัด' },
    { key: 'country', label: 'ประเทศ' },
  ];

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
                    <tr key={s.id} className={`border-b hover:bg-muted/30 ${s.is_blacklisted ? 'bg-red-50 hover:bg-red-100/70' : ''}`}>
                      <td className="p-3 font-medium">
                        {s.company_name}
                        {s.is_blacklisted && (
                          <Badge variant="outline" className="ml-2 border-red-300 bg-red-50 text-red-700 text-[10px] align-middle">
                            Blacklisted
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{s.tax_id || '—'}</td>
                      <td className="p-3 text-muted-foreground">{s.email || '—'}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className={
                          s.status === 'draft'     ? 'bg-gray-500/10 text-gray-600' :
                          s.status === 'submitted' ? 'bg-amber-500/10 text-amber-600' :
                          s.status === 'review'    ? 'bg-blue-500/10 text-blue-600' :
                          s.status === 'approved'  ? 'bg-emerald-500/10 text-emerald-600' :
                          'bg-red-500/10 text-red-600'
                        }>
                          {s.status === 'draft'     ? 'ร่าง' :
                           s.status === 'submitted' ? 'รอตรวจสอบ' :
                           s.status === 'review'    ? 'กำลังตรวจสอบ' :
                           s.status === 'approved'  ? 'อนุมัติแล้ว' : 'ปฏิเสธ'}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{new Date(s.created_at).toLocaleDateString('th-TH')}</td>
                      <td className="p-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => openDetail(s, false)}>
                            <Eye className="w-3 h-3 mr-1" /> ตรวจสอบ
                          </Button>
                          <Button variant="ghost" size="sm" className="text-orange-600" onClick={() => openDetail(s, true)}>
                            <Pencil className="w-3 h-3 mr-1" /> แก้ไข
                          </Button>
                          {s.created_by && (
                            <Button variant="ghost" size="sm" className="text-blue-600" onClick={() => { setResetTarget(s); setNewPassword(''); setResetOpen(true); }}>
                              <KeyRound className="w-3 h-3 mr-1" /> รีเซ็ตรหัสผ่าน
                            </Button>
                          )}
                          <SupplierBlacklistAction supplier={s} onChanged={fetchSuppliers} />
                          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleDeleteClick(s)}>
                            <Trash2 className="w-3 h-3 mr-1" /> ลบ
                          </Button>
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

      {/* Detail / Edit Dialog */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setEditing(false); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{editing ? 'แก้ไขข้อมูล Supplier' : 'ตรวจสอบข้อมูล Supplier'}</DialogTitle>
              {!editing && (
                <Button variant="outline" size="sm" className="text-orange-600" onClick={() => setEditing(true)}>
                  <Pencil className="w-3 h-3 mr-1" /> แก้ไข
                </Button>
              )}
            </div>
          </DialogHeader>
          {selected && (
            <div className="space-y-6">
              {/* Company Info */}
              <div>
                <h3 className="font-medium flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4" /> ข้อมูลบริษัท
                </h3>
                {editing ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-muted/30 p-3 grid gap-2 text-sm">
                      <p className="text-xs text-muted-foreground mb-1">
                        ข้อมูลลงทะเบียนที่ตรวจสอบแล้ว — แก้ไขไม่ได้จากหน้านี้
                      </p>
                      {LOCKED_FIELDS.map(f => <Row key={f.key} label={f.label} value={selected[f.key]} />)}
                      {selected.notes && <Row label="หมายเหตุ" value={selected.notes} />}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {EDIT_FIELDS.map(f => (
                        <div key={f.key} className="space-y-1.5">
                          <Label className="text-xs">{f.label}</Label>
                          <Input
                            value={editForm[f.key] || ''}
                            onChange={e => handleEditChange(f.key, e.target.value)}
                            placeholder={f.label}
                            className="h-9"
                          />
                        </div>
                      ))}
                    </div>
                    <Button variant="ghost" size="sm" className="text-muted-foreground"
                      onClick={() => loadHistory(selected.id)}>
                      <History className="w-3.5 h-3.5 mr-1" /> ดูประวัติการแก้ไข
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-2 text-sm">
                    <Row label="ชื่อบริษัท" value={selected.company_name} />
                    <Row label="Tax ID" value={selected.tax_id} />
                    <Row label="ผู้ติดต่อ" value={selected.contact_person} />
                    <Row label="ที่อยู่" value={selected.address} />
                    <Row label="จังหวัด/เมือง" value={selected.city} />
                    <Row label="ประเทศ" value={selected.country} />
                    <Row label="เบอร์โทร" value={selected.phone} />
                    <Row label="อีเมล" value={selected.email} />
                    <Row label="เว็บไซต์" value={selected.website} />
                    {selected.notes && <Row label="หมายเหตุ" value={selected.notes} />}
                  </div>
                )}
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
                {editing ? (
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setEditing(false)}>ยกเลิก</Button>
                    <Button onClick={handleSaveEdit} disabled={saving} className="bg-orange-500 hover:bg-orange-600">
                      {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> กำลังบันทึก...</> : <><Save className="w-4 h-4 mr-1" /> บันทึก</>}
                    </Button>
                  </div>
                ) : (
                  <>
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
                      <div className="flex-1" />
                      <SupplierBlacklistAction supplier={selected}
                        onChanged={() => { fetchSuppliers(); setDetailOpen(false); }} />
                      <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDeleteClick(selected)}>
                        <Trash2 className="w-4 h-4 mr-1" /> ลบ Supplier
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!open) { setDeleteOpen(false); setDeleteTarget(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {deleteBlocked ? <AlertTriangle className="w-5 h-5 text-amber-500" /> : <Trash2 className="w-5 h-5 text-red-500" />}
              {deleteBlocked ? 'ไม่สามารถลบได้' : 'ยืนยันการลบ Supplier'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {deleteChecking ? (
                  <div className="flex items-center gap-2 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังตรวจสอบข้อมูลที่เกี่ยวข้อง...</span>
                  </div>
                ) : deleteBlocked ? (
                  <>
                    <p>
                      ไม่สามารถลบ <span className="font-semibold text-foreground">{deleteTarget?.company_name}</span> ได้ เนื่องจากมีข้อมูล Transaction ในระบบ:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {deleteTxDetails.map((d: any, i: number) => (
                        <li key={i}>{d.table}: {d.count} รายการ</li>
                      ))}
                    </ul>
                    <p className="text-sm text-muted-foreground">
                      กรุณาลบข้อมูล Transaction ที่เกี่ยวข้องก่อน หรือเปลี่ยนสถานะเป็น "ปฏิเสธ" แทน
                    </p>
                  </>
                ) : (
                  <p>
                    คุณต้องการลบ <span className="font-semibold text-foreground">{deleteTarget?.company_name}</span> ออกจากระบบหรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            {!deleteBlocked && !deleteChecking && (
              <AlertDialogAction
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> กำลังลบ...</> : <><Trash2 className="w-4 h-4 mr-1" /> ยืนยันลบ</>}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Contact field edit history */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg max-h-[75vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="w-4 h-4" /> ประวัติการแก้ไขข้อมูลติดต่อ</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด...
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">ยังไม่มีประวัติการแก้ไข</p>
          ) : (
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {EDIT_FIELDS.find(f => f.key === h.field)?.label || h.field}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(h.changed_at).toLocaleString('th-TH')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground line-through">{h.old_value || '(ว่าง)'}</span>
                    <span>→</span>
                    <span className="font-medium">{h.new_value || '(ว่าง)'}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">โดย {h.changed_by_email || 'ไม่ทราบผู้แก้ไข'}</p>
                </div>
              ))}
            </div>
          )}
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
