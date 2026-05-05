import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Building2, User, FileText, Landmark, Save, Upload, Download, Trash2, Plus,
  Phone, Mail, Globe, MapPin, CheckCircle2, Clock, AlertCircle, X, FileBadge,
} from 'lucide-react';
import SupplierCertificates from './SupplierCertificates';

const DOC_TYPES = [
  { value: 'company_certificate', label: 'หนังสือรับรองบริษัท' },
  { value: 'vat_registration', label: 'ภพ.20' },
  { value: 'commercial_registration', label: 'หนังสือจดทะเบียนพาณิชย์' },
  { value: 'id_card', label: 'สำเนาบัตรประชาชนกรรมการ' },
  { value: 'bank_certificate', label: 'หนังสือรับรองบัญชีธนาคาร' },
  { value: 'financial_statement', label: 'งบการเงิน' },
  { value: 'other', label: 'เอกสารอื่นๆ' },
];

export default function SupplierPortal() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [supplier, setSupplier] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('company_certificate');
  const fileRef = useRef<HTMLInputElement>(null);

  // Editable form state
  const [form, setForm] = useState({
    company_name: '', tax_id: '', address: '', city: '', country: '',
    phone: '', email: '', website: '', notes: '',
  });

  const [contactForm, setContactForm] = useState({
    contact_name: '', position: '', email: '', phone: '',
  });
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);

  const fetchData = async () => {
    // Resolve the supplier row for the logged-in user. Prefer profile.supplier_id,
    // otherwise call the SECURITY DEFINER RPC link_my_supplier_account() which
    // bypasses RLS to find the row by created_by or email match and persists
    // the link to profiles.supplier_id for next time.
    let sid: string | null = profile?.supplier_id ?? null;

    if (!sid) {
      const { data: rpcSid } = await supabase.rpc('link_my_supplier_account');
      if (rpcSid) sid = rpcSid as string;
    }

    if (!sid) { setLoading(false); return; }

    const [supRes, conRes, docRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('id', sid).maybeSingle(),
      supabase.from('supplier_contacts').select('*').eq('supplier_id', sid).order('is_primary', { ascending: false }),
      supabase.from('supplier_documents').select('*').eq('supplier_id', sid).order('created_at', { ascending: false }),
    ]);

    if (supRes.data) {
      setSupplier(supRes.data);
      setForm({
        company_name: supRes.data.company_name || '',
        tax_id: supRes.data.tax_id || '',
        address: supRes.data.address || '',
        city: supRes.data.city || '',
        country: supRes.data.country || '',
        phone: supRes.data.phone || '',
        email: supRes.data.email || '',
        website: supRes.data.website || '',
        notes: supRes.data.notes || '',
      });
    }
    if (conRes.data) setContacts(conRes.data);
    if (docRes.data) setDocuments(docRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [profile?.supplier_id, user?.id, profile?.email]);

  const handleSaveCompany = async () => {
    if (!supplier?.id) return;
    setSaving(true);
    const { error } = await supabase.from('suppliers').update({
      ...form, updated_at: new Date().toISOString(),
    }).eq('id', supplier.id);

    if (error) {
      toast({ title: 'เกิดข้อผิดพลาด', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'บันทึกข้อมูลบริษัทเรียบร้อย' });
      fetchData();
    }
    setSaving(false);
  };

  const handleSaveContact = async () => {
    if (!supplier?.id || !contactForm.contact_name) return;
    if (editingContact) {
      await supabase.from('supplier_contacts').update(contactForm).eq('id', editingContact);
      toast({ title: 'อัปเดตผู้ติดต่อเรียบร้อย' });
    } else {
      await supabase.from('supplier_contacts').insert({
        ...contactForm, supplier_id: supplier.id, is_primary: contacts.length === 0,
      });
      toast({ title: 'เพิ่มผู้ติดต่อเรียบร้อย' });
    }
    setContactDialogOpen(false);
    setEditingContact(null);
    setContactForm({ contact_name: '', position: '', email: '', phone: '' });
    fetchData();
  };

  const handleDeleteContact = async (id: string) => {
    await supabase.from('supplier_contacts').delete().eq('id', id);
    toast({ title: 'ลบผู้ติดต่อเรียบร้อย' });
    fetchData();
  };

  const openEditContact = (c: any) => {
    setEditingContact(c.id);
    setContactForm({ contact_name: c.contact_name, position: c.position || '', email: c.email || '', phone: c.phone || '' });
    setContactDialogOpen(true);
  };

  const handleUploadDoc = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !docName || !supplier?.id) return;
    setUploading(true);

    const filePath = `${supplier.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from('supplier-documents').upload(filePath, file);

    if (uploadError) {
      toast({ title: 'อัปโหลดล้มเหลว', description: uploadError.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('supplier-documents').getPublicUrl(filePath);
    await supabase.from('supplier_documents').insert({
      supplier_id: supplier.id,
      document_name: docName,
      document_type: docType,
      file_url: urlData.publicUrl,
      file_size: file.size,
      uploaded_by: user?.id,
    });

    toast({ title: 'อัปโหลดเอกสารเรียบร้อย' });
    setDocName('');
    setDocType('company_certificate');
    setUploadOpen(false);
    setUploading(false);
    fetchData();
  };

  const handleDeleteDoc = async (doc: any) => {
    const path = doc.file_url?.split('/supplier-documents/')[1];
    if (path) await supabase.storage.from('supplier-documents').remove([path]);
    await supabase.from('supplier_documents').delete().eq('id', doc.id);
    toast({ title: 'ลบเอกสารเรียบร้อย' });
    fetchData();
  };

  const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
    draft: { icon: Clock, color: 'bg-muted text-muted-foreground', label: 'แบบร่าง' },
    submitted: { icon: Clock, color: 'bg-amber-500/10 text-amber-600', label: 'รอตรวจสอบ' },
    review: { icon: AlertCircle, color: 'bg-blue-500/10 text-blue-600', label: 'กำลังตรวจสอบ' },
    approved: { icon: CheckCircle2, color: 'bg-emerald-500/10 text-emerald-600', label: 'อนุมัติแล้ว' },
    rejected: { icon: X, color: 'bg-destructive/10 text-destructive', label: 'ถูกปฏิเสธ' },
    suspended: { icon: AlertCircle, color: 'bg-muted text-muted-foreground', label: 'ถูกระงับ' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="text-center py-20">
        <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">ไม่พบข้อมูล Supplier</h2>
        <p className="text-sm text-muted-foreground mt-1">บัญชีของคุณยังไม่ได้เชื่อมต่อกับข้อมูล Supplier</p>
      </div>
    );
  }

  const sc = statusConfig[supplier.status] || statusConfig.draft;
  const StatusIcon = sc.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supplier Portal</h1>
          <p className="text-sm text-muted-foreground">จัดการข้อมูลบริษัทและเอกสารของคุณ</p>
        </div>
        <Badge variant="secondary" className={`${sc.color} gap-1.5 text-sm px-3 py-1`}>
          <StatusIcon className="w-4 h-4" />
          {sc.label}
        </Badge>
      </div>

      {/* Rejection banner — shown when admin rejected the registration */}
      {supplier.status === 'rejected' && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <X className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-red-800">การลงทะเบียนของท่านไม่ผ่านการพิจารณา</p>
                {supplier.rejected_at && (
                  <p className="text-xs text-red-700 mt-0.5">
                    วันที่ปฏิเสธ: {new Date(supplier.rejected_at).toLocaleString('th-TH')}
                  </p>
                )}
                {supplier.rejection_reason ? (
                  <div className="mt-2 p-3 rounded-md bg-white border border-red-200 text-sm text-red-900">
                    <p className="text-xs font-semibold text-red-700 mb-1">เหตุผลจากผู้ดูแลระบบ:</p>
                    {supplier.rejection_reason}
                  </div>
                ) : (
                  <p className="text-sm text-red-700 mt-2">ผู้ดูแลระบบไม่ได้ระบุเหตุผล กรุณาติดต่อทีมจัดซื้อ</p>
                )}
                <div className="mt-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-900">
                  <p className="font-semibold mb-1">📝 ขั้นตอนถัดไป</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>แก้ไขข้อมูลในแท็บ "ข้อมูลบริษัท" / "ผู้ติดต่อ" / "เอกสาร" ตามเหตุผลข้างต้น</li>
                    <li>เมื่อพร้อมแล้ว กดปุ่ม "ส่งข้อมูลใหม่อีกครั้ง" ด้านล่าง</li>
                    <li>ระบบจะแจ้งผู้ดูแลตรวจสอบใหม่ — ท่านจะได้รับแจ้งผลทาง email/notification</li>
                  </ol>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  if (!confirm('ยืนยันส่งข้อมูลใหม่อีกครั้ง? ผู้ดูแลจะตรวจสอบและแจ้งผลกลับ')) return;
                  const { error } = await supabase.rpc('supplier_resubmit_registration');
                  if (error) {
                    toast({ title: 'ส่งใหม่ไม่สำเร็จ', description: error.message, variant: 'destructive' });
                  } else {
                    toast({ title: 'ส่งข้อมูลใหม่เรียบร้อย', description: 'ผู้ดูแลจะตรวจสอบและแจ้งผลกลับเร็วที่สุด' });
                    fetchData();
                  }
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                <Upload className="w-4 h-4 mr-2" /> ส่งข้อมูลใหม่อีกครั้ง
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resubmitted banner — confirmation after they hit resubmit */}
      {supplier.status === 'submitted' && supplier.resubmitted_at && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-blue-800">ส่งข้อมูลใหม่แล้ว — กำลังรอผู้ดูแลตรวจสอบ</p>
              <p className="text-xs text-blue-700 mt-1">
                ส่งเมื่อ: {new Date(supplier.resubmitted_at).toLocaleString('th-TH')} —
                ท่านจะได้รับแจ้งผลผ่าน email และ notification
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">บริษัท</p>
              <p className="font-semibold text-sm truncate">{supplier.company_name}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ผู้ติดต่อ</p>
              <p className="font-semibold text-sm">{contacts.length} คน</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">เอกสาร</p>
              <p className="font-semibold text-sm">{documents.length} ไฟล์</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Landmark className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tax ID</p>
              <p className="font-semibold text-sm">{supplier.tax_id || '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="company" className="space-y-4">
        <TabsList>
          <TabsTrigger value="company" className="gap-1.5"><Building2 className="w-4 h-4" /> ข้อมูลบริษัท</TabsTrigger>
          <TabsTrigger value="contacts" className="gap-1.5"><User className="w-4 h-4" /> ผู้ติดต่อ</TabsTrigger>
          <TabsTrigger value="certificates" className="gap-1.5"><FileBadge className="w-4 h-4" /> ใบรับรอง</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5"><FileText className="w-4 h-4" /> เอกสาร</TabsTrigger>
        </TabsList>

        {/* Company Info Tab */}
        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ข้อมูลบริษัท</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>ชื่อบริษัท</Label>
                  <Input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>เลขประจำตัวผู้เสียภาษี</Label>
                  <Input value={form.tax_id} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>เว็บไซต์</Label>
                  <Input value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>ที่อยู่</Label>
                <Textarea value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} rows={2} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>จังหวัด/เมือง</Label>
                  <Input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>ประเทศ</Label>
                  <Input value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>เบอร์โทรศัพท์</Label>
                  <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>อีเมล</Label>
                <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>หมายเหตุ</Label>
                <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveCompany} disabled={saving}>
                  <Save className="w-4 h-4 mr-1" /> {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">ผู้ติดต่อ</CardTitle>
              <Button size="sm" onClick={() => {
                setEditingContact(null);
                setContactForm({ contact_name: '', position: '', email: '', phone: '' });
                setContactDialogOpen(true);
              }}>
                <Plus className="w-4 h-4 mr-1" /> เพิ่มผู้ติดต่อ
              </Button>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">ยังไม่มีข้อมูลผู้ติดต่อ</p>
              ) : (
                <div className="space-y-3">
                  {contacts.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-4 rounded-lg border">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{c.contact_name}</p>
                          {c.is_primary && <Badge variant="outline" className="text-xs">หลัก</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{c.position || '—'}</p>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                          {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditContact(c)}>แก้ไข</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteContact(c.id)}>
                          <Trash2 className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Certificates Tab — full-featured cert management with AI extraction */}
        <TabsContent value="certificates">
          <SupplierCertificates supplierId={supplier.id} />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">เอกสาร</CardTitle>
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="w-4 h-4 mr-1" /> อัปโหลดเอกสาร
              </Button>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">ยังไม่มีเอกสาร</p>
              ) : (
                <div className="space-y-3">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{doc.document_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {DOC_TYPES.find(d => d.value === doc.document_type)?.label || doc.document_type || 'อื่นๆ'}
                            {' · '}{doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ''}
                            {' · '}{new Date(doc.created_at).toLocaleDateString('th-TH')}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {doc.file_url && (
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon"><Download className="w-4 h-4" /></Button>
                          </a>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteDoc(doc)}>
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Contact Dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingContact ? 'แก้ไขผู้ติดต่อ' : 'เพิ่มผู้ติดต่อใหม่'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>ชื่อ-นามสกุล *</Label>
              <Input value={contactForm.contact_name} onChange={e => setContactForm(p => ({ ...p, contact_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>ตำแหน่ง</Label>
              <Input value={contactForm.position} onChange={e => setContactForm(p => ({ ...p, position: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>อีเมล</Label>
              <Input type="email" value={contactForm.email} onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>เบอร์โทร</Label>
              <Input value={contactForm.phone} onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <Button onClick={handleSaveContact} disabled={!contactForm.contact_name} className="w-full">
              <Save className="w-4 h-4 mr-1" /> บันทึก
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>อัปโหลดเอกสาร</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>ชื่อเอกสาร *</Label>
              <Input value={docName} onChange={e => setDocName(e.target.value)} placeholder="เช่น หนังสือรับรองบริษัท 2568" />
            </div>
            <div className="space-y-1.5">
              <Label>ประเภทเอกสาร</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>เลือกไฟล์ *</Label>
              <Input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
            </div>
            <Button onClick={handleUploadDoc} disabled={uploading || !docName} className="w-full">
              <Upload className="w-4 h-4 mr-1" /> {uploading ? 'กำลังอัปโหลด...' : 'อัปโหลด'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
