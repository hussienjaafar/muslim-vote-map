import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Plug, RefreshCw, Megaphone, MessageSquare, HeartHandshake, Facebook, Loader2, Copy, Check, CheckCircle2, AlertCircle, History } from 'lucide-react';
import {
  useOrgCredentials, useSaveCredentials, useDisconnectCredentials, useRunSync,
  useMetaOAuthInit, useMetaOAuthCallback, useMetaSaveConnection,
  useActblueJobs, useRunActblueWorker,
  type Platform, type CredentialStatus, type MetaAdAccount,
} from '@/queries/useIntegrationQueries';

type Field = { key: string; label: string; placeholder?: string };

const ACTBLUE_WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/actblue-webhook`;

function WebhookUrlField({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Webhook URL copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy URL');
    }
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Webhook endpoint URL</Label>
      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-9 font-mono text-xs" />
        <Button type="button" size="sm" variant="outline" className="h-9 shrink-0 gap-1.5" onClick={copy}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Paste this as the webhook URL when configuring your ActBlue webhook.
      </p>
    </div>
  );
}

function ActblueHistory({ orgId }: { orgId: string }) {
  const { data: jobs, isLoading } = useActblueJobs(orgId);
  const runWorker = useRunActblueWorker(orgId);

  const handleRun = async () => {
    try {
      const res = await runWorker.mutateAsync();
      const completed = res.summary.filter((s) => s.result === 'complete').length;
      const pending = res.summary.filter((s) => s.result === 'pending').length;
      if (completed) toast.success(`Checked — ${completed} export(s) completed`);
      else if (pending) toast.info(`Checked — ${pending} export(s) still generating`);
      else toast.info('Checked — no exports waiting');
    } catch (e: any) {
      toast.error(e.message ?? 'Could not run check');
    }
  };

  return (
    <div className="rounded-md border border-border bg-background/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Export history</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-[11px]"
          onClick={handleRun}
          disabled={runWorker.isPending}
        >
          <RefreshCw className={`w-3 h-3 ${runWorker.isPending ? 'animate-spin' : ''}`} /> Run check now
        </Button>
      </div>
      {isLoading ? (
        <p className="text-[11px] text-muted-foreground">Loading…</p>
      ) : !jobs?.length ? (
        <p className="text-[11px] text-muted-foreground">No exports yet. Run a sync to request one.</p>
      ) : (
        <ul className="space-y-1.5">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-2 text-[11px]">
              {j.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />}
              {j.status === 'complete' && <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />}
              {j.status === 'error' && <AlertCircle className="w-3 h-3 text-destructive shrink-0" />}
              <span className="capitalize font-medium">{j.status}</span>
              {j.date_range_start && j.date_range_end ? (
                <span className="text-muted-foreground">· {j.date_range_start} → {j.date_range_end}</span>
              ) : (
                <span className="text-muted-foreground">· last {j.since_days}d</span>
              )}
              {j.status === 'complete' && j.rows_imported != null && (
                <span className="text-muted-foreground">· {j.rows_imported} record(s)</span>
              )}
              {j.status === 'processing' && j.attempts > 0 && (
                <span className="text-muted-foreground">· attempt {j.attempts}</span>
              )}
              <span className="text-muted-foreground ml-auto shrink-0">
                {formatDistanceToNow(new Date(j.updated_at), { addSuffix: true })}
              </span>
            </li>
          ))}
          {jobs.some((j) => j.status === 'error' && j.last_error) && (
            <li className="text-[11px] text-destructive pt-0.5">
              {jobs.find((j) => j.status === 'error' && j.last_error)?.last_error}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}



const PLATFORMS: { id: Platform; name: string; icon: typeof Plug; fields: Field[]; help?: string }[] = [
  {
    id: 'meta', name: 'Meta Ads', icon: Megaphone,
    fields: [
      { key: 'access_token', label: 'Access token', placeholder: 'EAAB...' },
      { key: 'ad_account_id', label: 'Ad account ID', placeholder: 'act_123456789' },
    ],
  },
  {
    id: 'switchboard', name: 'Switchboard SMS', icon: MessageSquare,
    fields: [
      { key: 'account_id', label: 'Account ID', placeholder: 'Switchboard account ID' },
      { key: 'api_key', label: 'Secret key', placeholder: 'sb_live_...' },
    ],
    help: 'Account ID and Secret key authenticate against the Switchboard API to sync SMS broadcasts.',
  },
  {
    id: 'actblue', name: 'ActBlue', icon: HeartHandshake,
    fields: [
      { key: 'username', label: 'CSV API username', placeholder: 'CSV API username' },
      { key: 'password', label: 'CSV API password', placeholder: 'CSV API password' },
      { key: 'entity_id', label: 'Entity ID', placeholder: 'ActBlue entity ID' },
      { key: 'webhook_secret', label: 'Webhook secret (optional)' },
      { key: 'basic_auth_username', label: 'Webhook username (optional)' },
      { key: 'basic_auth_password', label: 'Webhook password (optional)' },
    ],
    help: 'CSV username, password & Entity ID power scheduled pulls. Add a webhook secret (HMAC) or webhook username/password to enable real-time donations.',
  },

];

function statusFor(creds: CredentialStatus[] | undefined, p: Platform) {
  return creds?.find((c) => c.platform === p);
}

export default function OrgIntegrations({ orgId }: { orgId: string }) {
  const { data: creds } = useOrgCredentials(orgId);
  const save = useSaveCredentials(orgId);
  const disconnect = useDisconnectCredentials(orgId);
  const runSync = useRunSync(orgId);
  const metaInit = useMetaOAuthInit(orgId);
  const metaCallback = useMetaOAuthCallback(orgId);
  const metaSave = useMetaSaveConnection(orgId);

  const popupRef = useRef<Window | null>(null);
  const [accounts, setAccounts] = useState<MetaAdAccount[] | null>(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [exchanging, setExchanging] = useState(false);

  // Listen for the OAuth result posted back from the popup window.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== 'meta-oauth') return;
      popupRef.current?.close();
      popupRef.current = null;
      if (data.error) {
        toast.error(typeof data.error === 'string' ? data.error : 'Facebook connection was cancelled');
        return;
      }
      if (!data.code || !data.state) {
        toast.error('Missing authorization code. Please try again.');
        return;
      }
      setExchanging(true);
      metaCallback.mutate(
        { code: data.code, state: data.state },
        {
          onSuccess: (res) => {
            if (!res.adAccounts.length) toast.error('No ad accounts were found for this Facebook user.');
            else setAccounts(res.adAccounts);
          },
          onError: (e: any) => toast.error(e.message ?? 'Connection failed'),
          onSettled: () => setExchanging(false),
        },
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const handleConnectMeta = async () => {
    try {
      const redirectUri = `${window.location.origin}/meta-oauth-callback`;
      const { authorizeUrl } = await metaInit.mutateAsync(redirectUri);
      const w = 600;
      const h = 750;
      const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
      const popup = window.open(
        authorizeUrl,
        'meta-oauth',
        `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`,
      );
      if (!popup) {
        toast.error('Popup blocked. Please allow popups for this site and try again.');
        return;
      }
      popupRef.current = popup;
    } catch (e: any) {
      toast.error(e.message ?? 'Could not start Meta connection');
    }
  };

  const handleSelectAccount = (acct: MetaAdAccount) => {
    metaSave.mutate(acct.id, {
      onSuccess: () => {
        toast.success(`Connected ${acct.name}`);
        setAccounts(null);
      },
      onError: (e: any) => toast.error(e.message ?? 'Failed to save selection'),
    });
  };

  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});

  const setField = (p: Platform, key: string, val: string) =>
    setDrafts((d) => ({ ...d, [p]: { ...(d[p] ?? {}), [key]: val } }));

  const handleSave = async (p: Platform) => {
    const values = drafts[p] ?? {};
    if (Object.values(values).every((v) => !v?.trim())) {
      toast.error('Enter credential values first');
      return;
    }
    try {
      await save.mutateAsync({ platform: p, credentials: values });
      toast.success('Credentials saved & encrypted');
      setDrafts((d) => ({ ...d, [p]: {} }));
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save');
    }
  };

  const handleSync = async () => {
    try {
      const res = await runSync.mutateAsync(30);
      const queued = res.results.filter((r) => (r as any).queued);
      const ok = res.results.filter((r) => r.ok && !(r as any).queued).length;
      const failed = res.results.filter((r) => !r.ok);
      const parts: string[] = [];
      if (ok) parts.push(`${ok} source(s) synced`);
      if (queued.length) parts.push(`${queued.map((q) => q.platform).join(', ')} processing in background`);
      if (failed.length) {
        toast.warning(`${parts.join(', ') || 'Sync ran'}. Issues: ${failed.map((f) => `${f.platform}: ${f.error}`).join('; ')}`);
      } else {
        toast.success(parts.join(', ') || 'Sync complete');
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Sync failed');
    }
  };

  const handleBackfill = async () => {
    try {
      const res = await runSync.mutateAsync({ full: true });
      const queued = res.results.filter((r) => (r as any).queued);
      const ok = res.results.filter((r) => r.ok && !(r as any).queued).length;
      const failed = res.results.filter((r) => !r.ok);
      const parts: string[] = [];
      if (ok) parts.push(`${ok} source(s) backfilled`);
      if (queued.length) parts.push(`${queued.map((q) => q.platform).join(', ')} processing in background`);
      if (failed.length) {
        toast.warning(`${parts.join(', ') || 'Backfill ran'}. Issues: ${failed.map((f) => `${f.platform}: ${f.error}`).join('; ')}`);
      } else {
        toast.success(`${parts.join(', ') || 'Full history backfill started'}. Meta is limited to ~37 months.`);
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Backfill failed');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Plug className="w-4 h-4" /> Integrations</CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={handleBackfill} disabled={runSync.isPending}>
            <History className="w-3.5 h-3.5" /> Backfill full history
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={handleSync} disabled={runSync.isPending}>
            <RefreshCw className={`w-3.5 h-3.5 ${runSync.isPending ? 'animate-spin' : ''}`} /> Sync now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {PLATFORMS.map((p) => {
          const st = statusFor(creds, p.id);
          const connected = !!st?.is_active;
          const Icon = p.icon;
          return (
            <div key={p.id} className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">{p.name}</span>
                <Badge className={connected ? 'bg-primary/15 text-primary border-primary/30' : 'bg-muted text-muted-foreground border-border'}>
                  {connected ? 'Connected' : 'Not connected'}
                </Badge>
                {st?.last_sync_at && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    Synced {formatDistanceToNow(new Date(st.last_sync_at), { addSuffix: true })}
                  </span>
                )}
              </div>
              {st?.last_sync_status?.startsWith('processing') && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Processing in background — this updates automatically when ready.
                </p>
              )}
              {st?.last_sync_status && st.last_sync_status.startsWith('error') && (
                <p className="text-[11px] text-destructive">{st.last_sync_status}</p>
              )}
              {p.id === 'meta' && (
                <div className="space-y-2">
                  <Button
                    size="sm"
                    className="gap-2 bg-[#1877F2] hover:bg-[#1877F2]/90 text-white"
                    onClick={handleConnectMeta}
                    disabled={metaInit.isPending || exchanging}
                  >
                    {metaInit.isPending || exchanging
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Facebook className="w-3.5 h-3.5" />}
                    {connected ? 'Reconnect with Facebook' : 'Connect with Facebook'}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Recommended: sign in with Facebook to pick an ad account automatically. Or paste a token manually below.
                  </p>
                </div>
              )}
              {p.id === 'actblue' && <WebhookUrlField url={ACTBLUE_WEBHOOK_URL} />}
              {p.id === 'actblue' && connected && <ActblueHistory orgId={orgId} />}
              <div className="grid sm:grid-cols-2 gap-3">


                {p.fields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder={connected ? '•••••• (saved)' : f.placeholder}
                      value={drafts[p.id]?.[f.key] ?? ''}
                      onChange={(e) => setField(p.id, f.key, e.target.value)}
                      className="h-9"
                    />
                  </div>
                ))}
              </div>
              {p.help && <p className="text-[11px] text-muted-foreground">{p.help}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleSave(p.id)} disabled={save.isPending}>
                  {connected ? 'Update credentials' : 'Connect'}
                </Button>
                {connected && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() =>
                    disconnect.mutate(p.id, {
                      onSuccess: () => toast.success(`${p.name} disconnected`),
                      onError: (e: any) => toast.error(e.message),
                    })
                  }>
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">
          Keys are encrypted before storage and never displayed again. Re-enter to update.
        </p>
      </CardContent>

      <Dialog open={!!accounts} onOpenChange={(o) => { if (!o) { setAccounts(null); setAccountSearch(''); } }}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Megaphone className="w-4 h-4 text-primary" /> Choose an ad account
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Select the ad account to sync for this organization:</p>
          <Input
            placeholder="Search by name or account ID..."
            value={accountSearch}
            onChange={(e) => setAccountSearch(e.target.value)}
            className="mt-1"
          />
          <div className="space-y-2 overflow-y-auto flex-1 -mr-2 pr-2">
            {(() => {
              const q = accountSearch.trim().toLowerCase();
              const filtered = (accounts ?? []).filter(
                (a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
              );
              if (!filtered.length) {
                return <p className="text-sm text-muted-foreground py-4 text-center">No ad accounts match your search.</p>;
              }
              return filtered.map((a) => (
                <Button
                  key={a.id}
                  variant="outline"
                  className="w-full justify-between h-auto py-2.5"
                  disabled={metaSave.isPending}
                  onClick={() => handleSelectAccount(a)}
                >
                  <span className="text-left">
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {a.id}{a.currency ? ` · ${a.currency}` : ''}
                    </span>
                  </span>
                  {metaSave.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                </Button>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
