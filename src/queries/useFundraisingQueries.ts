import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type DailyMetric = {
  date: string;
  total_ad_spend: number;
  total_sms_cost: number;
  total_funds_raised: number;
  total_donations: number;
  new_donors: number;
  roi_percentage: number | null;
  meta_impressions: number;
  meta_clicks: number;
  sms_conversions: number;
};

export type RecentDonation = {
  id: string;
  donor_name: string | null;
  amount: number;
  is_recurring: boolean;
  transaction_date: string;
  refcode: string | null;
};

export type FundraisingSummary = {
  fallback: boolean;
  error: string | null;
  daily: DailyMetric[];
  totals: {
    fundsRaised: number;
    adSpend: number;
    smsCost: number;
    donations: number;
    newDonors: number;
    roi: number | null;
  };
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Aggregated daily fundraising metrics for an org over a window of days.
 * Resolves with { fallback: true, error } on failure so the UI never crashes.
 */
export function useFundraisingSummary(orgId: string | null, days: number) {
  return useQuery<FundraisingSummary>({
    queryKey: ['fundraising-summary', orgId, days],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const empty: FundraisingSummary = {
        fallback: false,
        error: null,
        daily: [],
        totals: { fundsRaised: 0, adSpend: 0, smsCost: 0, donations: 0, newDonors: 0, roi: null },
      };
      if (!orgId) return empty;

      const { data, error } = await supabase
        .from('daily_aggregated_metrics')
        .select(
          'date, total_ad_spend, total_sms_cost, total_funds_raised, total_donations, new_donors, roi_percentage, meta_impressions, meta_clicks, sms_conversions'
        )
        .eq('organization_id', orgId)
        .gte('date', isoDaysAgo(days))
        .order('date', { ascending: true });

      if (error) {
        return { ...empty, fallback: true, error: error.message };
      }

      const daily: DailyMetric[] = (data ?? []).map((r: any) => ({
        date: r.date,
        total_ad_spend: Number(r.total_ad_spend) || 0,
        total_sms_cost: Number(r.total_sms_cost) || 0,
        total_funds_raised: Number(r.total_funds_raised) || 0,
        total_donations: Number(r.total_donations) || 0,
        new_donors: Number(r.new_donors) || 0,
        roi_percentage: r.roi_percentage == null ? null : Number(r.roi_percentage),
        meta_impressions: Number(r.meta_impressions) || 0,
        meta_clicks: Number(r.meta_clicks) || 0,
        sms_conversions: Number(r.sms_conversions) || 0,
      }));

      const totals = daily.reduce(
        (acc, d) => {
          acc.fundsRaised += d.total_funds_raised;
          acc.adSpend += d.total_ad_spend;
          acc.smsCost += d.total_sms_cost;
          acc.donations += d.total_donations;
          acc.newDonors += d.new_donors;
          return acc;
        },
        { fundsRaised: 0, adSpend: 0, smsCost: 0, donations: 0, newDonors: 0, roi: null as number | null }
      );
      const totalSpend = totals.adSpend + totals.smsCost;
      totals.roi = totalSpend > 0 ? ((totals.fundsRaised - totalSpend) / totalSpend) * 100 : null;

      return { fallback: false, error: null, daily, totals };
    },
  });
}

/** Most recent ActBlue donations for an org. Never throws. */
export function useRecentDonations(orgId: string | null, limit = 8) {
  return useQuery<{ rows: RecentDonation[]; fallback: boolean; error: string | null }>({
    queryKey: ['recent-donations', orgId, limit],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!orgId) return { rows: [], fallback: false, error: null };
      const { data, error } = await supabase
        .from('actblue_transactions')
        .select('id, donor_name, amount, is_recurring, transaction_date, refcode')
        .eq('organization_id', orgId)
        .order('transaction_date', { ascending: false })
        .limit(limit);

      if (error) return { rows: [], fallback: true, error: error.message };

      const rows: RecentDonation[] = (data ?? []).map((r: any) => ({
        id: r.id,
        donor_name: r.donor_name,
        amount: Number(r.amount) || 0,
        is_recurring: !!r.is_recurring,
        transaction_date: r.transaction_date,
        refcode: r.refcode,
      }));
      return { rows, fallback: false, error: null };
    },
  });
}
