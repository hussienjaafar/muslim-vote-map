import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import {
  useMetaOAuthCallback, useMetaSaveConnection, type MetaAdAccount,
} from '@/queries/useIntegrationQueries';

export default function MetaOAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const code = params.get('code');
  const state = params.get('state');
  const oauthError = params.get('error_description') || params.get('error');

  // If this page is running inside the OAuth popup, relay the result back to the
  // opener window and close. The opener handles the token exchange + account picker.
  const isPopup = useMemo(() => {
    try {
      return !!window.opener && window.opener !== window;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isPopup) return;
    try {
      window.opener.postMessage(
        { type: 'meta-oauth', code, state, error: oauthError },
        window.location.origin,
      );
    } catch {
      /* ignore */
    }
    window.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPopup]);

  const orgId = useMemo(() => sessionStorage.getItem('meta_oauth_org') ?? undefined, []);

  const callback = useMetaOAuthCallback(orgId);
  const saveConnection = useMetaSaveConnection(orgId);

  const [accounts, setAccounts] = useState<MetaAdAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isPopup) return; // popup relays to opener; opener handles the exchange
    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (!code || !state) {
      setError('Missing authorization code. Please restart the connection.');
      return;
    }
    if (!orgId) {
      setError('Lost connection context. Please restart from the organization page.');
      return;
    }
    callback.mutate(
      { code, state },
      {
        onSuccess: (res) => {
          if (!res.adAccounts.length) setError('No ad accounts were found for this Facebook user.');
          else setAccounts(res.adAccounts);
        },
        onError: (e: any) => setError(e.message ?? 'Connection failed'),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (acct: MetaAdAccount) => {
    saveConnection.mutate(acct.id, {
      onSuccess: () => {
        setDone(true);
        toast.success(`Connected ${acct.name}`);
        sessionStorage.removeItem('meta_oauth_org');
        setTimeout(() => navigate(`/admin/orgs/${orgId}`), 1200);
      },
      onError: (e: any) => toast.error(e.message ?? 'Failed to save selection'),
    });
  };

  if (isPopup) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Completing connection… you can close this window.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="w-4 h-4 text-primary" /> Connect Meta Ads
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p>{error}</p>
                {orgId && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate(`/admin/orgs/${orgId}`)}>
                    Back to organization
                  </Button>
                )}
              </div>
            </div>
          )}

          {!error && !accounts && !done && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Completing connection…
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="w-4 h-4" /> Connected! Redirecting…
            </div>
          )}

          {!error && !done && accounts && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Choose the ad account to sync:</p>
              {accounts.map((a) => (
                <Button
                  key={a.id}
                  variant="outline"
                  className="w-full justify-between h-auto py-2.5"
                  disabled={saveConnection.isPending}
                  onClick={() => handleSelect(a)}
                >
                  <span className="text-left">
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {a.id}{a.currency ? ` · ${a.currency}` : ''}
                    </span>
                  </span>
                  {saveConnection.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
