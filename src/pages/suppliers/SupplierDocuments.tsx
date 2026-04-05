import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, FileText, Download, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

const DOC_TYPES = ['Business License', 'Tax Certificate', 'Quality Certificate', 'Insurance', 'Financial Statement', 'Other'];

interface Props { supplierId: string; }

export default function SupplierDocuments({ supplierId }: Props) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('');
  const [docName, setDocName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user, hasRole } = useAuth();

  const fetchDocs = async () => {
    const { data } = await supabase.from('supplier_documents').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false });
    if (data) setDocs(data);
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, [supplierId]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !docName) return;
    setUploading(true);

    const filePath = `suppliers/${supplierId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from('supplier-documents').upload(filePath, file);

    if (uploadError) {
      toast({ title: 'Upload Failed', description: uploadError.message, variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('supplier-documents').getPublicUrl(filePath);

    await supabase.from('supplier_documents').insert({
      supplier_id: supplierId,
      document_name: docName,
      document_type: docType,
      file_url: urlData.publicUrl,
      file_size: file.size,
      uploaded_by: user?.id,
    });

    toast({ title: 'Document uploaded' });
    setDocName('');
    setDocType('');
    setOpen(false);
    setUploading(false);
    fetchDocs();
  };

  const handleDelete = async (doc: any) => {
    // Extract path from URL for storage deletion
    const path = doc.file_url?.split('/supplier-documents/')[1];
    if (path) await supabase.storage.from('supplier-documents').remove([path]);
    await supabase.from('supplier_documents').delete().eq('id', doc.id);
    toast({ title: 'Document deleted' });
    fetchDocs();
  };

  const canEdit = hasRole('admin') || hasRole('procurement_officer');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Documents</CardTitle>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />Upload Document</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1"><Label>Document Name *</Label><Input value={docName} onChange={e => setDocName(e.target.value)} placeholder="e.g. Business License 2025" /></div>
                <div className="space-y-1">
                  <Label>Document Type</Label>
                  <Select value={docType} onValueChange={setDocType}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>File *</Label>
                  <Input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" />
                </div>
                <Button onClick={handleUpload} disabled={uploading || !docName} className="w-full">
                  <Upload className="w-4 h-4 mr-1" />{uploading ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No documents uploaded yet</p>
        ) : (
          <div className="space-y-3">
            {docs.map(d => (
              <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{d.document_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.document_type || 'Other'} · {d.file_size ? `${(d.file_size / 1024).toFixed(0)} KB` : ''} · {new Date(d.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {d.file_url && (
                    <a href={d.file_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon"><Download className="w-4 h-4" /></Button>
                    </a>
                  )}
                  {canEdit && (
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(d)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
