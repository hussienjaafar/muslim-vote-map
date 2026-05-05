import React, { useState } from 'react';
import { formatNumber, formatPercent } from '@/lib/geoUtils';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Users, Phone, Home, TrendingUp, TrendingDown, Minus, Activity, Lock, DollarSign, Vote, ShoppingCart, Loader2, BarChart3, Check } from 'lucide-react';
import type { MetricType } from '@/store/mapStore';
import { cn } from '@/lib/utils';
import { ComparePanel, type CompareRegion } from './ComparePanel';
import { useDataProducts, useAddToCart } from '@/queries/useDataProductQueries';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface RegionSidebarProps {
  regionId: string | null;
  regionType: 'state' | 'district' | null;
  stateData: any | null;
  districtData: any | null;
  activeMetric: MetricType;
  comparisonItems: ComparisonItem[];
  onClose: () => void;
  onAddToCompare: (item: ComparisonItem) => void;
  onRemoveFromCompare: (id: string) => void;
  onClearCompare: () => void;
  className?: string;
  allStatesData?: any[] | null;
  allDistrictsData?: any[] | null;
  compactMode?: boolean;
}

export interface ComparisonItem {
  regionId: string;
  regionType: 'state' | 'district';
  label: string;
  muslimVoters: number;
  marginOrRegistered: number;
}

function StatRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-xs font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function MetricHighlight({ data, activeMetric, isDistrict }: { data: any; activeMetric: MetricType; isDistrict: boolean }) {
  const configs: Record<MetricType, { icon: React.ReactNode; label: string; getValue: () => string; accent: string }> = {
    population: {
      icon: <Users className="w-5 h-5" />,
      label: 'Muslim Voters',
      getValue: () => formatNumber(data.muslim_voters ?? 0),
      accent: 'border-blue-600/30 bg-blue-600/10 text-blue-400',
    },
    activists: {
      icon: <Activity className="w-5 h-5" />,
      label: 'Political Activists',
      getValue: () => formatNumber(data.political_activists ?? 0),
      accent: 'border-violet-600/30 bg-violet-600/10 text-violet-400',
    },
    donors: {
      icon: <DollarSign className="w-5 h-5" />,
      label: 'Political Donors',
      getValue: () => formatNumber((data.donor_gold_count ?? 0) + (data.donor_silver_count ?? 0)),
      accent: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-400',
    },
    turnout: {
      icon: <Vote className="w-5 h-5" />,
      label: '2024 Turnout',
      getValue: () => {
        if (isDistrict) {
          const pct = data.actual_turnout_pct ?? 0;
          const hasData = data.voted_2024 != null && data.voted_2024 > 0;
          return pct > 0 || hasData ? formatPercent(pct) : 'No data';
        }
        const pct = data.vote_2024_pct ?? 0;
        const hasData = data.vote_2024 != null && data.vote_2024 > 0;
        return pct > 0 || hasData ? formatPercent(pct) : 'No data';
      },
      accent: 'border-amber-600/30 bg-amber-600/10 text-amber-400',
    },
    impact: {
      icon: <Activity className="w-5 h-5" />,
      label: 'Impact Score',
      getValue: () => {
        if (!isDistrict) return 'District only';
        const margin = data.margin_votes ?? 0;
        const didntVote = data.didnt_vote_2024 ?? 0;
        if (margin <= 0) return 'N/A';
        return `${Math.min(Math.round((didntVote / margin) * 100), 100)}%`;
      },
      accent: 'border-rose-600/30 bg-rose-600/10 text-rose-400',
    },
  };

  const cfg = configs[activeMetric];

  return (
    <div className={`rounded-lg border p-3 mb-4 ${cfg.accent}`}>
      <div className="flex items-center gap-2 mb-1">
        {cfg.icon}
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold font-display">{cfg.label}</span>
      </div>
      <div className="text-3xl font-bold font-display tabular-nums text-foreground">{cfg.getValue()}</div>
    </div>
  );
}

