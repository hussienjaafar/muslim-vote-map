import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCartItems, useDataProducts, useAddToCart } from '@/queries/useDataProductQueries';
import { useIssueDonorDistricts, useIssues } from '@/hooks/useIssueDonorData';
import { Button } from '@/components/ui/button';
import { ArrowRight, Lightbulb, Plus, CheckCircle2 } from 'lucide-react';

function formatCompact(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function QuickAdd({ district, product, issueId, issueName }: {
  district: { cd_code: string; state_code: string; total_donors: number };
  product: { id: string } | undefined;
  issueId: string | null;
  issueName: string | null;
}) {
  const { user } = useAuth();
  const addToCart = useAddToCart();
  const [added, setAdded] = useState(false);

  if (!user || !product) return null;

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await addToCart.mutateAsync({
        product_id: product.id,
        geo_type: 'district',
        geo_code: district.cd_code,
        geo_name: `${district.cd_code} (${district.state_code})`,
        record_count: district.total_donors,
        issue_id: issueId,
        issue_name: issueName,
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
      {added ? <><CheckCircle2 className="w-3 h-3" /> Added</> : <><Plus className="w-3 h-3" /> Add to request</>}
    </button>
  );
}

export function RecommendedDistricts({ issueId }: { issueId: string | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: cartItems } = useCartItems();
  const { data: products } = useDataProducts();
  const { data: issues } = useIssues();
  const issueName = issues?.find(i => i.id === issueId)?.name ?? null;
  const quickAddProduct = products?.[0];

  const { data: savedStateCodes } = useQuery({
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

  const { data: issueDistricts } = useIssueDonorDistricts(issueId ? [issueId] : []);

  const cartCodes = useMemo(() => {
    const codes = new Set<string>();
    cartItems?.forEach(item => {
      if (item.geo_type === 'district') codes.add(item.geo_code);
    });
    return codes;
  }, [cartItems]);

  const recommended = useMemo(() => {
    if (!issueDistricts || !savedStateCodes?.length) return [];
    return issueDistricts
      .filter(d => savedStateCodes.includes(d.state_code))
      .sort((a, b) => (b.total_donors || 0) - (a.total_donors || 0))
      .filter(d => !cartCodes.has(d.cd_code))
      .slice(0, 5);
  }, [issueDistricts, savedStateCodes, cartCodes]);

  if (!issueId || !savedStateCodes?.length || !recommended.length) return null;

  const totalInStates = issueDistricts?.filter(d => savedStateCodes.includes(d.state_code)).length ?? 0;
  const inRequest = issueDistricts?.filter(d => savedStateCodes.includes(d.state_code) && cartCodes.has(d.cd_code)).length ?? 0;

  return (
    <div className="surgical-glass border border-white/[0.06] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="w-4 h-4 text-amber-400" />
        <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
          Recommended for You
        </h2>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Top districts in your saved states • {inRequest}/{totalInStates} in request
      </p>

      <div className="space-y-3">
        {recommended.map(d => (
          <div
            key={d.cd_code}
            className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.10] transition-colors cursor-pointer"
            onClick={() => navigate(`/map?region=${d.cd_code}&type=district&issue=${issueId}`)}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-sm font-semibold text-foreground">{d.cd_code}</span>
              <span className="text-xs text-muted-foreground">{d.state_code}</span>
            </div>
            <p className="text-xs text-foreground/80">
              <span className="font-semibold text-cyan-400">{formatCompact(d.total_donors)}</span> donors
              {d.gold_donors > 0 && (
                <span className="text-muted-foreground"> • {formatCompact(d.gold_donors)} gold</span>
              )}
            </p>
            <QuickAdd district={d} product={quickAddProduct} />
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
