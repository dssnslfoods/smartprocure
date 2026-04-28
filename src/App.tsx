import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import Login from "@/pages/Login";
import SupplierRegistration from "@/pages/suppliers/SupplierRegistration";
import SupplierPortal from "@/pages/suppliers/SupplierPortal";
import Dashboard from "@/pages/Dashboard";
import SupplierList from "@/pages/suppliers/SupplierList";
import SupplierForm from "@/pages/suppliers/SupplierForm";
import SupplierDetail from "@/pages/suppliers/SupplierDetail";
import SupplierEdit from "@/pages/suppliers/SupplierEdit";
import PriceListPage from "@/pages/pricelists/PriceListPage";
import RFQList from "@/pages/rfq/RFQList";
import RFQForm from "@/pages/rfq/RFQForm";
import RFQDetail from "@/pages/rfq/RFQDetail";
import BiddingPage from "@/pages/bidding/BiddingPage";
import BiddingForm from "@/pages/bidding/BiddingForm";
import BiddingDetail from "@/pages/bidding/BiddingDetail";
import FinalQuotationsPage from "@/pages/quotations/FinalQuotationsPage";
import AwardsPage from "@/pages/awards/AwardsPage";
import ReportsPage from "@/pages/reports/ReportsPage";
import AbcXyzMatrixPage from "@/pages/reports/AbcXyzMatrixPage";
import AnalyticsPage from "@/pages/reports/AnalyticsPage";
import AdminSettingsPage from "@/pages/admin/AdminSettingsPage";
import SupplierApprovalPage from "@/pages/admin/SupplierApprovalPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register/supplier" element={<SupplierRegistration />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/supplier-portal" element={<SupplierPortal />} />
              <Route path="/suppliers" element={<SupplierList />} />
              <Route path="/suppliers/new" element={<SupplierForm />} />
              <Route path="/suppliers/:id" element={<SupplierDetail />} />
              <Route path="/suppliers/:id/edit" element={<SupplierEdit />} />
              <Route path="/price-lists" element={<PriceListPage />} />
              <Route path="/rfq" element={<RFQList />} />
              <Route path="/rfq/new" element={<RFQForm />} />
              <Route path="/rfq/:id" element={<RFQDetail />} />
              <Route path="/bidding" element={<BiddingPage />} />
              <Route path="/bidding/new" element={<BiddingForm />} />
              <Route path="/bidding/:id" element={<BiddingDetail />} />
              <Route path="/final-quotations" element={<FinalQuotationsPage />} />
              <Route path="/awards" element={<AwardsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/reports/abc-xyz" element={<AbcXyzMatrixPage />} />
              <Route path="/reports/analytics" element={<AnalyticsPage />} />
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminSettingsPage />
                </ProtectedRoute>
              } />
              <Route path="/admin/supplier-approvals" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <SupplierApprovalPage />
                </ProtectedRoute>
              } />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
