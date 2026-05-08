import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { KeyRound, ShieldCheck } from 'lucide-react';

type Step = 'verify' | 'set-password';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>('verify');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Legacy flow: if recovery token comes back through URL hash (old emails / generated links),
  // Supabase auto-establishes a session — skip the OTP step.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery') || hash.includes('access_token')) {
      setStep('set-password');
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStep('set-password');
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || token.length !== 6) {
      toast.error('Enter your email and the 6-digit code from the email.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: 'recovery',
      });
      if (error) throw error;
      setStep('set-password');
      toast.success('Code verified — choose a new password.');
    } catch (err: any) {
      toast.error(err.message ?? 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password updated successfully');
      // Route based on role
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin');
        navigate(roles && roles.length > 0 ? '/admin' : '/home');
      } else {
        navigate('/login');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center flex items-center justify-center gap-3">
          <img src="/logo-icon.png" alt="Campaign Data Solutions" className="h-10 w-10 rounded-lg" />
          <h1 className="font-display text-3xl font-bold text-foreground">Campaign Data Solutions</h1>
        </div>

        <Card className="surgical-glass border-[rgba(255,255,255,0.08)]">
          {step === 'verify' ? (
            <>
              <CardHeader>
                <CardTitle className="font-display text-xl text-card-foreground">Enter reset code</CardTitle>
                <CardDescription>
                  We sent a 6-digit code to your email. Enter it below to continue.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="token">6-digit code</Label>
                    <InputOTP maxLength={6} value={token} onChange={setToken}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading || token.length !== 6}>
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    {loading ? 'Verifying...' : 'Verify code'}
                  </Button>
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline w-full text-center"
                    onClick={() => navigate('/login')}
                  >
                    Back to sign in
                  </button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="font-display text-xl text-card-foreground">Set new password</CardTitle>
                <CardDescription>Enter your new password below</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input id="newPassword" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    <KeyRound className="h-4 w-4 mr-2" />
                    {loading ? 'Updating...' : 'Update Password'}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
