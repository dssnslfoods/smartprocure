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
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-background font-sans">
      {/* Brand/Hero Section - Visible on medium screens and up */}
      <div className="hidden md:flex md:w-5/12 lg:w-1/2 bg-slate-950 relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 to-secondary/95 mix-blend-multiply z-10" />
        <div 
          className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center z-0 opacity-40 grayscale-[30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent z-10" />
        
        <div className="relative z-20 w-full max-w-lg text-white space-y-8">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 mb-8 shadow-2xl">
            <Building2 className="w-8 h-8 text-white drop-shadow-md" />
          </div>
          
          <div className="space-y-4">
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight drop-shadow-sm">
              Smart <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-indigo-200">Procurement</span>
            </h1>
            <p className="text-lg lg:text-xl text-blue-50/90 font-light leading-relaxed max-w-md">
              Enterprise supply chain operations portal for <span className="font-semibold text-white">NSL Foods PLC</span>. Secure, transparent, and seamless.
            </p>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 text-sm text-blue-100/70 font-medium">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400"/> Enterprise Grade</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400"/> End-to-end Encrypted</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400"/> Always Sync</span>
          </div>
        </div>
      </div>

      {/* Login Form Section */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 relative bg-slate-50 dark:bg-background">
        <div className="w-full max-w-[400px] mx-auto flex flex-col space-y-8">
          
          {/* Mobile Header (Hidden on Desktop) */}
          <div className="text-center space-y-2 mb-4 md:hidden">
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary/20">
              <Building2 className="w-7 h-7 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Smart Procurement</h2>
            <p className="text-muted-foreground text-sm font-medium">NSL Foods PLC</p>
          </div>

          <div className="text-center md:text-left space-y-2 hidden md:block mb-2">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Welcome back</h2>
            <p className="text-muted-foreground text-sm">Enter your credentials to access your account.</p>
          </div>

          {justRegistered && (
            <Alert className="border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 shadow-sm rounded-xl">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
              <AlertDescription className="text-sm font-medium text-emerald-800 dark:text-emerald-300 ml-2">
                ลงทะเบียนสำเร็จ! ข้อมูลของท่านจะถูกตรวจสอบโดยผู้ดูแลระบบ เมื่อได้รับการอนุมัติแล้วจะสามารถเข้าสู่ระบบได้
              </AlertDescription>
            </Alert>
          )}

          <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/40 dark:shadow-none">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2.5">
                <Label htmlFor="email" className="text-sm font-semibold text-slate-700 dark:text-slate-300">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  className="h-11 bg-slate-50 dark:bg-background border-slate-200 dark:border-border focus-visible:ring-primary/30 focus-visible:border-primary transition-all rounded-xl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@nslfoods.com"
                  required
                />
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-semibold text-slate-700 dark:text-slate-300">Password</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  className="h-11 bg-slate-50 dark:bg-background border-slate-200 dark:border-border focus-visible:ring-primary/30 focus-visible:border-primary transition-all rounded-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  <span>{error}</span>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 transition-all hover:translate-y-[-2px] rounded-xl mt-2" 
                disabled={loading}
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-8 relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-border"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-card px-3 text-muted-foreground font-bold tracking-widest">
                  Or
                </span>
              </div>
            </div>

            <div className="mt-6 text-center">
              <Link to="/register/supplier">
                <Button variant="outline" className="w-full h-12 border-slate-300 dark:border-border hover:bg-slate-50 dark:hover:bg-accent hover:text-slate-900 dark:hover:text-foreground transition-all rounded-xl font-medium">
                  <Building2 className="w-4 h-4 mr-2" /> 
                  Register as a New Supplier
                </Button>
              </Link>
            </div>
          </div>

          <div className="text-center md:text-left text-xs text-slate-500 dark:text-muted-foreground font-medium pt-4">
            © 2026 Arnon Arpaket. All Rights Reserved.
          </div>
        </div>
      </div>
    </div>
  );
}
