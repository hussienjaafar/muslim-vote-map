import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type Platform = 'meta' | 'switchboard' | 'actblue';

export type CredentialStatus = {
  platform: Platform;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  updated_at: string | null;
};

/** Reads connection status for an org's integrations (no secret values are returned). */
export function useOrgCredentials(orgId: string | undefined) {
  return useQuery<CredentialStatus[]>({
    queryKey: ['org-credentials', orgId],
    enabled: !!orgId,
    // While a source is still processing in the background, poll so the badge updates on its own.
    refetchInterval: (query) => {
      const rows = query.state.data;
      const processing = rows?.some((c) => c.last_sync_status?.startsWith('processing'));
      return processing ? 15000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_api_credentials')
        .select('platform, is_active, last_sync_at, last_sync_status, updated_at')
        .eq('organization_id', orgId);
      if (error) throw error;
      return (data ?? []) as CredentialStatus[];
    },
  });
}

export function useSaveCredentials(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { platform: Platform; credentials: Record<string, string> }) => {
      const { data, error } = await supabase.functions.invoke('save-credentials', {
        body: { organizationId: orgId, platform: vars.platform, action: 'save', credentials: vars.credentials },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-credentials', orgId] }),
  });
}

export function useDisconnectCredentials(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (platform: Platform) => {
      const { data, error } = await supabase.functions.invoke('save-credentials', {
        body: { organizationId: orgId, platform, action: 'disconnect' },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-credentials', orgId] }),
  });
}

export type MetaAdAccount = { id: string; account_id: string; name: string; currency?: string };

/** Starts the Meta OAuth flow and returns the Facebook authorize URL. */
export function useMetaOAuthInit(orgId: string | undefined) {
  return useMutation({
    mutationFn: async (redirectUri: string) => {
      const { data, error } = await supabase.functions.invoke('meta-oauth-init', {
        body: { organizationId: orgId, redirectUri },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { authorizeUrl: string };
    },
  });
}

/** Exchanges the OAuth code, stores the encrypted token, and returns available ad accounts. */
export function useMetaOAuthCallback(orgId: string | undefined) {
  return useMutation({
    mutationFn: async (vars: { code: string; state: string }) => {
      const { data, error } = await supabase.functions.invoke('meta-oauth-callback', {
        body: vars,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { adAccounts: MetaAdAccount[]; metaUser: { id: string | null; name: string | null } };
    },
  });
}

/** Finalizes the Meta connection by selecting an ad account. */
export function useMetaSaveConnection(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (adAccountId: string) => {
      const { data, error } = await supabase.functions.invoke('meta-save-connection', {
        body: { organizationId: orgId, adAccountId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { adAccount: { id: string; name: string } };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-credentials', orgId] }),
  });
}

export function useRunSync(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (arg?: number | { full?: boolean; sinceDays?: number }) => {
      const opts = typeof arg === 'number' ? { sinceDays: arg } : (arg ?? {});
      const body: Record<string, unknown> = { organizationId: orgId };
      if (opts.full) body.full = true;
      else body.sinceDays = typeof opts.sinceDays === 'number' ? opts.sinceDays : 30;
      const { data, error } = await supabase.functions.invoke('sync-org', { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { results: { platform: string; ok: boolean; rows: number; error?: string; queued?: boolean }[]; aggregated: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-credentials', orgId] });
      qc.invalidateQueries({ queryKey: ['fundraising-summary'] });
      qc.invalidateQueries({ queryKey: ['recent-donations'] });
      qc.invalidateQueries({ queryKey: ['actblue-jobs', orgId] });
    },
  });
}

export type ActblueJob = {
  id: string;
  csv_id: string;
  status: 'processing' | 'complete' | 'error';
  since_days: number;
  attempts: number;
  rows_imported: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/** Reads recent ActBlue background export jobs for an org. Polls while any job is still processing. */
export function useActblueJobs(orgId: string | undefined) {
  return useQuery<ActblueJob[]>({
    queryKey: ['actblue-jobs', orgId],
    enabled: !!orgId,
    refetchInterval: (query) => {
      const rows = query.state.data;
      return rows?.some((j) => j.status === 'processing') ? 15000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('actblue_csv_jobs')
        .select('id, csv_id, status, since_days, attempts, rows_imported, last_error, created_at, updated_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ActblueJob[];
    },
  });
}

/** Triggers the background worker immediately instead of waiting for the cron schedule. */
export function useRunActblueWorker(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('process-actblue-jobs', { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { ok: boolean; processed: number; summary: { result: string }[] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['actblue-jobs', orgId] });
      qc.invalidateQueries({ queryKey: ['org-credentials', orgId] });
      qc.invalidateQueries({ queryKey: ['fundraising-summary'] });
      qc.invalidateQueries({ queryKey: ['recent-donations'] });
    },
  });
}
