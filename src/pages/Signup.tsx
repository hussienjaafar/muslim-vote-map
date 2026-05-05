import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UserPlus, Eye, EyeOff, Check, X, Mail, ArrowLeft } from 'lucide-react';
import { trackCompleteRegistration } from '@/lib/metaPixel';

const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address')
    .max(255, 'Email must be less than 255 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters'),
});

type SignupFormValues = z.infer<typeof signupSchema>;

const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { key: 'number', label: 'One number', test: (p: string) => /\d/.test(p) },
  { key: 'special', label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

function getStrength(password: string) {
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  if (passed <= 1) return { score: 20, label: 'Weak', color: 'bg-destructive' };
  if (passed <= 2) return { score: 40, label: 'Fair', color: 'bg-orange-500' };
  if (passed <= 3) return { score: 60, label: 'Good', color: 'bg-yellow-500' };
  if (passed <= 4) return { score: 80, label: 'Strong', color: 'bg-primary' };
  return { score: 100, label: 'Very strong', color: 'bg-green-500' };
}

export default function Signup() {
  const [searchParams] = useSearchParams();
  const invitedEmail = searchParams.get('email') || '';

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: '',
      email: invitedEmail,
      password: '',
    },
    mode: 'onChange',
  });

  const watchedPassword = form.watch('password') || '';
  const strength = useMemo(() => getStrength(watchedPassword), [watchedPassword]);
  

  const onSubmit = async (values: SignupFormValues) => {
    setLoading(true);
    try {
      const { data: invited, error: invErr } = await supabase.rpc('is_invited', {
        check_email: values.email,
      });
      if (invErr) throw invErr;
      if (!invited) {
        toast.error('You need an invitation to sign up. Contact an administrator.');
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: `${window.location.origin}/map`,
          data: { full_name: values.fullName },
        },
      });
      if (error) throw error;

      setSubmittedEmail(values.email);
      setSubmitted(true);

      // Meta Pixel: CompleteRegistration event
      trackCompleteRegistration({
        email: values.email,
        firstName: values.fullName.split(' ')[0],
        lastName: values.fullName.split(' ').slice(1).join(' ') || undefined,
      });

      // Notify admins that an invite was accepted (fire-and-forget)
      supabase.functions.invoke('notify-admins', {
        body: {
          type: 'invite_accepted',
          data: {
            email: values.email,
            fullName: values.fullName,
          },
        },
      }).catch(() => {});
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-3">
              <img src="/logo-icon.png" alt="Muslim Voter Project" className="h-10 w-10 rounded-lg" />
              <h1 className="font-display text-3xl font-bold text-foreground">Muslim Voter Project</h1>
            </div>
          </div>

          <Card className="surgical-glass border-[rgba(255,255,255,0.08)]">
            <CardContent className="pt-8 pb-8 text-center space-y-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-card-foreground">Check your email</h2>
                <p className="text-sm text-muted-foreground">
                  We've sent a confirmation link to
                </p>
                <p className="text-sm font-medium text-foreground">{submittedEmail}</p>
                <p className="text-sm text-muted-foreground">
                  Click the link in the email to activate your account.
                </p>
              </div>
              <Link to="/login">
                <Button variant="outline" className="w-full mt-2">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Sign In
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <img src="/logo-icon.png" alt="Muslim Voter Project" className="h-10 w-10 rounded-lg" />
            <h1 className="font-display text-3xl font-bold text-foreground">Muslim Voter Project</h1>
          </div>
          <p className="text-muted-foreground">Data-driven insights for civic engagement</p>
        </div>

        <Card className="surgical-glass border-[rgba(255,255,255,0.08)]">
          <CardHeader className="space-y-1">
            <CardTitle className="font-display text-xl text-card-foreground">Create Account</CardTitle>
            <CardDescription>You've been invited to join the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Your full name"
                          autoComplete="name"
                          enterKeyHint="next"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="your-invited@email.com"
                          autoComplete="email"
                          inputMode="email"
                          enterKeyHint="next"
                          readOnly={!!invitedEmail}
                          className={invitedEmail ? 'bg-muted' : ''}
                          {...field}
                        />
                      </FormControl>
                      {invitedEmail && (
                        <p className="text-xs text-muted-foreground">
                          This is the email address your invitation was sent to.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            enterKeyHint="done"
                            className="pr-10"
                            {...field}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setShowPassword((v) => !v)}
                            tabIndex={-1}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />

                      {watchedPassword.length > 0 && (
                        <div className="space-y-3 pt-1">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Strength</span>
                              <span className="font-medium text-foreground">{strength.label}</span>
                            </div>
                            <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                              <div
                                className={`h-full transition-all duration-300 rounded-full ${strength.color}`}
                                style={{ width: `${strength.score}%` }}
                              />
                            </div>
                          </div>
                          <ul className="space-y-1">
                            {PASSWORD_RULES.map((rule) => {
                              const passed = rule.test(watchedPassword);
                              return (
                                <li key={rule.key} className="flex items-center gap-2 text-xs">
                                  {passed ? (
                                    <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                  ) : (
                                    <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  )}
                                  <span className={passed ? 'text-foreground' : 'text-muted-foreground'}>
                                    {rule.label}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !form.formState.isValid}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  {loading ? 'Creating account…' : 'Sign Up'}
                </Button>

                <p className="text-sm text-center text-muted-foreground">
                  Already have an account?{' '}
                  <Link to="/login" className="text-primary hover:underline">
                    Sign in
                  </Link>
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Need access? Contact your organization administrator for an invitation.
        </p>
      </div>
    </div>
  );
}
