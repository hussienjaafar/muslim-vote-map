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
    mutationFn: async (sinceDays: number | void) => {
      const days = typeof sinceDays === 'number' ? sinceDays : 30;
      const { data, error } = await supabase.functions.invoke('sync-org', {
        body: { organizationId: orgId, sinceDays: days },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { results: { platform: string; ok: boolean; rows: number; error?: string }[]; aggregated: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-credentials', orgId] });
      qc.invalidateQueries({ queryKey: ['fundraising-summary'] });
      qc.invalidateQueries({ queryKey: ['recent-donations'] });
    },
  });
}
