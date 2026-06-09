import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, AppRole, ModuleKey } from '@/contexts/AuthContext';

interface Props {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  requiredModule?: ModuleKey | string;
}

export default function ProtectedRoute({ children, allowedRoles, requiredModule }: Props) {
  const { user, roles, loading, canAccessModule, isSuperAdmin, accessibleTenantCount, hasRole, tenantId } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Super admin accessing super-admin routes — allow through
  if (isSuperAdmin && location.pathname.startsWith('/super-admin')) {
    return <>{children}</>;
  }

  // Super admin accessing regular app routes — redirect to super-admin dashboard
  if (isSuperAdmin && !allowedRoles?.includes('super_admin')) {
    return <Navigate to="/super-admin" replace />;
  }

  // Admin with multi-tenant access and no tenant selected — redirect to tenant selector
  if (hasRole('admin') && accessibleTenantCount > 1 && !tenantId) {
    return <Navigate to="/select-tenant" replace />;
  }

  if (allowedRoles && !allowedRoles.some((r) => roles.includes(r))) {
    return <Navigate to="/" replace />;
  }

  // Check module access (tenant-level)
  if (requiredModule && !canAccessModule(requiredModule)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
