import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Plug, RefreshCw, Megaphone, MessageSquare, HeartHandshake, Facebook, Loader2 } from 'lucide-react';
import {
  useOrgCredentials, useSaveCredentials, useDisconnectCredentials, useRunSync,
  useMetaOAuthInit, useMetaOAuthCallback, useMetaSaveConnection,
  type Platform, type CredentialStatus, type MetaAdAccount,
} from '@/queries/useIntegrationQueries';

type Field = { key: string; label: string; placeholder?: string };

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
      { key: 'api_key', label: 'API key', placeholder: 'sb_live_...' },
      { key: 'base_url', label: 'Base URL (optional)', placeholder: 'https://api.oneswitchboard.com' },
    ],
  },
  {
    id: 'actblue', name: 'ActBlue', icon: HeartHandshake,
    fields: [
      { key: 'client_uuid', label: 'Client UUID', placeholder: 'CSV API username' },
      { key: 'client_secret', label: 'Client secret', placeholder: 'CSV API password' },
      { key: 'webhook_username', label: 'Webhook username (optional)' },
      { key: 'webhook_password', label: 'Webhook password (optional)' },
    ],
    help: 'CSV API powers scheduled pulls; webhook credentials enable real-time donations.',
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

  const handleConnectMeta = async () => {
    try {
      const redirectUri = `${window.location.origin}/meta-oauth-callback`;
      sessionStorage.setItem('meta_oauth_org', orgId);
      const { authorizeUrl } = await metaInit.mutateAsync(redirectUri);
      window.location.href = authorizeUrl;
    } catch (e: any) {
      toast.error(e.message ?? 'Could not start Meta connection');
    }
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
      const ok = res.results.filter((r) => r.ok).length;
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length) toast.warning(`Synced ${ok} source(s). Issues: ${failed.map((f) => `${f.platform}: ${f.error}`).join('; ')}`);
      else toast.success(`Synced ${ok} source(s), ${res.aggregated} day(s) aggregated`);
    } catch (e: any) {
      toast.error(e.message ?? 'Sync failed');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Plug className="w-4 h-4" /> Integrations</CardTitle>
        <Button size="sm" variant="outline" className="gap-2" onClick={handleSync} disabled={runSync.isPending}>
          <RefreshCw className={`w-3.5 h-3.5 ${runSync.isPending ? 'animate-spin' : ''}`} /> Sync now
        </Button>
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
              {st?.last_sync_status && st.last_sync_status.startsWith('error') && (
                <p className="text-[11px] text-destructive">{st.last_sync_status}</p>
              )}
              {p.id === 'meta' && (
                <div className="space-y-2">
                  <Button
                    size="sm"
                    className="gap-2 bg-[#1877F2] hover:bg-[#1877F2]/90 text-white"
                    onClick={handleConnectMeta}
                    disabled={metaInit.isPending}
                  >
                    <Facebook className="w-3.5 h-3.5" />
                    {connected ? 'Reconnect with Facebook' : 'Connect with Facebook'}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Recommended: sign in with Facebook to pick an ad account automatically. Or paste a token manually below.
                  </p>
                </div>
              )}
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
    </Card>
  );
}
