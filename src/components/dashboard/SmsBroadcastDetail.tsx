import { ArrowLeft, Inbox, Loader2, MessageSquare, Repeat, TrendingUp, TrendingDown } from 'lucide-react';
import { parseISO } from 'date-fns';
import { useSmsBroadcastDetail, useSmsBroadcastDonations, type SmsBroadcast } from '@/queries/useFundraisingQueries';
import { fmtSentEastern } from './SmsBroadcastTable';

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtCurrency2(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number | null): string {
  return n == null ? '—' : `${(n * 100).toFixed(1)}%`;
}
function fmtNum(n: number): string {
  return n.toLocaleString();
}
function fmtDonationTime(iso: string): string {
  const d = parseISO(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' ET';
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="surgical-glass p-4">
      <div className="text-label-xs text-muted-foreground mb-1.5">{label}</div>
      <div className={`text-xl font-display font-bold tabular-nums ${accent ?? 'text-foreground'}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-display font-bold text-foreground uppercase tracking-wide">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
    </section>
  );
}

export function SmsBroadcastDetail({
  orgId, broadcastId, onBack,
}: {
  orgId: string | null;
  broadcastId: string;
  onBack: () => void;
}) {
  const { data: b, isLoading, isError } = useSmsBroadcastDetail(orgId, broadcastId);
  const { data: donations } = useSmsBroadcastDonations(orgId, broadcastId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading broadcast…
      </div>
    );
  }

  if (isError || !b) {
    return (
      <div className="py-16 text-center space-y-4">
        <Inbox className="w-8 h-8 text-muted-foreground/50 mx-auto" />
        <p className="text-sm text-muted-foreground">Couldn't load this broadcast.</p>
        <button onClick={onBack} className="text-sm text-primary hover:underline inline-flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back to broadcasts
        </button>
      </div>
    );
  }

  const broadcast = b as SmsBroadcast;
  const roasUp = broadcast.roas != null && broadcast.roas >= 1;

  return (
    <div className="space-y-8">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> All broadcasts
      </button>

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground tracking-tight flex items-center gap-2.5">
            <MessageSquare className="w-6 h-6 text-sky-400 shrink-0" />
            <span className="truncate">{broadcast.campaignName}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Sent {fmtSentEastern(broadcast)}
            {broadcast.refcode && <> · refcode <span className="font-mono text-foreground/80">{broadcast.refcode}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-6 shrink-0">
          <div className="text-right">
            <div className="text-2xl font-display font-bold text-emerald-400 tabular-nums">{fmtCurrency(broadcast.raised)}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Raised</div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-display font-bold tabular-nums inline-flex items-center gap-1 ${broadcast.roas == null ? 'text-muted-foreground' : roasUp ? 'text-emerald-400' : 'text-rose-400'}`}>
              {broadcast.roas != null && (roasUp ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />)}
              {broadcast.roas == null ? '—' : `${broadcast.roas.toFixed(2)}x`}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">ROAS</div>
          </div>
        </div>
      </header>

      <Section title="Audience & Deliverability">
        <Stat label="Messages Sent" value={fmtNum(broadcast.messagesSent)} />
        <Stat label="Delivered" value={`${fmtNum(broadcast.messagesDelivered)} · ${fmtPct(broadcast.deliveryRate)}`} />
        <Stat label="Failed" value={`${fmtNum(broadcast.messagesFailed)} · ${fmtPct(broadcast.failureRate)}`} accent="text-rose-400" />
        <Stat label="Opt-outs" value={`${fmtNum(broadcast.optOuts)} · ${fmtPct(broadcast.optOutRate)}`} accent="text-amber-400" />
      </Section>

      <Section title="Engagement">
        <Stat label="Clicks" value={fmtNum(broadcast.clicks)} />
        <Stat label="Click Rate" value={fmtPct(broadcast.clickRate)} accent="text-sky-400" />
        <Stat label="Conversions" value={fmtNum(broadcast.conversions)} />
        <Stat label="Conversion Rate" value={fmtPct(broadcast.conversionRate)} accent="text-sky-400" />
      </Section>

      <Section title="Fundraising & ROI">
        <Stat label="Raised" value={fmtCurrency(broadcast.raised)} accent="text-emerald-400" />
        <Stat label="Donations" value={fmtNum(broadcast.donations)} />
        <Stat label="Unique Donors" value={fmtNum(broadcast.donors)} />
        <Stat label="Avg Gift" value={broadcast.avgGift == null ? '—' : fmtCurrency2(broadcast.avgGift)} />
        <Stat label="Cost" value={fmtCurrency(broadcast.cost)} accent="text-amber-400" />
        <Stat label="Cost / Donation" value={broadcast.costPerDonation == null ? '—' : fmtCurrency2(broadcast.costPerDonation)} />
        <Stat label="$ / 1k Delivered" value={broadcast.dollarsPer1kDelivered == null ? '—' : fmtCurrency2(broadcast.dollarsPer1kDelivered)} />
        <Stat label="ROAS" value={broadcast.roas == null ? '—' : `${broadcast.roas.toFixed(2)}x`} accent={roasUp ? 'text-emerald-400' : 'text-rose-400'} />
      </Section>

      {/* Attributed donations */}
      <section className="surgical-glass p-4 sm:p-6">
        <h3 className="text-sm font-display font-bold text-foreground uppercase tracking-wide mb-4">
          Attributed Donations {donations && donations.length > 0 && <span className="text-muted-foreground font-normal">· {donations.length}{donations.length >= 500 ? '+' : ''}</span>}
        </h3>
        {!donations?.length ? (
          <div className="py-8 text-center">
            <Inbox className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No donations attributed to this broadcast yet.</p>
          </div>
        ) : (
          <div className="max-h-[460px] overflow-y-auto pr-1 -mr-1 divide-y divide-border/60">
            {donations.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2.5 gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{d.donorName || 'Anonymous donor'}</p>
                  <p className="text-xs text-muted-foreground">{fmtDonationTime(d.transactionDate)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {d.isRecurring && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-violet-400">
                      <Repeat className="w-3 h-3" /> Recurring
                    </span>
                  )}
                  <span className="text-sm font-bold text-emerald-400 tabular-nums">{fmtCurrency2(d.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
