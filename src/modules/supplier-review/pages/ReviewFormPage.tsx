import { useParams, useNavigate } from 'react-router-dom';
import { ReviewFormTabs } from '../components/ReviewForm';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';

export default function ReviewFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (!id) return <div className="p-8 text-center">Missing review ID</div>;

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => navigate('/supplier-review')}>← Back</Button>
        <h1 className="text-2xl font-bold">{t('spr.reviewForm')}</h1>
      </div>
      <ReviewFormTabs
        reviewId={id}
        onNavigate={(newId) => navigate(`/supplier-review/review/${newId}`)}
      />
    </div>
  );
}
