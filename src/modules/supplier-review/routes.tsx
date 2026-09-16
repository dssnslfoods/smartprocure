import { lazy } from 'react';
import { Route } from 'react-router-dom';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ReviewFormPage = lazy(() => import('./pages/ReviewFormPage'));
const NewReviewPage = lazy(() => import('./pages/NewReviewPage'));
const AdminConfigPage = lazy(() => import('./pages/AdminConfigPage'));
const SupplierHistoryPage = lazy(() => import('./pages/SupplierHistoryPage'));
const ReviewStatusListPage = lazy(() => import('./pages/ReviewStatusListPage'));

export function supplierReviewRoutes() {
  return (
    <>
      <Route path="/supplier-review" element={<DashboardPage />} />
      <Route path="/supplier-review/new" element={<NewReviewPage />} />
      <Route path="/supplier-review/review/:id" element={<ReviewFormPage />} />
      <Route path="/supplier-review/config" element={<AdminConfigPage />} />
      <Route path="/supplier-review/history/:supplierId" element={<SupplierHistoryPage />} />
      <Route path="/supplier-review/status-list" element={<ReviewStatusListPage />} />
    </>
  );
}
