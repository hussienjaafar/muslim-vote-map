import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RefcodeMapping = {
  id: string;
  organization_id: string;
  pattern: string | null;
  refcode: string | null;
  match_type: string;
  channel: string | null;
  campaign_label: string | null;
  priority: number;
  source: string;
  created_at: string;
};

export type FormOverride = {
  id: string;
  organization_id: string;
  contribution_form: string;
  attributed_channel: string;
  created_at: string;
};

export const ATTRIBUTION_CHANNELS = ['meta', 'sms', 'email', 'organic', 'other'] as const;
export const MATCH_TYPES = ['exact', 'prefix', 'contains'] as const;

export function useRefcodeMappings(orgId: string | null) {
  return useQuery<RefcodeMapping[]>({
    queryKey: ['refcode-mappings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_attribution')
        .select('id, organization_id, pattern, refcode, match_type, channel, campaign_label, priority, source, created_at')
        .eq('organization_id', orgId!)
        .order('priority', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as RefcodeMapping[];
    },
  });
}

export function useUpsertMapping(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: Partial<RefcodeMapping> & { id?: string }) => {
      const row = {
        organization_id: orgId,
        pattern: m.pattern ?? null,
        match_type: m.match_type ?? 'exact',
        channel: m.channel ?? null,
        campaign_label: m.campaign_label ?? null,
        priority: m.priority ?? 100,
        ...(m.id ? { id: m.id } : {}),
      };
      const { error } = await supabase.from('campaign_attribution').upsert(row);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['refcode-mappings', orgId] }),
  });
}

export function useDeleteMapping(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('campaign_attribution').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['refcode-mappings', orgId] }),
  });
}

export function useFormOverrides(orgId: string | null) {
  return useQuery<FormOverride[]>({
    queryKey: ['form-overrides', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_form_channel_overrides')
        .select('id, organization_id, contribution_form, attributed_channel, created_at')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as FormOverride[];
    },
  });
}

export function useUpsertOverride(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: Partial<FormOverride> & { id?: string }) => {
      const row = {
        organization_id: orgId,
        contribution_form: o.contribution_form ?? '',
        attributed_channel: o.attributed_channel ?? 'other',
        ...(o.id ? { id: o.id } : {}),
      };
      const { error } = await supabase.from('org_form_channel_overrides').upsert(row);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['form-overrides', orgId] }),
  });
}

export function useDeleteOverride(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('org_form_channel_overrides').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['form-overrides', orgId] }),
  });
}

export type MethodBreakdown = { method: string; channel: string; count: number; raised: number };

export function useAttributionStatus(orgId: string | null) {
  return useQuery<MethodBreakdown[]>({
    queryKey: ['attribution-status', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // Reads via RLS — admins/org members can read their org's transactions.
      const { data, error } = await supabase
        .from('actblue_transactions')
        .select('attributed_channel, attribution_method, amount')
        .eq('organization_id', orgId!)
        .eq('transaction_type', 'donation')
        .limit(50000);
      if (error) throw new Error(error.message);
      const map = new Map<string, MethodBreakdown>();
      for (const r of (data ?? []) as any[]) {
        const channel = r.attributed_channel ?? 'other';
        const method = r.attribution_method ?? 'none';
        const key = `${method}|${channel}`;
        const cur = map.get(key) ?? { method, channel, count: 0, raised: 0 };
        cur.count += 1;
        cur.raised += Number(r.amount) || 0;
        map.set(key, cur);
      }
      return [...map.values()].sort((a, b) => b.raised - a.raised);
    },
  });
}

export function useRecomputeAttribution(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('recompute_attribution', { _org_id: orgId, _since: null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attribution-status', orgId] });
      qc.invalidateQueries({ queryKey: ['channel-breakdown', orgId] });
    },
  });
}
