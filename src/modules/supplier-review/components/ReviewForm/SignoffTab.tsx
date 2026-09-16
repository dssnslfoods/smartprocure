import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';
import { StatusBadge, GradeBadge } from '../shared';
import { useUpdateReview, useApproveReview, useCreateRevision } from '../../hooks/useReviews';
import type { SupplierReview } from '../../types';

interface Props {
  review: SupplierReview;
  onNavigate: (reviewId: string) => void;
}

export function SignoffTab({ review, onNavigate }: Props) {
  const { t } = useTranslation();
  const { user, hasRole } = useAuth();
  const updateReview = useUpdateReview();
  const approveReview = useApproveReview();
  const createRevision = useCreateRevision();

  const [returnComment, setReturnComment] = useState('');
  const [revisionReason, setRevisionReason] = useState('');

  const canSubmit = review.status === 'DRAFT' && !review.locked;
  const canApprove = review.status === 'SUBMITTED' && (hasRole('admin') || hasRole('approver')) && review.reviewer_id !== user?.id;
  const canReturn = review.status === 'SUBMITTED' && (hasRole('admin') || hasRole('approver'));
  const canRevise = review.status === 'APPROVED' && review.locked;

  const handleSubmit = async () => {
    await updateReview.mutateAsync({
      id: review.id,
      status: 'SUBMITTED',
      reviewer_id: user?.id ?? null,
      submitted_at: new Date().toISOString(),
    });
  };

  const handleApprove = async () => {
    if (!user?.id) return;
    if (review.reviewer_id === user.id) {
      alert(t('spr.messages.cannotApproveSelf'));
      return;
    }
    await approveReview.mutateAsync({ reviewId: review.id, approverId: user.id });
  };

  const handleReturn = async () => {
    if (!returnComment.trim()) return;
    await updateReview.mutateAsync({
      id: review.id,
      status: 'RETURNED',
      return_comment: returnComment,
      returned_at: new Date().toISOString(),
    });
  };

  const handleRevision = async () => {
    if (!revisionReason.trim() || !user?.id) return;
    const newId = await createRevision.mutateAsync({
      reviewId: review.id,
      reason: revisionReason,
      userId: user.id,
    });
    if (newId) onNavigate(newId);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Review Status</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <StatusBadge status={review.status} />
            {review.grade && <GradeBadge grade={review.grade} score={review.final_score} />}
            {review.locked && <span className="text-sm text-muted-foreground">(Locked — Rev {review.revision_no})</span>}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">Reviewer</dt><dd>{review.reviewer_id ?? '—'}</dd></div>
            <div><dt className="text-muted-foreground">Approver</dt><dd>{review.approver_id ?? '—'}</dd></div>
            <div><dt className="text-muted-foreground">Submitted</dt><dd>{review.submitted_at ? new Date(review.submitted_at).toLocaleString() : '—'}</dd></div>
            <div><dt className="text-muted-foreground">Approved</dt><dd>{review.approved_at ? new Date(review.approved_at).toLocaleString() : '—'}</dd></div>
          </dl>

          {review.return_comment && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded">
              <Label className="text-orange-700">Return Comment</Label>
              <p className="text-sm mt-1">{review.return_comment}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {canSubmit && (
            <Button onClick={handleSubmit} disabled={updateReview.isPending}>
              {t('common.submit')} for Approval
            </Button>
          )}

          {canApprove && (
            <Button onClick={handleApprove} disabled={approveReview.isPending} className="bg-green-600 hover:bg-green-700">
              Approve Review
            </Button>
          )}

          {canReturn && (
            <div className="space-y-2">
              <Textarea placeholder="Return comment..." value={returnComment} onChange={e => setReturnComment(e.target.value)} />
              <Button variant="outline" onClick={handleReturn} disabled={updateReview.isPending || !returnComment.trim()}>
                Return for Revision
              </Button>
            </div>
          )}

          {canRevise && (
            <div className="space-y-2">
              <Label>Revision Reason</Label>
              <Textarea value={revisionReason} onChange={e => setRevisionReason(e.target.value)} />
              <Button variant="outline" onClick={handleRevision} disabled={createRevision.isPending || !revisionReason.trim()}>
                Create Revision
              </Button>
            </div>
          )}

          {review.locked && !canRevise && (
            <p className="text-sm text-muted-foreground">{t('spr.messages.reviewLocked')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
