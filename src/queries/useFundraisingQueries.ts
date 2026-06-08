import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { etDayStartUtc, etDayEndUtc, type ResolvedRange } from '@/lib/dateRanges';

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

export type HourlyMetric = {
  /** 0-23 ET hour */
  hour: number;
  donations: number;
  funds: number;
  /** Meta ad spend for the hour (advertiser timezone) */
  adSpend: number;
};

export type RecentDonation = {
  id: string;
  donor_name: string | null;
  amount: number;
  is_recurring: boolean;
  transaction_date: string;
  refcode: string | null;
  form_name: string | null;
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

/**
 * Aggregated daily fundraising metrics for an org over an inclusive ET date range.
 * Resolves with { fallback: true, error } on failure so the UI never crashes.
 */
export function useFundraisingSummary(orgId: string | null, range: ResolvedRange) {
  return useQuery<FundraisingSummary>({
    queryKey: ['fundraising-summary', orgId, range.start, range.end],
    enabled: !!orgId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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
        .gte('date', range.start)
        .lte('date', range.end)
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

/**
 * Hourly donation rollup (ET) for a single day — powers the Today/Yesterday chart.
 * Returns a zero-filled 24-bucket array. Only enabled for single-day views.
 */
export function useHourlyFundraising(orgId: string | null, day: string | null, enabled: boolean) {
  return useQuery<HourlyMetric[]>({
    queryKey: ['fundraising-hourly', orgId, day],
    enabled: !!orgId && !!day && enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      const buckets: HourlyMetric[] = Array.from({ length: 24 }, (_, hour) => ({ hour, donations: 0, funds: 0 }));
      if (!orgId || !day) return buckets;

      const { data, error } = await supabase.rpc('org_hourly_rollup', { _org_id: orgId, _day: day });
      if (error) return buckets;

      for (const r of (data ?? []) as any[]) {
        const h = Number(r.hour);
        if (h >= 0 && h < 24) {
          buckets[h].donations = Number(r.donations) || 0;
          buckets[h].funds = Number(r.funds) || 0;
        }
      }
      return buckets;
    },
  });
}

const DONATIONS_PAGE_SIZE = 25;

/**
 * Paginated ActBlue donations for an org within the selected ET range
 * (infinite scroll). Never throws.
 */
export function useRecentDonations(
  orgId: string | null,
  range: ResolvedRange,
  pageSize = DONATIONS_PAGE_SIZE
) {
  const startUtc = etDayStartUtc(range.start);
  const endUtc = etDayEndUtc(range.end);

  return useInfiniteQuery({
    queryKey: ['recent-donations', orgId, range.start, range.end, pageSize],
    enabled: !!orgId,
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    initialPageParam: 0,
    getNextPageParam: (lastPage: RecentDonation[] | undefined, allPages) =>
      (lastPage?.length ?? 0) < pageSize ? undefined : allPages.length,
    queryFn: async ({ pageParam }): Promise<RecentDonation[]> => {
      if (!orgId) return [];
      const from = (pageParam as number) * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('actblue_transactions')
        .select('id, donor_name, amount, is_recurring, transaction_date, refcode, form_name')
        .eq('organization_id', orgId)
        .gte('transaction_date', startUtc)
        .lt('transaction_date', endUtc)
        .order('transaction_date', { ascending: false })
        .range(from, to);

      if (error) return [];

      return (data ?? []).map((r: any) => ({
        id: r.id,
        donor_name: r.donor_name,
        amount: Number(r.amount) || 0,
        is_recurring: !!r.is_recurring,
        transaction_date: r.transaction_date,
        refcode: r.refcode,
        form_name: r.form_name ?? null,
      }));
    },
  });
}
