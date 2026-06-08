import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribe to live changes for an org's donation data so the dashboard updates
 * instantly (push) instead of waiting for the next poll. Listens to:
 *  - actblue_transactions  -> refresh Recent Donations widget
 *  - daily_aggregated_metrics -> refresh Fundraising Intelligence chart/KPIs
 *
 * Both tables are in the supabase_realtime publication with REPLICA IDENTITY FULL,
 * and RLS scopes rows to orgs the user can read.
 */
export function useRealtimeFundraising(orgId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orgId) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['recent-donations', orgId] });
      queryClient.invalidateQueries({ queryKey: ['fundraising-summary', orgId] });
    };

    const channel = supabase
      .channel(`fundraising-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'actblue_transactions',
          filter: `organization_id=eq.${orgId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_aggregated_metrics',
          filter: `organization_id=eq.${orgId}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);
}
