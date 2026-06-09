import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'super_admin' | 'admin' | 'procurement_officer' | 'approver' | 'executive' | 'supplier';

/** Canonical module keys — must match tenant_modules.module_key in DB */
export const MODULE_KEYS = [
  'dashboard', 'supplier_portal', 'suppliers', 'vendor_risk', 'price_lists',
  'rfq', 'e_bidding', 'final_quotations', 'awards', 'reports',
  'admin_settings', 'supplier_approvals',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  profile: any | null;
  loading: boolean;
  /** Multi-tenant */
  tenantId: string | null;
  tenant: TenantInfo | null;
  isSuperAdmin: boolean;
  allowedModules: ModuleKey[];
  canAccessModule: (moduleKey: ModuleKey | string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [allowedModules, setAllowedModules] = useState<ModuleKey[]>([]);

  const isSuperAdmin = roles.includes('super_admin');

  const fetchUserData = async (userId: string) => {
    try {
      const [profileRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ]);
      if (profileRes.data) {
        setProfile(profileRes.data);
        setTenantId(profileRes.data.tenant_id ?? null);
      }
      const userRoles = rolesRes.data?.map((r: any) => r.role as AppRole) ?? [];
      setRoles(userRoles);

      // Fetch tenant info + allowed modules (skip for super_admin — they see everything)
      const _isSuperAdmin = userRoles.includes('super_admin');
      const _tenantId = profileRes.data?.tenant_id;

      if (_tenantId && !_isSuperAdmin) {
        const [tenantRes, roleModulesRes] = await Promise.all([
          supabase.from('tenants').select('id, name, slug, logo_url, is_active').eq('id', _tenantId).single(),
          supabase.from('tenant_role_modules').select('module_key').eq('tenant_id', _tenantId).in('role', userRoles),
        ]);
        if (tenantRes.data) setTenant(tenantRes.data as TenantInfo);
        if (roleModulesRes.data) {
          const uniqueModules = [...new Set(roleModulesRes.data.map((r: any) => r.module_key))] as ModuleKey[];
          setAllowedModules(uniqueModules);
        }
      } else if (_isSuperAdmin) {
        // Super admin sees all modules
        setAllowedModules([...MODULE_KEYS]);
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
    }
  };

  useEffect(() => {
    let mounted = true;
    let initialised = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Defer data fetch to avoid Supabase deadlock on auth callbacks
          fetchUserData(session.user.id).finally(() => {
            if (mounted && !initialised) {
              initialised = true;
              setLoading(false);
            }
          });
        } else {
          setProfile(null);
          setRoles([]);
          setTenantId(null);
          setTenant(null);
          setAllowedModules([]);
          if (!initialised) {
            initialised = true;
            setLoading(false);
          }
        }
      }
    );

    // Fallback: if onAuthStateChange hasn't resolved within 5s, stop loading
    const timeout = setTimeout(() => {
      if (!initialised && mounted) {
        initialised = true;
        setLoading(false);
      }
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRoles([]);
    setProfile(null);
    setTenantId(null);
    setTenant(null);
    setAllowedModules([]);
  };

  const hasRole = (role: AppRole) => roles.includes(role);

  const canAccessModule = useCallback(
    (moduleKey: ModuleKey | string) => {
      if (isSuperAdmin) return true;
      return allowedModules.includes(moduleKey as ModuleKey);
    },
    [isSuperAdmin, allowedModules],
  );

  return (
    <AuthContext.Provider
      value={{
        user, session, roles, profile, loading,
        tenantId, tenant, isSuperAdmin, allowedModules, canAccessModule,
        signIn, signOut, hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
