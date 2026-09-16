import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/i18n';
import type { ReviewStatus } from '../../types';

const variants: Record<ReviewStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  REVIEWED: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-green-100 text-green-700',
  RETURNED: 'bg-orange-100 text-orange-700',
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const { t } = useTranslation();
  return (
    <Badge className={variants[status] ?? 'bg-gray-100 text-gray-700'}>
      {t(`spr.status.${status}`)}
    </Badge>
  );
}
