import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';
import { StatusBadge, GradeBadge } from '../shared';
import { useUpdateReview, useApproveReview, useCreateRevision, useSubmitReview } from '../../hooks/useReviews';
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
  const submitReview = useSubmitReview();

  const [returnComment, setReturnComment] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  const canSubmit = (review.status === 'DRAFT' || review.status === 'RETURNED') && !review.locked;
  const canApprove = review.status === 'SUBMITTED' && (hasRole('admin') || hasRole('approver')) && review.reviewer_id !== user?.id;
  const canReturn = review.status === 'SUBMITTED' && (hasRole('admin') || hasRole('approver'));
  const canRevise = review.status === 'APPROVED' && review.locked;
  const isSelfReview = review.reviewer_id === user?.id;

  const handleSubmit = async () => {
    if (!user?.id) return;
    setSubmitErrors([]);
    const result = await submitReview.mutateAsync({ reviewId: review.id, reviewerId: user.id });
    if (!result.valid) {
      setSubmitErrors(result.missing ?? [result.error ?? t('spr.signoff.unknownError')]);
    }
  };

  const handleApprove = async () => {
    if (!user?.id) return;
    if (review.reviewer_id === user.id) {
      setSubmitErrors([t('spr.messages.cannotApproveSelf')]);
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
        <CardHeader><CardTitle>{t('spr.signoff.reviewStatus')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <StatusBadge status={review.status} />
            {review.grade && <GradeBadge grade={review.grade} score={review.final_score} />}
            {review.locked && (
              <Badge variant="outline">{t('spr.signoff.locked')} — Rev {review.revision_no}</Badge>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{t('spr.signoff.reviewer')}</dt>
              <dd>{review.reviewer_id ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('spr.signoff.approver')}</dt>
              <dd>{review.approver_id ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('spr.signoff.submitted')}</dt>
              <dd>{review.submitted_at ? new Date(review.submitted_at).toLocaleString() : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('spr.signoff.approved')}</dt>
              <dd>{review.approved_at ? new Date(review.approved_at).toLocaleString() : '—'}</dd>
            </div>
          </dl>

          {review.return_comment && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded">
              <Label className="text-orange-700">{t('spr.signoff.returnComment')}</Label>
              <p className="text-sm mt-1">{review.return_comment}</p>
            </div>
          )}

          {/* P0-10: Sign-off statement after approval */}
          {review.status === 'APPROVED' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-sm text-green-800 font-medium">
                {t('spr.signoff.confirmStatement')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submission gate errors — P0-9 */}
      {submitErrors.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader><CardTitle className="text-red-700 text-sm">{t('spr.signoff.cannotSubmit')}</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-red-700 text-sm list-disc list-inside space-y-1">
              {submitErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{t('spr.signoff.actions')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={() => window.print()}>
            Print / PDF
          </Button>

          {canSubmit && (
            <Button onClick={handleSubmit} disabled={submitReview.isPending}>
              {submitReview.isPending ? t('spr.signoff.submitting') : t('spr.signoff.submitForApproval')}
            </Button>
          )}

          {/* P0-10: Approver cannot be reviewer */}
          {review.status === 'SUBMITTED' && isSelfReview && (
            <p className="text-sm text-amber-600">{t('spr.messages.cannotApproveSelf')}</p>
          )}

          {canApprove && (
            <div className="space-y-2">
              <Textarea
                placeholder={t('spr.signoff.approvalCommentPlaceholder')}
                value={approvalComment}
                onChange={e => setApprovalComment(e.target.value)}
              />
              <Button onClick={handleApprove} disabled={approveReview.isPending} className="bg-green-600 hover:bg-green-700">
                {t('spr.signoff.approve')}
              </Button>
            </div>
          )}

          {canReturn && (
            <div className="space-y-2">
              <Textarea
                placeholder={t('spr.signoff.returnCommentPlaceholder')}
                value={returnComment}
                onChange={e => setReturnComment(e.target.value)}
              />
              <Button variant="outline" onClick={handleReturn} disabled={updateReview.isPending || !returnComment.trim()}>
                {t('spr.signoff.returnForRevision')}
              </Button>
            </div>
          )}

          {canRevise && (
            <div className="space-y-2">
              <Label>{t('spr.signoff.revisionReason')}</Label>
              <Textarea value={revisionReason} onChange={e => setRevisionReason(e.target.value)} />
              <Button variant="outline" onClick={handleRevision} disabled={createRevision.isPending || !revisionReason.trim()}>
                {t('spr.signoff.createRevision')}
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
