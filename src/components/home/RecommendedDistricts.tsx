import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCartItems, useDataProducts, useAddToCart } from '@/queries/useDataProductQueries';
import { Button } from '@/components/ui/button';
import { ArrowRight, Lightbulb, Plus, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

function formatCompact(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

const partyColor: Record<string, string> = {
  R: 'bg-red-500',
  D: 'bg-blue-500',
};

function QuickAdd({ district, voterProduct }: {
  district: { cd_code: string; state_code: string; muslim_voters: number };
  voterProduct: { id: string } | undefined;
}) {
  const { user } = useAuth();
  const addToCart = useAddToCart();
  const [added, setAdded] = useState(false);

  if (!user || !voterProduct) return null;

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await addToCart.mutateAsync({
        product_id: voterProduct.id,
        geo_type: 'district',
        geo_code: district.cd_code,
        geo_name: `${district.cd_code} (${district.state_code})`,
        record_count: district.muslim_voters,
      });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch { /* handled */ }
  };

  return (
    <button
      onClick={handleAdd}
      disabled={addToCart.isPending || added}
      className={`mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md transition-all ${
        added
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20'
      }`}
    >
      {added ? <><CheckCircle2 className="w-3 h-3" /> Added</> : <><Plus className="w-3 h-3" /> Add Voter List</>}
    </button>
  );
}

export function RecommendedDistricts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: cartItems } = useCartItems();
  const { data: products } = useDataProducts();
  const voterProduct = products?.find(p => p.source_field === 'muslim_voters');

  const { data: savedRegions } = useQuery({
    queryKey: ['saved-regions-states', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('saved_regions')
        .select('region_code, region_type')
        .eq('user_id', user!.id);
      return (data ?? []).filter(r => r.region_type === 'state').map(r => r.region_code);
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: districts } = useQuery({
    queryKey: ['recommended-districts', savedRegions],
    queryFn: async () => {
      if (!savedRegions?.length) return [];
      const { data, error } = await supabase
        .from('voter_impact_districts')
        .select('cd_code, state_code, muslim_voters, votes_needed, margin_pct, winner_party, can_impact')
        .in('state_code', savedRegions)
        .eq('can_impact', true)
        .order('votes_needed', { ascending: true })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!savedRegions?.length,
    staleTime: 10 * 60 * 1000,
  });

  const cartCodes = useMemo(() => {
    const codes = new Set<string>();
    cartItems?.forEach(item => {
      if (item.geo_type === 'district') codes.add(item.geo_code);
    });
    return codes;
  }, [cartItems]);

  const recommended = useMemo(() => {
    if (!districts) return [];
    return districts.filter(d => !cartCodes.has(d.cd_code)).slice(0, 5);
  }, [districts, cartCodes]);

  if (!savedRegions?.length || !recommended.length) return null;

  const coverage = districts ? districts.filter(d => cartCodes.has(d.cd_code)).length : 0;
  const total = districts?.length ?? 0;

  return (
    <div className="surgical-glass border border-white/[0.06] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="w-4 h-4 text-amber-400" />
        <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Recommended for You
        </h2>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Impactable districts in your saved states • {coverage}/{total} in cart
      </p>

      <div className="space-y-3">
        {recommended.map(d => (
          <div
            key={d.cd_code}
            className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.10] transition-colors cursor-pointer"
            onClick={() => navigate(`/map?region=${d.cd_code}&type=district`)}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-sm font-semibold text-foreground">{d.cd_code}</span>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${partyColor[d.winner_party ?? ''] ?? 'bg-muted-foreground'}`} />
                <span className="text-xs text-muted-foreground">
                  {d.winner_party ?? '?'}{d.margin_pct != null ? `+${Number(d.margin_pct).toFixed(1)}%` : ''}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-amber-400 font-semibold">
                ⚡ {d.votes_needed?.toLocaleString() ?? '?'} votes needed
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCompact(d.muslim_voters)} Muslim voters
            </p>
            <QuickAdd district={d} voterProduct={voterProduct} />
          </div>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-primary text-xs mt-4"
        onClick={() => navigate('/map')}
      >
        Explore all on map <ArrowRight className="w-3 h-3 ml-1" />
      </Button>
    </div>
  );
}
