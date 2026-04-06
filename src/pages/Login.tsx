import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Building2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justRegistered = searchParams.get('registered') === 'true';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    // Check if supplier user is approved
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
      const isSupplier = roles?.some(r => r.role === 'supplier');

      if (isSupplier) {
        // Check supplier approval status
        const { data: profile } = await supabase.from('profiles').select('supplier_id').eq('id', user.id).single();
        if (profile?.supplier_id) {
          const { data: supplier } = await supabase.from('suppliers').select('status').eq('id', profile.supplier_id).single();
          if (supplier && supplier.status !== 'approved') {
            await supabase.auth.signOut();
            setLoading(false);
            setError('บัญชีของท่านอยู่ระหว่างการตรวจสอบ กรุณารอการอนุมัติจากผู้ดูแลระบบ');
            return;
          }
        }
      }
    }

    setLoading(false);
    navigate('/');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-xl">SP</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Smart Procurement</h1>
          <p className="text-sm text-muted-foreground mt-1">NSL Foods PLC</p>
        </div>

        {justRegistered && (
          <Alert className="mb-4 border-emerald-500/30 bg-emerald-500/5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-sm">
              ลงทะเบียนสำเร็จ! ข้อมูลของท่านจะถูกตรวจสอบโดยผู้ดูแลระบบ เมื่อได้รับการอนุมัติแล้วจะสามารถเข้าสู่ระบบได้
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-4">
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@nslfoods.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t text-center">
              <p className="text-sm text-muted-foreground mb-2">เป็น Supplier ใหม่?</p>
              <Link to="/register/supplier">
                <Button variant="outline" className="w-full">
                  <Building2 className="w-4 h-4 mr-2" /> ลงทะเบียน Supplier
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          © 2026 Arnon Arpaket. All Rights Reserved.
        </div>
      </div>
    </div>
  );
}
