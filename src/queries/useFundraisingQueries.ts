import { useQuery, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
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

export type ChannelRow = {
  channel: string;
  donations: number;
  donors: number;
  raised: number;
  spend: number;
  /** raised ÷ spend × 100, or null when no spend is tracked for the channel */
  roi: number | null;
  /** share of total raised, 0-100 */
  share: number;
  confidence: string | null;
};

export type ChannelBreakdown = {
  channels: ChannelRow[];
  totalRaised: number;
};

const CHANNEL_LABELS: Record<string, string> = {
  meta: 'Meta',
  sms: 'SMS',
  email: 'Email',
  organic: 'Organic',
  other: 'Other',
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

export type SmsBroadcast = {
  id: string;
  campaignName: string;
  date: string;
  /** Full send timestamp (UTC ISO), null for broadcasts synced before time capture */
  sentAt: string | null;
  refcode: string | null;
  cost: number;
  messagesSent: number;
  messagesDelivered: number;
  messagesFailed: number;
  optOuts: number;
  clicks: number;
  conversions: number;
  raised: number;
  donations: number;
  donors: number;
  /** Raised ÷ cost (return multiple), null when no cost tracked */
  roas: number | null;
  /** Dollars raised per 1,000 delivered messages */
  dollarsPer1kDelivered: number | null;
  /** clicks ÷ delivered, 0-1 */
  clickRate: number | null;
  /** donations ÷ clicks, 0-1 */
  conversionRate: number | null;
  /** cost ÷ donations */
  costPerDonation: number | null;
  /** delivered ÷ sent, 0-1 */
  deliveryRate: number | null;
  /** failed ÷ sent, 0-1 */
  failureRate: number | null;
  /** opt-outs ÷ delivered, 0-1 */
  optOutRate: number | null;
  /** raised ÷ donations */
  avgGift: number | null;
  /** Whether the broadcast's link reaches ActBlue; false → excluded from ROAS */
  hasActBlueLink: boolean;
};

function mapBroadcast(r: any): SmsBroadcast {
  const cost = Number(r.cost) || 0;
  const sent = Number(r.messages_sent) || 0;
  const delivered = Number(r.messages_delivered) || 0;
  const failed = Number(r.messages_failed) || 0;
  const optOuts = Number(r.opt_outs) || 0;
  const clicks = Number(r.clicks) || 0;
  const raised = Number(r.raised) || 0;
  const donations = Number(r.donations) || 0;
  const hasActBlueLink = r.has_actblue_link !== false;
  return {
    id: r.id,
    campaignName: r.campaign_name ?? '—',
    date: r.date,
    sentAt: r.sent_at ?? null,
    refcode: r.refcode ?? null,
    cost,
    messagesSent: sent,
    messagesDelivered: delivered,
    messagesFailed: failed,
    optOuts,
    clicks,
    conversions: Number(r.conversions) || 0,
    raised,
    donations,
    donors: Number(r.donors) || 0,
    roas: cost > 0 ? raised / cost : null,
    dollarsPer1kDelivered: delivered > 0 ? (raised / delivered) * 1000 : null,
    clickRate: delivered > 0 ? clicks / delivered : null,
    conversionRate: clicks > 0 ? donations / clicks : null,
    costPerDonation: donations > 0 ? cost / donations : null,
    deliveryRate: sent > 0 ? delivered / sent : null,
    failureRate: sent > 0 ? failed / sent : null,
    optOutRate: delivered > 0 ? optOuts / delivered : null,
    avgGift: donations > 0 ? raised / donations : null,
  };
}

export type SmsBroadcastDonation = {
  id: string;
  donorName: string | null;
  amount: number;
  isRecurring: boolean;
  transactionDate: string;
  refcode: string | null;
};

/**
 * Per-broadcast SMS performance for an org over an ET date range. Returns only
 * broadcasts that actually delivered messages, with attributed donation revenue
 * and derived efficiency metrics. Throws on error so the last good data is kept.
 */
export function useSmsBroadcastRoi(orgId: string | null, range: ResolvedRange) {
  return useQuery<SmsBroadcast[]>({
    queryKey: ['sms-broadcast-roi', orgId, range.start, range.end],
    enabled: !!orgId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 2,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.rpc('sms_broadcast_roi', {
        _org_id: orgId,
        _start: range.start,
        _end: range.end,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map(mapBroadcast);
    },
  });
}

/** Full metrics for a single SMS broadcast. */
export function useSmsBroadcastDetail(orgId: string | null, broadcastId: string | null) {
  return useQuery<SmsBroadcast | null>({
    queryKey: ['sms-broadcast-detail', orgId, broadcastId],
    enabled: !!orgId && !!broadcastId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 2,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!orgId || !broadcastId) return null;
      const { data, error } = await supabase.rpc('sms_broadcast_detail', {
        _org_id: orgId,
        _broadcast_id: broadcastId,
      });
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0];
      return row ? mapBroadcast(row) : null;
    },
  });
}

