import { Component, type ErrorInfo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { I18nProvider } from "@/i18n";
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
import PriceListDetail from "@/pages/pricelists/PriceListDetail";
import RFQList from "@/pages/rfq/RFQList";
import RFQForm from "@/pages/rfq/RFQForm";
import RFQDetail from "@/pages/rfq/RFQDetail";
import BiddingPage from "@/pages/bidding/BiddingPage";
import BiddingForm from "@/pages/bidding/BiddingForm";
import BiddingDetail from "@/pages/bidding/BiddingDetail";
import FinalQuotationsPage from "@/pages/quotations/FinalQuotationsPage";
import AwardsPage from "@/pages/awards/AwardsPage";
import ReportsPage from "@/pages/reports/ReportsPage";
import AdminSettingsPage from "@/pages/admin/AdminSettingsPage";
import SupplierApprovalPage from "@/pages/admin/SupplierApprovalPage";
import VendorRiskPage from "@/pages/vendors/VendorRiskPage";
import VendorRiskForm from "@/pages/vendors/VendorRiskForm";
import RFQBidComparison from "@/pages/rfq/RFQBidComparison";
import RFQAwardApproval from "@/pages/rfq/RFQAwardApproval";
import NotFound from "@/pages/NotFound";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('App error:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace' }}>
          <h2 style={{ color: 'red' }}>App Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{(this.state.error as Error).message}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 16px' }}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
  <I18nProvider>
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
              <Route path="/vendor-risk" element={<VendorRiskPage />} />
              <Route path="/vendor-risk/:supplierId" element={<VendorRiskForm />} />
              <Route path="/suppliers/new" element={<SupplierForm />} />
              <Route path="/suppliers/:id" element={<SupplierDetail />} />
              <Route path="/suppliers/:id/edit" element={<SupplierEdit />} />
              <Route path="/price-lists" element={<PriceListPage />} />
              <Route path="/price-lists/:id" element={<PriceListDetail />} />
              <Route path="/rfq" element={<RFQList />} />
              <Route path="/rfq/new" element={<RFQForm />} />
              <Route path="/rfq/:id" element={<RFQDetail />} />
              <Route path="/rfq/:id/comparison" element={<RFQBidComparison />} />
              <Route path="/rfq/:id/award-approval" element={<RFQAwardApproval />} />
              <Route path="/bidding" element={<BiddingPage />} />
              <Route path="/bidding/new" element={<BiddingForm />} />
              <Route path="/bidding/:id" element={<BiddingDetail />} />
              <Route path="/final-quotations" element={<FinalQuotationsPage />} />
              <Route path="/awards" element={<AwardsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
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
  </I18nProvider>
  </ErrorBoundary>
);

export default App;
