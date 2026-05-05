import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { LogIn, KeyRound, ArrowLeft } from 'lucide-react';

type Mode = 'login' | 'forgot';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect old invite links (?mode=signup) to the dedicated signup page
  useEffect(() => {
    if (searchParams.get('mode') === 'signup') {
      const inviteEmail = searchParams.get('email') || '';
      navigate(`/signup${inviteEmail ? `?email=${encodeURIComponent(inviteEmail)}` : ''}`, { replace: true });
    }
  }, [searchParams, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error, data } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Check if user is admin to route appropriately
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', data.user.id)
        .eq('role', 'admin');
      navigate(roles && roles.length > 0 ? '/admin' : '/home');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('Check your email for a password reset link.');
      setMode('login');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <img src="/logo-icon.png" alt="Campaign Data Solutions" className="h-10 w-10 rounded-lg" />
            <h1 className="font-display text-3xl font-bold text-foreground">Campaign Data Solutions</h1>
          </div>
          <p className="text-muted-foreground">Issue-based donor intelligence, district by district</p>
        </div>

        <Card className="surgical-glass border-[rgba(255,255,255,0.08)]">
          <CardHeader className="space-y-1">
            <CardTitle className="font-display text-xl text-card-foreground">
              {mode === 'login' ? 'Sign In' : 'Reset Password'}
            </CardTitle>
            <CardDescription>
              {mode === 'login' ? 'Enter your credentials to access the platform' : "We'll send you a link to reset your password"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  <LogIn className="h-4 w-4 mr-2" />
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button type="button" className="text-primary hover:underline" onClick={() => setMode('forgot')}>
                    Forgot password?
                  </button>
                  <Link to="/signup" className="text-primary hover:underline">
                    Have an invite? Sign up
                  </Link>
                </div>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="resetEmail">Email</Label>
                  <Input id="resetEmail" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  <KeyRound className="h-4 w-4 mr-2" />
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
                <button type="button" className="text-sm text-primary hover:underline w-full text-center" onClick={() => setMode('login')}>
                  <ArrowLeft className="h-3 w-3 inline mr-1" />
                  Back to sign in
                </button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Need access?{' '}
          <Link to="/request-access" className="text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors">
            Apply here
          </Link>
        </p>
      </div>
    </div>
  );
}
