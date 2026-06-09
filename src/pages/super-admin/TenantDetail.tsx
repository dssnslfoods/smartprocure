import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Save, Building, Users, Grid3X3, Link2, Unlink, Search, Package, UserPlus, Shield, ShieldCheck, Trash2 } from 'lucide-react';
import { MODULE_KEYS, type ModuleKey, type AppRole } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: 'Dashboard',
  supplier_portal: 'Supplier Portal',
  suppliers: 'Suppliers',
  vendor_risk: 'Vendor Risk',
  price_lists: 'Price Lists',
  rfq: 'RFQ',
  e_bidding: 'E-Bidding',
  final_quotations: 'Final Quotations',
  awards: 'Awards',
  reports: 'Reports',
  admin_settings: 'Admin Settings',
  supplier_approvals: 'Supplier Approvals',
};

const CONFIGURABLE_ROLES: AppRole[] = ['admin', 'procurement_officer', 'approver', 'executive', 'supplier'];

interface TenantData {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  logo_url: string | null;
  settings: any;
  supplier_sharing_enabled: boolean;
}

interface TenantUser {
  id: string;
  email: string;
  full_name: string | null;
  roles: string[];
}

interface LinkedSupplier {
  id: string;
  supplier_id: string;
  company_name: string;
  supplier_code: string | null;
  email: string | null;
  tenant_name: string; // origin tenant
  linked_at: string;
}

