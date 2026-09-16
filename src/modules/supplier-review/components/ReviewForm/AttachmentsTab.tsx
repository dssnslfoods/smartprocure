import { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/i18n';
import { useAttachments, useCreateAttachment, useUploadReviewFile } from '../../hooks/useReviews';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  reviewId: string;
  locked: boolean;
}

export function AttachmentsTab({ reviewId, locked }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: attachments = [] } = useAttachments(reviewId);
  const upload = useUploadReviewFile();
  const createAtt = useCreateAttachment();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await upload.mutateAsync({ reviewId, file });
    await createAtt.mutateAsync({
      review_id: reviewId,
      doc_type: 'evidence',
      file_path: url,
      file_name: file.name,
      file_size: file.size,
      uploaded_by: user?.id ?? null,
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      {!locked && (
        <div>
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending || createAtt.isPending}>
            {upload.isPending ? 'Uploading...' : 'Upload File'}
          </Button>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>{t('spr.tabs.attachments')}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded</TableHead>
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
                  <TableCell>{a.doc_type}</TableCell>
                  <TableCell>{a.file_size ? `${(a.file_size / 1024).toFixed(1)} KB` : '—'}</TableCell>
                  <TableCell>{new Date(a.uploaded_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {attachments.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No attachments</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
