import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building, Users, Settings, LogOut, ChevronLeft, ChevronRight, Shield,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LogoFull } from '@/components/Logo';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard',  path: '/super-admin' },
  { icon: Building,        label: 'Tenants',     path: '/super-admin/tenants' },
  { icon: Users,           label: 'Users',       path: '/super-admin/users' },
  { icon: Settings,        label: 'Settings',    path: '/super-admin/settings' },
];

export default function SuperAdminSidebar() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex flex-col bg-slate-900 text-slate-200 border-r border-slate-800 transition-all duration-300 h-screen sticky top-0',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <div className="px-4 h-16 flex items-center border-b border-slate-800">
        <LogoFull collapsed={collapsed} subtitle="Super Admin" variant="light" />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto scrollbar-thin">
        {menuItems.map((item) => {
          const active =
            item.path === '/super-admin'
              ? location.pathname === '/super-admin'
              : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white',
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
      <div className="border-t border-slate-800 p-2 space-y-1">
        {!collapsed && profile && (
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-white truncate">
              {profile.full_name || profile.email}
            </p>
            <p className="text-[10px] text-slate-400 truncate">super_admin</p>
          </div>
        )}

        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          title={collapsed ? 'Sign Out' : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center px-3 py-2 rounded-md text-sm w-full text-slate-400 hover:bg-slate-800 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