interface AvailableSupplier {
  id: string;
  company_name: string;
  supplier_code: string | null;
  email: string | null;
  tenant_id: string;
  tenant_name: string;
}

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set());
  const [roleModules, setRoleModules] = useState<Record<string, Set<string>>>({});
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Supplier sharing state
  const [linkedSuppliers, setLinkedSuppliers] = useState<LinkedSupplier[]>([]);
  const [availableSuppliers, setAvailableSuppliers] = useState<AvailableSupplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [sharingToggling, setSharingToggling] = useState(false);

  // Admin management state
  const [tenantAdmins, setTenantAdmins] = useState<{ user_id: string; email: string; full_name: string | null; granted_by: string | null }[]>([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminSearchResults, setAdminSearchResults] = useState<{ id: string; email: string; full_name: string | null; current_tenant: string | null }[]>([]);
  const [adminSearchLoading, setAdminSearchLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;

    const [tenantRes, modulesRes, roleModulesRes, usersRes] = await Promise.all([
      supabase.from('tenants').select('*').eq('id', id).single(),
      supabase.from('tenant_modules').select('module_key, is_enabled').eq('tenant_id', id),
      supabase.from('tenant_role_modules').select('role, module_key').eq('tenant_id', id),
      supabase.from('profiles').select('id, email, full_name').eq('tenant_id', id),
    ]);

    if (tenantRes.data) setTenant(tenantRes.data as TenantData);

    const enabled = new Set<string>();
    modulesRes.data?.forEach((m: any) => {
      if (m.is_enabled) enabled.add(m.module_key);
    });
    setEnabledModules(enabled);

    const rm: Record<string, Set<string>> = {};
    CONFIGURABLE_ROLES.forEach((r) => (rm[r] = new Set()));
    roleModulesRes.data?.forEach((rm2: any) => {
      if (!rm[rm2.role]) rm[rm2.role] = new Set();
      rm[rm2.role].add(rm2.module_key);
    });
    setRoleModules(rm);

    if (usersRes.data) {
      const withRoles = await Promise.all(
        usersRes.data.map(async (u: any) => {
          const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', u.id);
          return { ...u, roles: roles?.map((r: any) => r.role) ?? [] };
        }),
      );
      setUsers(withRoles);
    }

    // Fetch linked suppliers
    await fetchLinkedSuppliers();

    setLoading(false);
  }, [id]);

  const fetchLinkedSuppliers = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('tenant_suppliers')
      .select('id, supplier_id, linked_at, suppliers(company_name, supplier_code, email, tenant_id)')
      .eq('tenant_id', id)
      .order('linked_at', { ascending: false });

    if (data) {
      // Get origin tenant names
      const supplierTenantIds = [...new Set(data.map((d: any) => d.suppliers?.tenant_id).filter(Boolean))];
      const { data: tenantNames } = supplierTenantIds.length > 0
        ? await supabase.from('tenants').select('id, name').in('id', supplierTenantIds)
        : { data: [] };
      const tenantMap = Object.fromEntries((tenantNames ?? []).map((t: any) => [t.id, t.name]));

      setLinkedSuppliers(
        data.map((d: any) => ({
          id: d.id,
          supplier_id: d.supplier_id,
          company_name: d.suppliers?.company_name ?? '-',
          supplier_code: d.suppliers?.supplier_code,
          email: d.suppliers?.email,
          tenant_name: tenantMap[d.suppliers?.tenant_id] ?? 'Unknown',
          linked_at: d.linked_at,
        })),
      );
    }
  }, [id]);

  // Fetch admins who have access to this tenant
  const fetchTenantAdmins = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('user_tenant_access')
      .select('user_id, granted_by, profiles!user_tenant_access_user_id_profiles_fkey(email, full_name)')
      .eq('tenant_id', id);
    if (data) {
      setTenantAdmins(
        data.map((d: any) => ({
          user_id: d.user_id,
          email: d.profiles?.email ?? '',
          full_name: d.profiles?.full_name,
          granted_by: d.granted_by,
        })),
      );
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Also fetch tenant admins
  useEffect(() => {
    fetchTenantAdmins();
  }, [fetchTenantAdmins]);

  // Search users to grant tenant access
  const searchAdmins = async () => {
    if (!adminSearch.trim()) return;
    setAdminSearchLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, tenant_id')
        .or(`email.ilike.%${adminSearch}%,full_name.ilike.%${adminSearch}%`)
        .limit(20);
      if (data) {
        // Only show users who have admin role and aren't already in tenant admins
        const existingIds = new Set(tenantAdmins.map((a) => a.user_id));
        const filtered: typeof adminSearchResults = [];
        for (const u of data as any[]) {
          if (existingIds.has(u.id)) continue;
          const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', u.id);
          const hasAdmin = roles?.some((r: any) => r.role === 'admin');
          if (hasAdmin) {
            filtered.push({
              id: u.id,
              email: u.email,
              full_name: u.full_name,
              current_tenant: u.tenant_id,
            });
          }
        }
        setAdminSearchResults(filtered);
      }
    } catch (err) {
      console.error('Admin search error:', err);
    }
    setAdminSearchLoading(false);
  };

  // Grant admin access to this tenant
  const grantTenantAccess = async (userId: string) => {
    if (!id) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('user_tenant_access').insert({
        user_id: userId,
        tenant_id: id,
        granted_by: user?.id,
      });
      if (error) throw error;
      toast({ title: 'Access granted', description: 'Admin now has access to this tenant.' });
      setAdminSearchResults((prev) => prev.filter((u) => u.id !== userId));
      await fetchTenantAdmins();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Revoke admin access from this tenant
  const revokeTenantAccess = async (userId: string) => {
    if (!id) return;
    try {
      const { error } = await supabase
        .from('user_tenant_access')
        .delete()
        .eq('user_id', userId)
        .eq('tenant_id', id);
      if (error) throw error;
      toast({ title: 'Access revoked', description: 'Admin access has been removed from this tenant.' });
      await fetchTenantAdmins();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Search suppliers from other tenants to link
  const searchSuppliers = async () => {
    if (!id || !supplierSearch.trim()) return;
    setSearchLoading(true);
    try {
      const { data } = await supabase
        .from('suppliers')
        .select('id, company_name, supplier_code, email, tenant_id')
        .neq('tenant_id', id) // exclude suppliers already in this tenant
        .or(`company_name.ilike.%${supplierSearch}%,supplier_code.ilike.%${supplierSearch}%,email.ilike.%${supplierSearch}%`)
        .limit(20);

      if (data) {
        // Exclude already linked ones
        const linkedIds = new Set(linkedSuppliers.map((ls) => ls.supplier_id));
        const filtered = data.filter((s: any) => !linkedIds.has(s.id));

        // Get tenant names
        const tids = [...new Set(filtered.map((s: any) => s.tenant_id).filter(Boolean))];
        const { data: tenantNames } = tids.length > 0
          ? await supabase.from('tenants').select('id, name').in('id', tids)
          : { data: [] };
        const tenantMap = Object.fromEntries((tenantNames ?? []).map((t: any) => [t.id, t.name]));

        setAvailableSuppliers(
          filtered.map((s: any) => ({
            ...s,
            tenant_name: tenantMap[s.tenant_id] ?? 'Unknown',
          })),
        );
      }
    } catch (err) {
      console.error('Search error:', err);
    }
    setSearchLoading(false);
  };

  const linkSupplier = async (supplierId: string) => {
    if (!id) return;
    try {
      const { error } = await supabase.rpc('link_supplier_to_tenant', {
        _supplier_id: supplierId,
        _tenant_id: id,
      });
      if (error) throw error;
      toast({ title: 'Supplier linked', description: 'Supplier has been linked to this tenant.' });
      setAvailableSuppliers((prev) => prev.filter((s) => s.id !== supplierId));
      await fetchLinkedSuppliers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const unlinkSupplier = async (supplierId: string) => {
    if (!id) return;
    try {
      const { error } = await supabase.rpc('unlink_supplier_from_tenant', {
        _supplier_id: supplierId,
        _tenant_id: id,
      });
      if (error) throw error;
      toast({ title: 'Supplier unlinked', description: 'Supplier has been removed from this tenant.' });
      await fetchLinkedSuppliers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const toggleSharing = async (enabled: boolean) => {
    if (!id) return;
    setSharingToggling(true);
    try {
      const { error } = await supabase.rpc('toggle_supplier_sharing', {
        _tenant_id: id,
        _enabled: enabled,
      });
      if (error) throw error;
      setTenant((prev) => prev ? { ...prev, supplier_sharing_enabled: enabled } : prev);
      toast({
        title: enabled ? 'Supplier sharing enabled' : 'Supplier sharing disabled',
        description: enabled
          ? 'This tenant can now see linked suppliers from other tenants.'
          : 'Supplier sharing is now turned off for this tenant.',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSharingToggling(false);
  };

  // Save modules
  const saveModules = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const upserts = MODULE_KEYS.map((key) => ({
        tenant_id: id,
        module_key: key,
        is_enabled: enabledModules.has(key),
      }));
      await supabase.from('tenant_modules').delete().eq('tenant_id', id);
      await supabase.from('tenant_modules').insert(upserts);

      const disabledKeys = MODULE_KEYS.filter((k) => !enabledModules.has(k));
      if (disabledKeys.length > 0) {
        await supabase.from('tenant_role_modules').delete().eq('tenant_id', id).in('module_key', disabledKeys);
        const updated = { ...roleModules };
        for (const role of CONFIGURABLE_ROLES) {
          disabledKeys.forEach((k) => updated[role]?.delete(k));
        }
        setRoleModules(updated);
      }
      toast({ title: 'Modules saved', description: 'Module configuration updated.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  // Save role→module mappings
  const saveRoleModules = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await supabase.from('tenant_role_modules').delete().eq('tenant_id', id);
      const inserts: { tenant_id: string; role: string; module_key: string }[] = [];
      for (const [role, modules] of Object.entries(roleModules)) {
        for (const mod of modules) {
          if (enabledModules.has(mod)) {
            inserts.push({ tenant_id: id, role, module_key: mod });
          }
        }
      }
      if (inserts.length > 0) {
        await supabase.from('tenant_role_modules').insert(inserts);
      }
      toast({ title: 'Role access saved', description: 'Role-module mappings updated.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const toggleModule = (key: string) => {
    setEnabledModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleRoleModule = (role: string, mod: string) => {
    setRoleModules((prev) => {
      const next = { ...prev };
      const s = new Set(next[role] ?? []);
      if (s.has(mod)) s.delete(mod);
      else s.add(mod);
      next[role] = s;
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tenant) {
    return <div className="py-12 text-center text-muted-foreground">Tenant not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/super-admin/tenants')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {tenant.name}
            <Badge variant={tenant.is_active ? 'default' : 'secondary'}>
              {tenant.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">slug: {tenant.slug}</p>
        </div>
      </div>

      <Tabs defaultValue="modules">
        <TabsList>
          <TabsTrigger value="modules" className="gap-1">
            <Grid3X3 className="w-4 h-4" /> Modules
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1">
            <Building className="w-4 h-4" /> Role Access
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-1">
            <Package className="w-4 h-4" /> Suppliers
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1">
            <Users className="w-4 h-4" /> Users ({users.length})
          </TabsTrigger>
        </TabsList>

        {/* Modules Tab */}
        <TabsContent value="modules">
          <Card>
            <CardHeader>
              <CardTitle>Enabled Modules</CardTitle>
              <CardDescription>Choose which modules this tenant can access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {MODULE_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer">
                    <Checkbox checked={enabledModules.has(key)} onCheckedChange={() => toggleModule(key)} />
                    <span className="text-sm">{MODULE_LABELS[key]}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={saveModules} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Modules'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Role Access Tab */}
        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Role-Module Access Matrix</CardTitle>
              <CardDescription>
                Define which roles can see which modules in this tenant. Only enabled modules can be assigned.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Module</th>
                      {CONFIGURABLE_ROLES.map((role) => (
                        <th key={role} className="text-center py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">
                          {role.replace('_', ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULE_KEYS.map((mod) => {
                      const disabled = !enabledModules.has(mod);
                      return (
                        <tr key={mod} className={`border-b ${disabled ? 'opacity-40' : ''}`}>
                          <td className="py-2 pr-4">{MODULE_LABELS[mod]}</td>
                          {CONFIGURABLE_ROLES.map((role) => (
                            <td key={role} className="text-center py-2 px-2">
                              <Checkbox
                                checked={roleModules[role]?.has(mod) ?? false}
                                onCheckedChange={() => toggleRoleModule(role, mod)}
                                disabled={disabled}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={saveRoleModules} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Role Access'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suppliers Sharing Tab */}
        <TabsContent value="suppliers">
          <div className="space-y-6">
            {/* Sharing Toggle */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Supplier Sharing</CardTitle>
                    <CardDescription className="mt-1">
                      Allow this tenant to see suppliers linked from other tenants.
                      Only basic information is shared (name, address, contacts, documents).
                      Price Lists, RFQ, and Risk data remain separate.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {tenant.supplier_sharing_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <Switch
                      checked={tenant.supplier_sharing_enabled}
                      onCheckedChange={toggleSharing}
                      disabled={sharingToggling}
                    />
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Linked Suppliers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="w-5 h-5" />
                  Linked Suppliers ({linkedSuppliers.length})
                </CardTitle>
                <CardDescription>
                  Suppliers from other tenants that are linked to {tenant.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {linkedSuppliers.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-4">
                    No linked suppliers yet. Search and link suppliers from other tenants below.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedSuppliers.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between py-3 px-4 rounded-lg border hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{s.company_name}</p>
                            {s.supplier_code && (
                              <Badge variant="outline" className="text-xs shrink-0">
                                {s.supplier_code}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            {s.email && <span className="text-xs text-muted-foreground">{s.email}</span>}
                            <Badge variant="secondary" className="text-xs">
                              from: {s.tenant_name}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => unlinkSupplier(s.supplier_id)}
                        >
                          <Unlink className="w-4 h-4 mr-1" /> Unlink
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Search & Link Suppliers */}
            <Card>
              <CardHeader>
                <CardTitle>Link Suppliers from Other Tenants</CardTitle>
                <CardDescription>
                  Search for suppliers in other tenants and link them to {tenant.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search by company name, code, or email..."
                      value={supplierSearch}
                      onChange={(e) => setSupplierSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchSuppliers()}
                    />
                  </div>
                  <Button onClick={searchSuppliers} disabled={searchLoading || !supplierSearch.trim()}>
                    {searchLoading ? 'Searching...' : 'Search'}
                  </Button>
                </div>

                {availableSuppliers.length > 0 && (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {availableSuppliers.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between py-3 px-4 rounded-lg border hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{s.company_name}</p>
                            {s.supplier_code && (
                              <Badge variant="outline" className="text-xs shrink-0">
                                {s.supplier_code}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            {s.email && <span className="text-xs text-muted-foreground">{s.email}</span>}
                            <Badge variant="secondary" className="text-xs">
                              {s.tenant_name}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => linkSupplier(s.id)}
                        >
                          <Link2 className="w-4 h-4 mr-1" /> Link
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <div className="space-y-6">
            {/* Admin Access Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  Admin Access ({tenantAdmins.length})
                </CardTitle>
                <CardDescription>
                  Admins who can access this tenant. Admins with access to multiple tenants will be prompted to choose on login.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tenantAdmins.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-4">No admins have access to this tenant yet.</p>
                ) : (
                  <div className="space-y-2 mb-4">
                    {tenantAdmins.map((a) => (
                      <div
                        key={a.user_id}
                        className="flex items-center justify-between py-3 px-4 rounded-lg border hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center">
                            <Shield className="w-4 h-4 text-orange-600" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{a.full_name || a.email}</p>
                            <p className="text-xs text-muted-foreground">{a.email}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => revokeTenantAccess(a.user_id)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" /> Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Search & Grant Admin Access */}
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium mb-2 block">Grant Admin Access</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        placeholder="Search admin users by email or name..."
                        value={adminSearch}
                        onChange={(e) => setAdminSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchAdmins()}
                      />
                    </div>
                    <Button onClick={searchAdmins} disabled={adminSearchLoading || !adminSearch.trim()}>
                      {adminSearchLoading ? 'Searching...' : 'Search'}
                    </Button>
                  </div>
                  {adminSearchResults.length > 0 && (
                    <div className="space-y-2 mt-3 max-h-60 overflow-y-auto">
                      {adminSearchResults.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between py-3 px-4 rounded-lg border hover:bg-accent/50 transition-colors"
                        >
                          <div>
                            <p className="font-medium text-sm">{u.full_name || u.email}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => grantTenantAccess(u.id)}>
                            <UserPlus className="w-4 h-4 mr-1" /> Grant Access
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* All Users in Tenant */}
            <Card>
              <CardHeader>
                <CardTitle>All Users ({users.length})</CardTitle>
                <CardDescription>All users currently assigned to {tenant.name}</CardDescription>
              </CardHeader>
              <CardContent>
                {users.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-4">No users in this tenant yet.</p>
                ) : (
                  <div className="space-y-2">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent"
                      >
                        <div>
                          <p className="font-medium text-sm">{u.full_name || u.email}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                        <div className="flex gap-1">
                          {u.roles.map((r) => (
                            <Badge key={r} variant="outline" className="text-xs">
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