/** Individual donations attributed to a single SMS broadcast. */
export function useSmsBroadcastDonations(orgId: string | null, broadcastId: string | null) {
  return useQuery<SmsBroadcastDonation[]>({
    queryKey: ['sms-broadcast-donations', orgId, broadcastId],
    enabled: !!orgId && !!broadcastId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 2,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!orgId || !broadcastId) return [];
      const { data, error } = await supabase.rpc('sms_broadcast_donations', {
        _org_id: orgId,
        _broadcast_id: broadcastId,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        donorName: r.donor_name ?? null,
        amount: Number(r.amount) || 0,
        isRecurring: !!r.is_recurring,
        transactionDate: r.transaction_date,
        refcode: r.refcode ?? null,
      }));
    },
  });
}

/**
 * Per-channel raised / donors / ROI for an org over an ET date range.
 * Reads the pre-computed `attributed_channel` via the org_channel_breakdown RPC
 * and joins Meta spend + SMS cost to compute ROI for the paid channels.
 */
export function useChannelBreakdown(orgId: string | null, range: ResolvedRange) {
  return useQuery<ChannelBreakdown>({
    queryKey: ['channel-breakdown', orgId, range.start, range.end],
    enabled: !!orgId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 2,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!orgId) return { channels: [], totalRaised: 0 };

      const { data, error } = await supabase.rpc('org_channel_breakdown', {
        _org_id: orgId,
        _start: range.start,
        _end: range.end,
      });
      if (error) throw new Error(error.message);

      const payload = (data ?? {}) as {
        channels?: Array<{ channel: string; donations: number; donors: number; raised: number; confidence: string | null }>;
        meta_spend?: number;
        sms_cost?: number;
      };
      const metaSpend = Number(payload.meta_spend) || 0;
      const smsCost = Number(payload.sms_cost) || 0;
      const rows = payload.channels ?? [];
      const totalRaised = rows.reduce((acc, r) => acc + (Number(r.raised) || 0), 0);

      const channels: ChannelRow[] = rows.map((r) => {
        const raised = Number(r.raised) || 0;
        const spend = r.channel === 'meta' ? metaSpend : r.channel === 'sms' ? smsCost : 0;
        const roi = spend > 0 ? ((raised - spend) / spend) * 100 : null;
        return {
          channel: r.channel,
          donations: Number(r.donations) || 0,
          donors: Number(r.donors) || 0,
          raised,
          spend,
          roi,
          share: totalRaised > 0 ? (raised / totalRaised) * 100 : 0,
          confidence: r.confidence ?? null,
        };
      });

      return { channels, totalRaised };
    },
  });
}

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
    retry: 2,
    placeholderData: keepPreviousData,
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
        // Throw so React Query keeps the last good cached data instead of
        // overwriting it with zeros (which made the dashboard blank on any
        // transient failure during polling/refresh).
        throw new Error(error.message);
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
    retry: 2,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const buckets: HourlyMetric[] = Array.from({ length: 24 }, (_, hour) => ({ hour, donations: 0, funds: 0, adSpend: 0 }));
      if (!orgId || !day) return buckets;

      const [donationRes, spendRes] = await Promise.all([
        supabase.rpc('org_hourly_rollup', { _org_id: orgId, _day: day }),
        supabase.rpc('meta_hourly_rollup', { _org_id: orgId, _day: day }),
      ]);

      // Throw on error so React Query keeps the last good data rather than
      // replacing it with empty zero buckets.
      if (donationRes.error) throw new Error(donationRes.error.message);
      if (spendRes.error) throw new Error(spendRes.error.message);

      for (const r of (donationRes.data ?? []) as any[]) {
        const h = Number(r.hour);
        if (h >= 0 && h < 24) {
          buckets[h].donations = Number(r.donations) || 0;
          buckets[h].funds = Number(r.funds) || 0;
        }
      }

      for (const r of (spendRes.data ?? []) as any[]) {
        const h = Number(r.hour);
        if (h >= 0 && h < 24) {
          buckets[h].adSpend = Number(r.spend) || 0;
        }
      }

      return buckets;
    },
  });
}

const DONATIONS_PAGE_SIZE = 25;

/**
 * Paginated ActBlue donations for an org within the selected ET range
 * (infinite scroll). Throws on error so React Query keeps the last good page.
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
    retry: 2,
    placeholderData: keepPreviousData,
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

      if (error) throw new Error(error.message);

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
