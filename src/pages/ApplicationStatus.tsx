import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Clock, CheckCircle, XCircle, MessageCircle, ArrowLeft, ArrowRight } from 'lucide-react';

interface StatusData {
  status: string;
  email: string;
  full_name: string;
  created_at: string;
  reviewed_at: string | null;
  reviewer_notes: string | null;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; description: string }> = {
  pending: {
    icon: <Clock className="w-8 h-8" />,
    label: 'Under Review',
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    description: 'Your application is being reviewed by our team. We typically respond within 48 hours.',
  },
  approved: {
    icon: <CheckCircle className="w-8 h-8" />,
    label: 'Approved',
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    description: 'Your application has been approved! Check your email for an invitation link to create your account.',
  },
  rejected: {
    icon: <XCircle className="w-8 h-8" />,
    label: 'Not Approved',
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    description: 'Unfortunately, your application was not approved at this time. You may reapply in the future.',
  },
  more_info: {
    icon: <MessageCircle className="w-8 h-8" />,
    label: 'More Information Needed',
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    description: 'Our team needs additional information before making a decision. Please see the notes below.',
  },
};

export default function ApplicationStatus() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No application token provided.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data: results, error: rpcError } = await supabase
          .rpc('check_application_status', { check_token: token });

        if (rpcError) throw rpcError;
        if (!results || results.length === 0) {
          setError('Application not found. Please check your link.');
          return;
        }
        setData(results[0] as StatusData);
      } catch (err: any) {
        setError(err.message || 'Failed to load application status.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#0e0e0e] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-dvh bg-[#0e0e0e] flex items-center justify-center p-4">
        <Card className="surgical-glass border-[rgba(255,255,255,0.08)] max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <XCircle className="w-12 h-12 text-red-400 mx-auto" />
            <p className="text-foreground font-display text-lg">{error}</p>
            <Link to="/" className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors">
              Back to home
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const config = STATUS_CONFIG[data.status] || STATUS_CONFIG.pending;

  return (
    <div className="min-h-dvh bg-[#0e0e0e] flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="font-display text-2xl font-bold text-foreground">Application Status</h1>
          <p className="text-sm text-muted-foreground">For {data.full_name} ({data.email})</p>
        </div>

        <Card className="surgical-glass border-[rgba(255,255,255,0.08)]">
          <CardContent className="pt-8 pb-8 space-y-6">
            {/* Status badge + icon */}
            <div className="text-center space-y-4">
              <div className={`w-16 h-16 rounded-full ${config.color} flex items-center justify-center mx-auto border`}>
                {config.icon}
              </div>
              <Badge className={`${config.color} text-sm px-4 py-1`}>
                {config.label}
              </Badge>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground text-center max-w-sm mx-auto">
              {config.description}
            </p>

            {/* Reviewer notes (only for more_info) */}
            {data.status === 'more_info' && data.reviewer_notes && (
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-2">
                <p className="text-xs font-display uppercase tracking-wider text-blue-400">Notes from reviewer</p>
                <p className="text-sm text-foreground">{data.reviewer_notes}</p>
              </div>
            )}

            {/* Signup link (only for approved) */}
            {data.status === 'approved' && (
              <div className="text-center">
                <Link
                  to={`/signup?email=${encodeURIComponent(data.email)}`}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white px-6 py-2.5 rounded-md text-sm font-medium transition-all"
                >
                  Create Your Account <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}

            {/* Timestamps */}
            <div className="border-t border-white/5 pt-4 space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Submitted</span>
                <span className="tabular-nums">{new Date(data.created_at).toLocaleDateString()}</span>
              </div>
              {data.reviewed_at && (
                <div className="flex justify-between">
                  <span>Reviewed</span>
                  <span className="tabular-nums">{new Date(data.reviewed_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5">
            <ArrowLeft className="w-3 h-3" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
