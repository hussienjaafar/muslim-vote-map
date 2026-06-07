import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Send, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { trackLead } from '@/lib/metaPixel';

export default function RequestAccess() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [title, setTitle] = useState('');
  const [website, setWebsite] = useState('');
  const [useCase, setUseCase] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [statusToken, setStatusToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('submit_access_request', {
        _email: email.trim().toLowerCase(),
        _full_name: fullName.trim(),
        _organization: organization.trim(),
        _use_case: useCase.trim(),
        _title: title.trim() || null,
        _website: website.trim() || null,
      });

      if (error) {
        if (error.code === '23505' || /duplicate key/i.test(error.message)) {
          toast.error('An application with this email already exists.');
        } else {
          throw error;
        }
        return;
      }

      setStatusToken(data as string);
      setSubmitted(true);

      // Meta Pixel: Lead event
      trackLead({
        contentName: organization.trim(),
        email: email.trim().toLowerCase(),
        firstName: fullName.trim().split(' ')[0],
        lastName: fullName.trim().split(' ').slice(1).join(' ') || undefined,
      });

      // Notify admins (fire-and-forget — don't block the user)
      supabase.functions.invoke('notify-admins', {
        body: {
          type: 'new_application',
          data: {
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            organization: organization.trim(),
            useCase: useCase.trim(),
          },
        },
      }).catch(() => {}); // Silently ignore notification failures
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-dvh bg-[#0e0e0e] flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-6">
          <Card className="surgical-glass border-[rgba(255,255,255,0.08)]">
            <CardContent className="pt-8 pb-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-2xl font-bold text-foreground">Application Submitted</h2>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  Thank you for your interest. Our team will review your application and respond within 48 hours.
                </p>
              </div>
              {statusToken && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Track your application status:</p>
                  <Link
                    to={`/application-status?token=${statusToken}`}
                    className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors"
                  >
                    Check Application Status
                  </Link>
                </div>
              )}
              <div className="pt-2">
                <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to home
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#0e0e0e] flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <img src="/logo-icon.png" alt="Campaign Data Solutions" className="h-10 w-10 rounded-lg" />
            <h1 className="font-display text-3xl font-bold text-foreground">Request Access</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Campaign Data Solutions is invite-only. Tell us about your organization and how you plan to use issue donor data.
          </p>
        </div>

        <Card className="surgical-glass border-[rgba(255,255,255,0.08)]">
          <CardHeader className="space-y-1">
            <CardTitle className="font-display text-xl text-card-foreground">Application</CardTitle>
            <CardDescription>All fields marked with * are required</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-xs text-muted-foreground">Full Name *</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Jane Smith"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs text-muted-foreground">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane@organization.org"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="organization" className="text-xs text-muted-foreground">Organization *</Label>
                  <Input
                    id="organization"
                    value={organization}
                    onChange={e => setOrganization(e.target.value)}
                    placeholder="Your organization name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-xs text-muted-foreground">Title / Role</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g., Field Director"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="website" className="text-xs text-muted-foreground">Organization Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  placeholder="https://yourorg.org"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="useCase" className="text-xs text-muted-foreground">How do you plan to use the platform? *</Label>
                <Textarea
                  id="useCase"
                  value={useCase}
                  onChange={e => setUseCase(e.target.value)}
                  placeholder="Describe your organization's work, the issues you campaign on, and how district-level donor data would support your efforts..."
                  required
                  rows={4}
                  className="resize-none"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" />Submit Application</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors">
              Sign in
            </Link>
          </p>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5">
            <ArrowLeft className="w-3 h-3" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
