import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, ChevronRight, LogOut } from 'lucide-react';

interface TenantAccess {
  tenant_id: string;
  tenants: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };
}

export default function TenantSelector() {
  const navigate = useNavigate();
  const { user, signOut, isSuperAdmin } = useAuth();
  const [tenantAccess, setTenantAccess] = useState<TenantAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (isSuperAdmin) {
      navigate('/super-admin', { replace: true });
      return;
    }
    fetchAccess();
  }, [user, isSuperAdmin]);

  const fetchAccess = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('user_tenant_access')
      .select('tenant_id, tenants(id, name, slug, logo_url)')
      .eq('user_id', user.id);

    if (data) {
      setTenantAccess(data as unknown as TenantAccess[]);
      // If only 1 tenant, auto-switch
      if (data.length === 1) {
        await handleSelect((data[0] as any).tenant_id);
        return;
      }
    }
    if (error) console.error('Error fetching tenant access:', error);
    setLoading(false);
  };

  const handleSelect = async (tenantId: string) => {
    if (!user) return;
    setSwitching(tenantId);
    try {
      const { data, error } = await supabase.rpc('switch_tenant', {
        _user_id: user.id,
        _tenant_id: tenantId,
      });
      if (error) throw error;
      if (data === true) {
        // Force re-fetch user data in AuthContext
        window.location.href = '/';
      }
    } catch (err) {
      console.error('Error switching tenant:', err);
      setSwitching(null);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md mx-auto p-6">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-white">SP</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Smart Procurement</h1>
          <p className="text-gray-500 mt-2">เลือกบริษัทที่ต้องการเข้าถึง</p>
        </div>

        {tenantAccess.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">คุณยังไม่ได้รับสิทธิ์เข้าถึงบริษัทใด</p>
              <p className="text-sm text-gray-400 mt-1">กรุณาติดต่อ Super Admin เพื่อขอสิทธิ์</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tenantAccess.map((access) => {
              const tenant = access.tenants;
              const isLoading = switching === access.tenant_id;
              return (
                <Card
                  key={access.tenant_id}
                  className={`cursor-pointer transition-all hover:shadow-md hover:border-orange-300 ${
                    isLoading ? 'border-orange-400 bg-orange-50' : ''
                  }`}
                  onClick={() => !switching && handleSelect(access.tenant_id)}
                >
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      {tenant.logo_url ? (
                        <img src={tenant.logo_url} alt={tenant.name} className="w-8 h-8 object-contain" />
                      ) : (
                        <Building2 className="w-6 h-6 text-orange-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{tenant.name}</h3>
                      <p className="text-sm text-gray-500">{tenant.slug}</p>
                    </div>
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            ออกจากระบบ
          </Button>
        </div>
      </div>
    </div>
  );
}
