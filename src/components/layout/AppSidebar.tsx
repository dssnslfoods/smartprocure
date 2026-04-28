import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  FileText,
  Send,
  Gavel,
  ClipboardList,
  Award,
  Star,
  BarChart3,
  ShieldAlert,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Briefcase,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: ['admin', 'procurement_officer', 'approver', 'executive', 'supplier'] },
  { icon: Briefcase, label: 'Supplier Portal', path: '/supplier-portal', roles: ['supplier'] },
  { icon: Building2, label: 'Suppliers', path: '/suppliers', roles: ['admin', 'procurement_officer', 'approver', 'executive'] },
  { icon: FileText, label: 'Price Lists', path: '/price-lists', roles: ['admin', 'procurement_officer', 'supplier'] },
  { icon: Send, label: 'RFQ', path: '/rfq', roles: ['admin', 'procurement_officer', 'supplier'] },
  { icon: Gavel, label: 'e-Bidding', path: '/bidding', roles: ['admin', 'procurement_officer', 'supplier'] },
  { icon: ClipboardList, label: 'Final Quotations', path: '/final-quotations', roles: ['admin', 'procurement_officer', 'approver'] },
  { icon: Award, label: 'Awards', path: '/awards', roles: ['admin', 'procurement_officer', 'approver', 'executive'] },
  { icon: Star, label: 'Evaluations', path: '/evaluations', roles: ['admin', 'procurement_officer'] },
  { icon: ShieldAlert, label: 'ABC-XYZ Matrix', path: '/reports/abc-xyz', roles: ['admin', 'procurement_officer', 'executive'] },
  { icon: BarChart3, label: 'Analytics', path: '/reports/analytics', roles: ['admin', 'procurement_officer', 'executive'] },
  { icon: BarChart3, label: 'Reports', path: '/reports', roles: ['admin', 'procurement_officer', 'executive'] },
  { icon: Settings, label: 'Admin Settings', path: '/admin', roles: ['admin'] },
  { icon: UserCheck, label: 'Supplier Approvals', path: '/admin/supplier-approvals', roles: ['admin'] },
];

export default function AppSidebar() {
  const { roles, profile, signOut } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const visibleItems = menuItems.filter(
    (item) => item.roles.some((r) => roles.includes(r as any))
  );

  return (
    <aside
      className={cn(
        'flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 h-screen sticky top-0',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
          <span className="text-sidebar-primary-foreground font-bold text-sm">SP</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-semibold text-sm text-sidebar-accent-foreground truncate">Smart Procurement</p>
            <p className="text-[10px] text-sidebar-foreground truncate">NSL Foods PLC</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto scrollbar-thin">
        {visibleItems.map((item) => {
          const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2 space-y-1">
        {!collapsed && profile && (
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-sidebar-accent-foreground truncate">
              {profile.full_name || profile.email}
            </p>
            <p className="text-[10px] text-sidebar-foreground truncate capitalize">
              {roles.join(', ')}
            </p>
          </div>
        )}
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center px-3 py-2 rounded-md text-sm w-full text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
