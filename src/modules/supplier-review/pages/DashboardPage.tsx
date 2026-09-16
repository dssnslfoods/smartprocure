import { useNavigate } from 'react-router-dom';
import { ReviewDashboard } from '../components/ReviewDashboard';

export default function DashboardPage() {
  const navigate = useNavigate();
  return (
    <div className="container mx-auto py-6 px-4">
      <ReviewDashboard
        onOpenReview={(id) => navigate(`/supplier-review/review/${id}`)}
        onNewReview={() => navigate('/supplier-review/new')}
      />
    </div>
  );
}