/** Shared cart buttons for adding specific data products */
function CartButtons({ data, regionType, regionCode, regionName }: {
  data: any;
  regionType: 'state' | 'district';
  regionCode: string;
  regionName: string;
}) {
  const { user } = useAuth();
  const { data: products } = useDataProducts();
  const addToCart = useAddToCart();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);

  const findProduct = (sourceField: string) => products?.find(p => p.source_field === sourceField);

  const goldCount = data?.donor_gold_count ?? 0;
  const silverCount = data?.donor_silver_count ?? 0;

  const items = [
    { sourceField: 'muslim_voters', label: 'Voter List', count: data?.muslim_voters ?? 0, icon: <Users className="w-3.5 h-3.5" /> },
    { sourceField: 'donor_gold', label: 'Gold Donors', count: goldCount, icon: <DollarSign className="w-3.5 h-3.5 text-amber-400" /> },
    { sourceField: 'donor_silver', label: 'Silver Donors', count: silverCount, icon: <DollarSign className="w-3.5 h-3.5 text-muted-foreground" /> },
    { sourceField: 'political_activists', label: 'Activists List', count: data?.political_activists ?? 0, icon: <Activity className="w-3.5 h-3.5" /> },
  ];

  const handleAdd = async (sourceField: string, label: string, count: number) => {
    if (!user) {
      toast.error('Please sign in to add items to cart');
      return;
    }
    const product = findProduct(sourceField);
    if (!product) {
      toast.error('Product not found');
      return;
    }
    setAddingId(sourceField);
    try {
      await addToCart.mutateAsync({
        product_id: product.id,
        geo_type: regionType,
        geo_code: regionCode,
        geo_name: regionName,
        record_count: count,
      });
      setAddingId(null);
      setAddedId(sourceField);
      setTimeout(() => setAddedId(null), 2000);
    } catch (e: any) {
      toast.error(e.message || 'Failed to add to cart');
      setAddingId(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground flex items-center gap-1.5">
        <ShoppingCart className="w-3.5 h-3.5" />
        Add to Cart
      </h4>
      {items.map(item => {
        const product = findProduct(item.sourceField);
        
        const disabled = item.count === 0 || !user;
        const isAdding = addingId === item.sourceField;
        const isAdded = addedId === item.sourceField;

        return (
          <button
            key={item.sourceField}
            disabled={disabled || isAdding || isAdded}
            onClick={() => handleAdd(item.sourceField, item.label, item.count)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-all",
              isAdded
                ? "bg-emerald-600/15 border border-emerald-500/30"
                : disabled
                  ? "opacity-40 cursor-not-allowed bg-white/5"
                  : "bg-white/5 hover:bg-white/10 active:scale-[0.98] cursor-pointer"
            )}
          >
            {isAdding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isAdded ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              item.icon
            )}
            <span className="font-medium flex-1 text-left">
              {isAdded ? 'Added to cart!' : item.label}
            </span>
            {!isAdded && (
              <>
                <span className="tabular-nums text-muted-foreground">{formatNumber(item.count)}</span>
                
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DistrictDetails({ data, activeMetric, onAddToCompare, parentStateName }: {
  data: any; activeMetric: MetricType; onAddToCompare: () => void; parentStateName?: string;
}) {
  if (!data) return <div className="p-4 text-sm text-muted-foreground">No district data available</div>;

  const registrationPct = data.registration_pct ?? 0;

  return (
    <div className="space-y-4">
      {parentStateName && (
        <div className="text-xs text-muted-foreground">{parentStateName} ›</div>
      )}
      <div className="flex items-center gap-2">
        <h3 className="text-2xl font-bold font-display text-white tracking-tight">{data.cd_code}</h3>
      </div>
      <MetricHighlight data={data} activeMetric={activeMetric} isDistrict={true} />

      {/* Muslim Voters */}
      <div className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground">Muslim Voters</h4>
        <StatRow label="Total" value={formatNumber(data.muslim_voters)} icon={<Users className="w-3.5 h-3.5" />} />
        <StatRow label="Registered" value={formatNumber(data.muslim_registered)} />
        <StatRow label="Unregistered" value={formatNumber(data.muslim_unregistered)} />
      </div>

      {/* Registration */}
      <div className="space-y-1.5">
        <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground">Registration</h4>
        {(data.muslim_registered != null && registrationPct > 0) ? (
          <>
            <Progress value={registrationPct} className="h-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Registered: {formatPercent(registrationPct)}</span>
            </div>
          </>
        ) : (
          <div className="text-[10px] text-muted-foreground/60 italic">No registration data</div>
        )}
      </div>

      {/* 2024 General Election */}
      {(data.voted_2024 > 0 || data.didnt_vote_2024 > 0) && (
        <div className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground">2024 General Election</h4>
          <StatRow label="Voted" value={formatNumber(data.voted_2024)} />
          <StatRow label="Didn't Vote" value={formatNumber(data.didnt_vote_2024)} />
          {data.actual_turnout_pct != null && (
            <StatRow label="Turnout" value={formatPercent(data.actual_turnout_pct)} />
          )}
        </div>
      )}

      {/* 2024 House Results */}
      {data.winner && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground">2024 House Results</h4>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground font-medium flex items-center gap-1.5">
                {data.winner}
                <Badge className={`text-[9px] px-1.5 py-0 ${data.winner_party === 'Democrat' ? 'bg-blue-600 hover:bg-blue-600' : data.winner_party === 'Republican' ? 'bg-red-600 hover:bg-red-600' : 'bg-slate-600 hover:bg-slate-600'} text-white border-0`}>
                  {data.winner_party === 'Democrat' ? 'D' : data.winner_party === 'Republican' ? 'R' : data.winner_party?.[0] ?? '?'}
                </Badge>
              </span>
              <span className="text-xs font-semibold text-foreground">{formatNumber(data.winner_votes)}</span>
            </div>
            {data.runner_up && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  {data.runner_up}
                  <Badge className={`text-[9px] px-1.5 py-0 ${data.runner_up_party === 'Democrat' ? 'bg-blue-600 hover:bg-blue-600' : data.runner_up_party === 'Republican' ? 'bg-red-600 hover:bg-red-600' : 'bg-slate-600 hover:bg-slate-600'} text-white border-0`}>
                    {data.runner_up_party === 'Democrat' ? 'D' : data.runner_up_party === 'Republican' ? 'R' : data.runner_up_party?.[0] ?? '?'}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">{formatNumber(data.runner_up_votes)}</span>
              </div>
            )}
            <div className="flex justify-between text-[10px] pt-1 border-t border-white/[0.06]">
              <span className="text-muted-foreground">Margin</span>
              <span className="font-semibold text-foreground">{formatNumber(data.margin_votes)} ({formatPercent(data.margin_pct)})</span>
            </div>
            {data.total_votes != null && (
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Total Votes</span>
                <span className="text-foreground">{formatNumber(data.total_votes)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Impact Assessment */}
      {data.can_impact && data.margin_votes > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Impact Assessment
          </h4>
          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0 text-[10px]">Can Impact</Badge>
          <StatRow label="Votes Needed" value={formatNumber(data.votes_needed)} />
          {(() => {
            const impactRatio = Math.min(((data.didnt_vote_2024 ?? 0) / data.margin_votes) * 100, 100);
            return (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Untapped vs Margin</span>
                  <span className="font-semibold text-foreground">{impactRatio.toFixed(0)}%</span>
                </div>
                <Progress value={impactRatio} className="h-2" />
              </div>
            );
          })()}
        </div>
      )}

      {/* 2022 General Election */}
      {(data.voted_2022 != null || data.turnout_2022_pct != null) && (
        <div className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground">2022 General Election</h4>
          {data.voted_2022 != null && (
            <StatRow label="Voted 2022" value={formatNumber(data.voted_2022 ?? 0)} />
          )}
          {data.turnout_2022_pct != null && (
            <StatRow label="Turnout 2022" value={formatPercent(data.turnout_2022_pct)} />
          )}
        </div>
      )}

      {/* Primary Elections */}
      {(data.primary_2024 != null || data.primary_2024_pct != null || data.primary_2022 != null || data.primary_2022_pct != null) && (
        <div className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground flex items-center gap-1.5">
            <Vote className="w-3.5 h-3.5" />
            Primary Elections
          </h4>
          {(data.primary_2024 != null || data.primary_2024_pct != null) && (
            <StatRow
              label="Primary 2024"
              value={[
                data.primary_2024 != null ? formatNumber(data.primary_2024) : null,
                data.primary_2024_pct != null ? formatPercent(data.primary_2024_pct) : null,
              ].filter(Boolean).join(' · ')}
            />
          )}
          {(data.primary_2022 != null || data.primary_2022_pct != null) && (
            <StatRow
              label="Primary 2022"
              value={[
                data.primary_2022 != null ? formatNumber(data.primary_2022) : null,
                data.primary_2022_pct != null ? formatPercent(data.primary_2022_pct) : null,
              ].filter(Boolean).join(' · ')}
            />
          )}
        </div>
      )}

      {/* Contact Data */}
      <div className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground">Contact Data</h4>
        <StatRow label="Cell Phones" value={formatNumber(data.cell_phones ?? 0)} icon={<Phone className="w-3.5 h-3.5" />} />
        <StatRow label="Households" value={formatNumber(data.households ?? 0)} icon={<Home className="w-3.5 h-3.5" />} />
      </div>

      {/* Donor Data */}
      <div className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground">Donor Data</h4>
        <StatRow label="Total Donors" value={formatNumber(data.political_donors ?? 0)} />
        <StatRow label="Gold Donors" value={formatNumber(data.donor_gold_count ?? 0)} />
        <StatRow label="Silver Donors" value={formatNumber(data.donor_silver_count ?? 0)} />
        
      </div>

      {/* Cart Buttons */}
      <CartButtons
        data={data}
        regionType="district"
        regionCode={data.cd_code}
        regionName={data.cd_code}
      />

      {/* Compare */}
      <div className="flex gap-2">
        <button className="flex-1 px-4 py-2.5 font-bold text-xs text-blue-400 border border-white/10 hover:bg-white/5 transition-colors tracking-wide" onClick={onAddToCompare} style={{ background: 'rgba(32,31,31,0.4)', backdropFilter: 'blur(20px)' }}>
          Add to Compare
        </button>
      </div>
    </div>
  );
}

function StateDetails({ data, activeMetric, onAddToCompare }: { data: any; activeMetric: MetricType; onAddToCompare: () => void }) {
  if (!data) return <div className="p-4 text-sm text-muted-foreground">No state data available</div>;

  const regRate = data.registered_pct ?? 0;
  const turnout2024 = data.vote_2024_pct ?? 0;
  const turnout2022 = data.vote_2022_pct ?? 0;
  const turnoutChange = turnout2024 - turnout2022;
  const changeIcon = turnoutChange > 0 ? <TrendingUp className="w-3 h-3 text-emerald-400" />
    : turnoutChange < 0 ? <TrendingDown className="w-3 h-3 text-red-400" />
    : <Minus className="w-3 h-3 text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-2xl font-bold font-display text-white tracking-tight">{data.state_name}</h3>
        <span className="text-xs text-muted-foreground">{data.state_code}</span>
      </div>
      <MetricHighlight data={data} activeMetric={activeMetric} isDistrict={false} />

      {/* Muslim Voters */}
      <div className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground">Muslim Voters</h4>
        <StatRow label="Total" value={formatNumber(data.muslim_voters)} icon={<Users className="w-3.5 h-3.5" />} />
        <StatRow label="Registered" value={data.registered != null ? formatNumber(data.registered) : 'No data'} />
        <StatRow label="Registration Rate" value={(data.registered != null && regRate > 0) ? formatPercent(regRate) : 'No data'} />
      </div>

      {/* Voter Turnout */}
      <div className="space-y-1.5">
        <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground">Voter Turnout</h4>
        {(turnout2024 > 0 || (data.vote_2024 != null && data.vote_2024 > 0)) ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">2024</span>
          <Progress value={turnout2024} className="h-2 flex-1" />
          <span className="text-xs font-medium tabular-nums text-foreground">{formatPercent(turnout2024)}</span>
        </div>
        ) : (
          <div className="text-[10px] text-muted-foreground italic">No 2024 election data available</div>
        )}
        {turnout2022 > 0 ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">2022</span>
              <Progress value={turnout2022} className="h-2 flex-1" />
              <span className="text-xs font-medium tabular-nums text-foreground">{formatPercent(turnout2022)}</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              {changeIcon}
              <span className={turnoutChange > 0 ? 'text-emerald-400' : turnoutChange < 0 ? 'text-red-400' : 'text-muted-foreground'}>
                {turnoutChange > 0 ? '+' : ''}{turnoutChange.toFixed(1)}% change
              </span>
            </div>
          </>
        ) : (
          <div className="text-[10px] text-muted-foreground italic">No 2022 data available</div>
        )}
      </div>

      {/* Primary Elections */}
      {(data.primary_2024 != null || data.primary_2024_pct != null || data.primary_2022 != null || data.primary_2022_pct != null) && (
        <div className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground flex items-center gap-1.5">
            <Vote className="w-3.5 h-3.5" />
            Primary Elections
          </h4>
          {(data.primary_2024 != null || data.primary_2024_pct != null) && (
            <StatRow
              label="Primary 2024"
              value={[
                data.primary_2024 != null ? formatNumber(data.primary_2024) : null,
                data.primary_2024_pct != null ? formatPercent(data.primary_2024_pct) : null,
              ].filter(Boolean).join(' · ')}
            />
          )}
          {(data.primary_2022 != null || data.primary_2022_pct != null) && (
            <StatRow
              label="Primary 2022"
              value={[
                data.primary_2022 != null ? formatNumber(data.primary_2022) : null,
                data.primary_2022_pct != null ? formatPercent(data.primary_2022_pct) : null,
              ].filter(Boolean).join(' · ')}
            />
          )}
        </div>
      )}

      {/* Political Engagement */}
      <div className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground">Political Engagement</h4>
        <StatRow label="Donors" value={formatNumber((data.donor_gold_count ?? 0) + (data.donor_silver_count ?? 0))} />
        <StatRow label="Activists" value={formatNumber(data.political_activists ?? 0)} />
      </div>

      {/* Contact Data */}
      <div className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground">Contact Data</h4>
        <StatRow label="Cell Phones" value={formatNumber(data.cell_phones ?? 0)} icon={<Phone className="w-3.5 h-3.5" />} />
        <StatRow label="Households" value={formatNumber(data.households ?? 0)} icon={<Home className="w-3.5 h-3.5" />} />
      </div>

      {/* Donor Data */}
      <div className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-[0.15em] font-bold font-display text-muted-foreground">Donor Data</h4>
        <StatRow label="Total Donors" value={formatNumber((data.donor_gold_count ?? 0) + (data.donor_silver_count ?? 0))} />
        <StatRow label="Gold Donors" value={formatNumber(data.donor_gold_count ?? 0)} />
        <StatRow label="Silver Donors" value={formatNumber(data.donor_silver_count ?? 0)} />
      </div>

      {/* Cart Buttons */}
      <CartButtons
        data={data}
        regionType="state"
        regionCode={data.state_code}
        regionName={data.state_name}
      />

      {/* Compare */}
      <div className="flex gap-2">
        <button className="flex-1 px-4 py-2.5 font-bold text-xs text-blue-400 border border-white/10 hover:bg-white/5 transition-colors tracking-wide" onClick={onAddToCompare} style={{ background: 'rgba(32,31,31,0.4)', backdropFilter: 'blur(20px)' }}>
          Add to Compare
        </button>
      </div>
    </div>
  );
}

export function RegionSidebar({
  regionId,
  regionType,
  stateData,
  districtData,
  activeMetric,
  comparisonItems,
  onClose,
  onAddToCompare,
  onRemoveFromCompare,
  onClearCompare,
  className,
  allStatesData,
  allDistrictsData,
  compactMode,
}: RegionSidebarProps) {
  if (!regionId) return null;

  const isDistrict = regionType === 'district';
  const currentData = isDistrict ? districtData : stateData;

  // Compact mode (peek state): show only name + metric highlight
  if (compactMode) {
    const regionName = isDistrict ? currentData?.cd_code : currentData?.state_name;
    return (
      <div className={cn("w-full", className)}>
        <div className="px-4 py-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground font-display">{regionName || regionId}</h3>
              <span className="text-xs text-muted-foreground">{isDistrict ? 'District' : (currentData?.state_code || '')}</span>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums text-foreground">{formatNumber(currentData?.muslim_voters ?? 0)}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Muslim Voters</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleAddToCompare = () => {
    if (!currentData) return;
    onAddToCompare({
      regionId,
      regionType: regionType!,
      label: isDistrict ? currentData.cd_code : currentData.state_name,
      muslimVoters: currentData.muslim_voters ?? 0,
      marginOrRegistered: isDistrict
        ? (currentData.margin_votes ?? 0)
        : (currentData.registered ?? 0),
    });
  };

  // Build CompareRegion[] with full data for the upgraded compare panel
  const compareRegions: CompareRegion[] = comparisonItems.map(item => {
    let data: any = null;
    if (item.regionType === 'state') {
      data = allStatesData?.find(s => s.state_code === item.regionId);
    } else {
      data = allDistrictsData?.find(d => d.cd_code === item.regionId);
    }
    return { regionId: item.regionId, regionType: item.regionType, label: item.label, data };
  });

  return (
    <div className={cn("w-72 lg:w-80 bg-[rgba(28,28,30,0.80)] backdrop-blur-[20px] border-l border-[rgba(255,255,255,0.08)] overflow-y-auto h-full", className)}>
      <div className="p-4">
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-blue-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isDistrict ? (
          <DistrictDetails
            data={currentData}
            activeMetric={activeMetric}
            onAddToCompare={handleAddToCompare}
            parentStateName={stateData?.state_name}
          />
        ) : (
          <StateDetails data={currentData} activeMetric={activeMetric} onAddToCompare={handleAddToCompare} />
        )}

        {/* Upgraded compare panel */}
        <ComparePanel
          regions={compareRegions}
          onRemove={onRemoveFromCompare}
          onClear={onClearCompare}
        />
      </div>
    </div>
  );
}
