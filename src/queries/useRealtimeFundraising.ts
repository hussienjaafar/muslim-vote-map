import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribe to live changes for an org's fundraising data so the dashboard
 * updates instantly (push) instead of waiting for the next poll. Listens to:
 *  - actblue_transactions     -> Recent Donations + KPIs (donations/funds)
 *  - daily_aggregated_metrics -> Fundraising Intelligence chart/KPIs
 *  - meta_ad_metrics          -> Ad Spend KPI (refreshed via summary)
 *  - sms_campaign_metrics     -> SMS Cost KPI (refreshed via summary)
 *
 * All four tables are in the supabase_realtime publication with REPLICA
 * IDENTITY FULL, and RLS scopes rows to orgs the user can read.
 */
export function useRealtimeFundraising(orgId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orgId) return;

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ['recent-donations', orgId] });
      queryClient.invalidateQueries({ queryKey: ['fundraising-summary', orgId] });
    };
    const invalidateSummary = () => {
      queryClient.invalidateQueries({ queryKey: ['fundraising-summary', orgId] });
    };

    const filter = `organization_id=eq.${orgId}`;
    const channel = supabase
      .channel(`fundraising-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actblue_transactions', filter }, invalidateAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_aggregated_metrics', filter }, invalidateSummary)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meta_ad_metrics', filter }, invalidateSummary)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_campaign_metrics', filter }, invalidateSummary)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);
}
