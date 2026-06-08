import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/contexts/OrgContext';
import { useFundraisingSummary, useRecentDonations, useHourlyFundraising } from '@/queries/useFundraisingQueries';
import { useRealtimeFundraising } from '@/queries/useRealtimeFundraising';
import { OrgSwitcher } from '@/components/org/OrgSwitcher';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { type RangeSelection, presetSelection, resolveRange } from '@/lib/dateRanges';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from 'recharts';
import {
  DollarSign, TrendingUp, MessageSquare, Megaphone, Users, Repeat,
  Loader2, Building2, ArrowLeft, Inbox, RefreshCw,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

function fmtHour(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}


function fmtCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}
// Render a UTC instant in Eastern Time so timestamps stay consistent with the
// Eastern-Time daily bucketing used across the dashboard.
function fmtEastern(iso: string): string {
  const d = parseISO(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }) + ' ET';
}



export default function Dashboard() {
  const { activeOrg, organizations, isLoading: orgLoading } = useOrg();
  const [selection, setSelection] = useState<RangeSelection>(() => presetSelection('7d'));
  const queryClient = useQueryClient();

  const range = useMemo(() => resolveRange(selection), [selection]);
  const isHourly = range.granularity === 'hour';

  const orgId = activeOrg?.id ?? null;
  useRealtimeFundraising(orgId);
  const { data: summary, isLoading, isFetching: summaryFetching, dataUpdatedAt } = useFundraisingSummary(orgId, range);
  const { data: hourly, isFetching: hourlyFetching } = useHourlyFundraising(orgId, range.start, isHourly);
  const {
    data: donationsData,
    isFetching: donationsFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useRecentDonations(orgId, range);
  const refreshing = summaryFetching || donationsFetching || hourlyFetching;

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric', minute: '2-digit', second: '2-digit',
      }) + ' ET'
    : null;

  const donationRows = useMemo(
    () => donationsData?.pages.flat() ?? [],
    [donationsData]
  );

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['fundraising-summary', orgId] });
    queryClient.invalidateQueries({ queryKey: ['fundraising-hourly', orgId] });
    queryClient.invalidateQueries({ queryKey: ['recent-donations', orgId] });
  };

  if (orgLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeOrg) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="surgical-glass p-10 max-w-md text-center space-y-4">
          <Building2 className="w-10 h-10 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-display font-bold text-foreground">No organization yet</h1>
          <p className="text-sm text-muted-foreground">
            You're not a member of any client organization. Once you're added to one, your
            fundraising intelligence dashboard will appear here.
          </p>
          <Link to="/home" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
        </div>
      </div>
    );
  }

  const totals = summary?.totals;
  const kpis = [
    { key: 'raised', label: 'Funds Raised', icon: DollarSign, value: totals ? fmtCurrency(totals.fundsRaised) : '—', accent: 'text-emerald-400' },
    { key: 'donations', label: 'Donations', icon: Users, value: totals ? fmtCompact(totals.donations) : '—', accent: 'text-cyan-400' },
    { key: 'newdonors', label: 'New Donors', icon: Repeat, value: totals ? fmtCompact(totals.newDonors) : '—', accent: 'text-violet-400' },
    { key: 'adspend', label: 'Ad Spend', icon: Megaphone, value: totals ? fmtCurrency(totals.adSpend) : '—', accent: 'text-amber-400' },
    { key: 'sms', label: 'SMS Cost', icon: MessageSquare, value: totals ? fmtCurrency(totals.smsCost) : '—', accent: 'text-sky-400' },
    { key: 'roi', label: 'ROI', icon: TrendingUp, value: totals?.roi != null ? `${totals.roi.toFixed(0)}%` : '—', accent: 'text-emerald-400' },
  ];

  const dailyChartData = (summary?.daily ?? []).map((d) => ({
    date: d.date,
    raised: d.total_funds_raised,
    adSpend: d.total_ad_spend,
    smsCost: d.total_sms_cost,
  }));
  const hourlyChartData = (hourly ?? []).map((h) => ({
    hour: h.hour,
    raised: h.funds,
    adSpend: h.adSpend,
  }));
  const hasData = isHourly
    ? hourlyChartData.some((d) => d.raised > 0 || d.adSpend > 0)
    : dailyChartData.some((d) => d.raised > 0 || d.adSpend > 0 || d.smsCost > 0);


  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <Link to="/home" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Home
            </Link>
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight">
              Fundraising Intelligence
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeOrg.name} · ActBlue, Meta Ads &amp; SMS performance
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh data"
                className="inline-flex items-center gap-1.5 px-3 h-9 text-xs font-bold rounded-md border border-border bg-card/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
              </button>
              {lastUpdated && (
                <span className="mt-1 text-[10px] text-muted-foreground/70 tabular-nums whitespace-nowrap">
                  {refreshing ? 'Updating…' : `Updated ${lastUpdated}`}
                </span>
              )}
            </div>
            <OrgSwitcher />
            <DateRangePicker value={selection} onChange={setSelection} />

          </div>
        </header>

        {/* KPI grid */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-12">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading metrics...
          </div>
        ) : (
          <section className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {kpis.map((k) => (
              <div key={k.key} className="surgical-glass p-5 group">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-label-xs text-muted-foreground">{k.label}</span>
                  <k.icon className={`w-[18px] h-[18px] opacity-60 group-hover:opacity-100 transition-opacity ${k.accent}`} />
                </div>
                <div className="text-2xl sm:text-3xl font-display font-bold text-foreground tabular-nums">
                  {k.value}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Chart */}
        <section className="surgical-glass p-4 sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg sm:text-xl font-display font-bold text-foreground">
              {isHourly ? 'Funds Raised vs. Ad Spend by Hour' : 'Funds Raised vs. Spend'}
            </h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
              {range.label}
              {isHourly ? ' · Meta ad spend in advertiser timezone' : ''}
            </p>
          </div>
          {!hasData ? (
            <div className="h-[260px] flex flex-col items-center justify-center text-center gap-2">
              <Inbox className="w-8 h-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No fundraising data for this period yet.</p>
              <p className="text-xs text-muted-foreground/70">
                Once campaign data syncs in, trends will appear here.
              </p>
            </div>
          ) : (
            <div className="h-[260px] sm:h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={isHourly ? hourlyChartData : dailyChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRaised" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gSms" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey={isHourly ? 'hour' : 'date'}
                    tickFormatter={(v) => (isHourly ? fmtHour(Number(v)) : format(parseISO(String(v)), 'MMM d'))}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={isHourly ? 12 : 24}
                  />
                  <YAxis
                    tickFormatter={(v) => fmtCompact(Number(v))}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <RTooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => (isHourly ? `${fmtHour(Number(v))} ET` : format(parseISO(String(v)), 'PP'))}
                    formatter={(value: number, name: string) => [fmtCurrency(Number(value)), name === 'raised' ? 'Raised' : 'Spend']}
                  />
                  <Area type="monotone" dataKey="raised" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#gRaised)" />
                  <Area type="monotone" dataKey="spend" stroke="#fbbf24" strokeWidth={2.5} fill="url(#gSpend)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

          )}
        </section>

        {/* Recent donations */}
        <section className="surgical-glass p-4 sm:p-8">
          <h2 className="text-lg sm:text-xl font-display font-bold text-foreground mb-6">Recent Donations</h2>
          {!donationRows.length ? (
            <div className="py-10 text-center">
              <Inbox className="w-7 h-7 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No donations recorded yet.</p>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto pr-1 -mr-1">
              <div className="divide-y divide-border/60">
                {donationRows.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-3 gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{d.donor_name || 'Anonymous donor'}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtEastern(d.transaction_date)}
                      </p>
                      {(d.form_name || d.refcode) && (
                        <p className="text-[11px] text-muted-foreground/70 truncate">
                          {[d.form_name, d.refcode].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {d.is_recurring && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-violet-400">
                          <Repeat className="w-3 h-3" /> Recurring
                        </span>
                      )}
                      <span className="text-sm font-bold text-emerald-400 tabular-nums">
                        ${d.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div ref={loadMoreRef} className="py-4 flex items-center justify-center">
                {isFetchingNextPage ? (
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading more…
                  </span>
                ) : !hasNextPage ? (
                  <span className="text-[11px] text-muted-foreground/60">End of donations</span>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
