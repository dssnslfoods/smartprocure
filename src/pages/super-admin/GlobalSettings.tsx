import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MODULE_KEYS } from '@/contexts/AuthContext';

export default function GlobalSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Global Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">System-wide configuration for Super Admin</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available Modules</CardTitle>
          <CardDescription>
            These are the system-wide modules that can be enabled/disabled per tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {MODULE_KEYS.map((key) => (
              <Badge key={key} variant="outline" className="text-sm py-1 px-3">
                {key}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform</span>
            <span className="font-medium">Smart Procurement</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Architecture</span>
            <span className="font-medium">Multi-Tenant (Shared DB)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Isolation</span>
            <span className="font-medium">Row Level Security (RLS)</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
