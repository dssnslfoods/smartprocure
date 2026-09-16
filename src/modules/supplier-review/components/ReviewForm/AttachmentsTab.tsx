import { useRef, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/i18n';
import { useAttachments, useCreateAttachment, useUploadReviewFile } from '../../hooks/useReviews';
import { useAuth } from '@/contexts/AuthContext';
import type { KpiData } from '../../types';

const DOC_TYPES = [
  { value: 'CERT', labelKey: 'spr.attach.cert' },
  { value: 'DIRECTORY_SCREENSHOT', labelKey: 'spr.attach.directory' },
  { value: 'AUDIT_REPORT', labelKey: 'spr.attach.auditReport' },
  { value: 'QUESTIONNAIRE', labelKey: 'spr.attach.questionnaire' },
  { value: 'TRACEABILITY', labelKey: 'spr.attach.traceability' },
  { value: 'SPEC', labelKey: 'spr.attach.spec' },
  { value: 'MEETING_MINUTES', labelKey: 'spr.attach.meetingMinutes' },
  { value: 'OTHER', labelKey: 'spr.attach.other' },
] as const;

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'xlsx', 'docx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface Props {
  reviewId: string;
  locked: boolean;
  approvalMethod?: string | null;
  kpiData?: KpiData | null;
}

export function AttachmentsTab({ reviewId, locked, approvalMethod, kpiData }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: attachments = [] } = useAttachments(reviewId);
  const upload = useUploadReviewFile();
  const createAtt = useCreateAttachment();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<string>('CERT');
  const [error, setError] = useState<string | null>(null);

  const requiredEvidence = useMemo(() => {
    const required: { type: string; label: string; met: boolean }[] = [];
    const method = approvalMethod ?? kpiData?.approval_method;

    if (method === 'GFSI_CERT') {
      required.push(
        { type: 'CERT', label: t('spr.attach.cert'), met: attachments.some(a => a.doc_type === 'CERT') },
        { type: 'DIRECTORY_SCREENSHOT', label: t('spr.attach.directory'), met: attachments.some(a => a.doc_type === 'DIRECTORY_SCREENSHOT') },
      );
    } else if (method === 'QUESTIONNAIRE') {
      required.push(
        { type: 'QUESTIONNAIRE', label: t('spr.attach.questionnaire'), met: attachments.some(a => a.doc_type === 'QUESTIONNAIRE') },
        { type: 'TRACEABILITY', label: t('spr.attach.traceability'), met: attachments.some(a => a.doc_type === 'TRACEABILITY') },
      );
    } else if (method === 'SUPPLIER_AUDIT') {
      required.push(
        { type: 'AUDIT_REPORT', label: t('spr.attach.auditReport'), met: attachments.some(a => a.doc_type === 'AUDIT_REPORT') },
      );
    }

    return required;
  }, [approvalMethod, kpiData?.approval_method, attachments, t]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(t('spr.attach.errFileType') + ': ' + ALLOWED_EXTENSIONS.join(', '));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(t('spr.attach.errFileSize'));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const url = await upload.mutateAsync({ reviewId, file });
    await createAtt.mutateAsync({
      review_id: reviewId,
      doc_type: docType,
      file_path: url,
      file_name: file.name,
      file_size: file.size,
      uploaded_by: user?.id ?? null,
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Required evidence checklist */}
      {requiredEvidence.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader><CardTitle className="text-sm">{t('spr.attach.requiredEvidence')}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {requiredEvidence.map(r => (
                <li key={r.type} className="flex items-center gap-2 text-sm">
                  <span className={r.met ? 'text-green-600' : 'text-red-600'}>{r.met ? '✓' : '✗'}</span>
                  <span>{r.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!locked && (
        <div className="flex items-end gap-2">
          <div>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map(d => (
                  <SelectItem key={d.value} value={d.value}>{t(d.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx"
            onChange={handleUpload}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending || createAtt.isPending}>
            {upload.isPending ? t('spr.attach.uploading') : t('spr.attach.upload')}
          </Button>
        </div>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <Card>
        <CardHeader><CardTitle>{t('spr.tabs.attachments')}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('spr.attach.fileName')}</TableHead>
                <TableHead>{t('spr.attach.docType')}</TableHead>
                <TableHead>{t('spr.attach.size')}</TableHead>
                <TableHead>{t('spr.attach.uploadedBy')}</TableHead>
                <TableHead>{t('spr.attach.uploadedDate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attachments.map(a => (
                <TableRow key={a.id}>
                  <TableCell>
                    <a href={a.file_path} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                      {a.file_name ?? 'Download'}
                    </a>
                  </TableCell>
                  <TableCell><Badge variant="outline">{a.doc_type}</Badge></TableCell>
                  <TableCell>{a.file_size ? `${(a.file_size / 1024).toFixed(1)} KB` : '—'}</TableCell>
                  <TableCell>{a.uploaded_by ?? '—'}</TableCell>
                  <TableCell>{new Date(a.uploaded_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {attachments.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t('spr.attach.noAttachments')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
