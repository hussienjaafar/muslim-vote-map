import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useDataOrders, useCartItems, useDataProducts, useAddToCart } from '@/queries/useDataProductQueries';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Package, ShoppingCart, MapPin, ArrowRight, User, LogOut, Map,
  Users, Vote, TrendingUp, Zap, Database, CheckCircle2, Plus,
  UserX, CalendarOff, Clock,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { HomeMiniMap } from '@/components/home/HomeMiniMap';
import { AnnouncementBanner } from '@/components/home/AnnouncementBanner';
import { GuidedTour } from '@/components/tour/GuidedTour';
import { HOME_TOUR_STEPS } from '@/components/tour/tourSteps';
import { useTourStatus } from '@/hooks/useTourStatus';
import { YourRegionsWidget } from '@/components/home/YourRegionsWidget';
import { RecommendedDistricts } from '@/components/home/RecommendedDistricts';

const statusColor: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  fulfilled: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const partyColor: Record<string, string> = {
  R: 'bg-red-500',
  D: 'bg-blue-500',
};

const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  muslim_voters: <Users className="w-4 h-4 text-blue-400" />,
  cell_phones: <Database className="w-4 h-4 text-violet-400" />,
  households: <Database className="w-4 h-4 text-emerald-400" />,
  political_activists: <TrendingUp className="w-4 h-4 text-amber-400" />,
  political_donors: <TrendingUp className="w-4 h-4 text-rose-400" />,
  donor_gold_count: <Zap className="w-4 h-4 text-yellow-400" />,
  donor_silver_count: <Zap className="w-4 h-4 text-slate-300" />,
  donor_platinum_count: <Zap className="w-4 h-4 text-cyan-400" />,
};

function useNationalStats() {
  return useQuery({
    queryKey: ['national-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voter_impact_states')
        .select('muslim_voters, registered, registered_pct, vote_2024, political_activists, donor_gold_count, donor_silver_count, donor_platinum_count, cell_phones, households, political_donors');
      if (error) throw error;
      const totalVoters = data.reduce((s, r) => s + (r.muslim_voters || 0), 0);
      const totalRegistered = data.reduce((s, r) => s + (r.registered || 0), 0);
      const totalVoted2024 = data.reduce((s, r) => s + (r.vote_2024 || 0), 0);
      const avgRegPct = data.length
        ? data.reduce((s, r) => s + Number(r.registered_pct || 0), 0) / data.length
        : 0;
      const turnout2024 = totalVoters > 0 ? (totalVoted2024 / totalVoters) * 100 : 0;
      const unregistered = totalVoters - totalRegistered;
      const nonVoters2024 = totalVoters - totalVoted2024;

      const aggregates: Record<string, number> = {
        muslim_voters: totalVoters,
        political_activists: data.reduce((s, r) => s + (r.political_activists || 0), 0),
        political_donors: data.reduce((s, r) => s + (r.political_donors || 0), 0),
        donor_gold_count: data.reduce((s, r) => s + (r.donor_gold_count || 0), 0),
        donor_silver_count: data.reduce((s, r) => s + (r.donor_silver_count || 0), 0),
        donor_platinum_count: data.reduce((s, r) => s + (r.donor_platinum_count || 0), 0),
        cell_phones: data.reduce((s, r) => s + (r.cell_phones || 0), 0),
        households: data.reduce((s, r) => s + (r.households || 0), 0),
      };

      return { totalVoters, avgRegPct, turnout2024, aggregates, stateCount: data.length, unregistered, nonVoters2024 };
    },
    staleTime: 10 * 60 * 1000,
  });
}

function useImpactableDistricts() {
  return useQuery({
    queryKey: ['impactable-districts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voter_impact_districts')
        .select('cd_code, state_code, muslim_voters, votes_needed, margin_pct, winner_party')
        .eq('can_impact', true)
        .order('votes_needed', { ascending: true })
        .limit(5);
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

function formatCompact(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

/** Quick-add button for district cards in sidebar */
function QuickAddButton({ district, voterProduct }: {
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
    } catch { /* handled by mutation */ }
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
      {added ? (
        <>
          <CheckCircle2 className="w-3 h-3" /> Added to cart
        </>
      ) : (
        <>
          <Plus className="w-3 h-3" /> Add Voter List
        </>
      )}
    </button>
  );
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email, organization')
        .eq('id', user!.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: orders } = useDataOrders();
  const pendingOrders = orders?.filter(o => o.status === 'pending') ?? [];
  const recentOrders = orders?.slice(0, 5) ?? [];

  const { data: cartItems } = useCartItems();
  const cartCount = cartItems?.length ?? 0;

  const { data: savedRegions } = useQuery({
    queryKey: ['saved-regions', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('saved_regions')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: nationalStats } = useNationalStats();
  const { data: products } = useDataProducts();
  const { data: impactDistricts } = useImpactableDistricts();

  // Last login timestamp
  const { data: lastVisit } = useQuery({
    queryKey: ['last-visit', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_activity_log')
        .select('created_at')
        .eq('user_id', user!.id)
        .eq('event_type', 'login')
        .order('created_at', { ascending: false })
        .limit(2);
      // Second entry is the previous login (first is current session)
      return data && data.length > 1 ? data[1].created_at : null;
    },
    enabled: !!user?.id,
    staleTime: 60 * 60 * 1000,
  });

  const { shouldShowTour, completeTour } = useTourStatus();
  const [showTour, setShowTour] = useState(false);

  // Auto-start tour for first-time users after a brief delay
  useEffect(() => {
    if (shouldShowTour) {
      const timer = setTimeout(() => setShowTour(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTour]);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'there';
  const initial = (profile?.full_name || user?.email || '?').charAt(0).toUpperCase();

  // Determine if user is "new" (no orders, no cart, no saved regions)
  const isNewUser = (orders?.length ?? 0) === 0 && cartCount === 0 && (savedRegions?.length ?? 0) === 0;

  // Find the voter list product for quick-add
  const voterProduct = products?.find(p => p.source_field === 'muslim_voters');

  // Prefetch map assets so they're cached when user navigates to the map
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  return (
    <div className="min-h-screen bg-[hsl(0_0%_5.5%)]">
      {/* Prefetch GeoJSON + map style for faster map page loads */}
      <link rel="prefetch" href="/geojson/us-states.json" as="fetch" crossOrigin="anonymous" />
      <link rel="prefetch" href={`${supabaseUrl}/storage/v1/object/public/geojson/congressional-districts-119.json`} as="fetch" crossOrigin="anonymous" />
      <link rel="prefetch" href="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" as="fetch" crossOrigin="anonymous" />
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[hsl(0_0%_7.5%)]/40 backdrop-blur-2xl border-b border-white/[0.04] shadow-[0_0_20px_hsl(var(--primary)/0.05)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-icon.png" alt="MVP" className="h-7 w-7 rounded-md" />
            <span className="font-display text-sm font-semibold text-foreground hidden sm:inline">Muslim Voter Project</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="focus:outline-none" data-tour="account-menu">
                <Avatar className="h-8 w-8 border border-white/10 cursor-pointer shadow-[0_0_8px_hsl(var(--primary)/0.15)]">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initial}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="surgical-glass min-w-[160px]">
              <DropdownMenuItem onClick={() => navigate('/account')} className="cursor-pointer gap-2">
                <User className="w-4 h-4" /> My Account
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}
                className="cursor-pointer gap-2 text-red-400 focus:text-red-400"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
        {/* Main Column */}
        <main className="flex-1 min-w-0 space-y-8">
          {/* Welcome */}
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
              Welcome back, {displayName}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-muted-foreground text-sm">Your voter data command center.</p>
              {lastVisit && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 bg-white/[0.03] px-2 py-0.5 rounded-full">
                  <Clock className="w-3 h-3" />
                  Last visit {formatDistanceToNow(new Date(lastVisit), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>

          {/* Full-width National Overview Map */}
          <div data-tour="mini-map">
            <HomeMiniMap />
          </div>

          {/* Announcements */}
          <AnnouncementBanner />
          {isNewUser ? (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.06] to-transparent">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Map className="w-6 h-6 text-primary" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="font-display text-lg font-semibold text-foreground">Get Started with Voter Impact Data</h2>
                    <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                      <li>Explore the map to find your target regions</li>
                      <li>Add data products to your cart</li>
                      <li>Submit a request — we'll help you activate your campaign</li>
                    </ol>
                    <Button onClick={() => navigate('/map')} className="mt-2">
                      Explore the Map <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="surgical-glass border-white/[0.06] cursor-pointer hover:border-white/[0.12] transition-colors" onClick={() => navigate('/account?tab=orders')}>
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">Orders</p>
                    <p className="text-stat-hero text-foreground">{orders?.length ?? 0}</p>
                    {pendingOrders.length > 0 && (
                      <p className="text-sub-label text-amber-400">{pendingOrders.length} Pending</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="surgical-glass border-white/[0.06] cursor-pointer hover:border-white/[0.12] transition-colors" onClick={() => navigate('/map')}>
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">Cart Items</p>
                    <p className="text-stat-hero text-foreground">{cartCount}</p>
                    {cartCount > 0 && (
                      <p className="text-sub-label text-muted-foreground">Ready to quote</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="surgical-glass border-white/[0.06] cursor-pointer hover:border-white/[0.12] transition-colors" onClick={() => navigate('/account?tab=regions')}>
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">Saved Regions</p>
                    <p className="text-stat-hero text-foreground">{savedRegions?.length ?? 0}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* National Snapshot */}
          <section data-tour="national-stats">
            <h2 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              National Snapshot
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <Card className="surgical-glass border-white/[0.06] border-t-2 border-t-blue-500/30">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">Total Voters</p>
                    <p className="text-lg font-bold text-foreground">{nationalStats ? formatCompact(nationalStats.totalVoters) : '—'}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="surgical-glass border-white/[0.06] border-t-2 border-t-emerald-500/30">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Vote className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">Reg. Rate</p>
                    <p className="text-lg font-bold text-foreground">{nationalStats ? nationalStats.avgRegPct.toFixed(1) + '%' : '—'}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="surgical-glass border-white/[0.06] border-t-2 border-t-violet-500/30">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">2024 Turnout</p>
                    <p className="text-lg font-bold text-foreground">{nationalStats ? nationalStats.turnout2024.toFixed(1) + '%' : '—'}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="surgical-glass border-white/[0.06] border-t-2 border-t-amber-500/30">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                    <UserX className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">Unregistered</p>
                    <p className="text-lg font-bold text-foreground">{nationalStats ? formatCompact(nationalStats.unregistered) : '—'}</p>
                    <p className="text-[10px] text-amber-400/80">Actionable gap</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="surgical-glass border-white/[0.06] border-t-2 border-t-red-500/30">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                    <CalendarOff className="w-4 h-4 text-red-400" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">Non-Voters '24</p>
                    <p className="text-lg font-bold text-foreground">{nationalStats ? formatCompact(nationalStats.nonVoters2024) : '—'}</p>
                    <p className="text-[10px] text-red-400/80">Didn't vote in 2024</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Data Products Catalog — conversion-optimized */}
          {products && products.length > 0 && (
            <section data-tour="data-products">
              <h2 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Available Data Products
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map(product => {
                  const recordCount = nationalStats?.aggregates?.[product.source_field ?? ''] ?? 0;
                  const fields = (product.data_fields as string[] | null) ?? [];
                  return (
                    <Card key={product.id} className="surgical-glass border-white/[0.06] hover:border-white/[0.12] transition-all group">
                      <CardContent className="p-5 flex flex-col h-full">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            {PRODUCT_ICONS[product.source_field ?? ''] ?? <Database className="w-4 h-4 text-primary" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-display text-sm font-semibold text-foreground truncate">{product.name}</p>
                          </div>
                        </div>

                        {/* Value proposition — national record count */}
                        {recordCount > 0 && (
                          <p className="text-sm text-foreground/80 mb-2">
                            <span className="font-semibold text-foreground">{formatCompact(recordCount)}</span>{' '}
                            records across{' '}
                            <span className="text-foreground">{nationalStats?.stateCount ?? 50} states</span>
                          </p>
                        )}

                        {product.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{product.description}</p>
                        )}

                        {/* Data fields chips */}
                        {fields.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-4">
                            {fields.slice(0, 5).map(field => (
                              <span key={field} className="px-1.5 py-0.5 text-[10px] rounded bg-white/[0.05] text-muted-foreground border border-white/[0.06]">
                                {field}
                              </span>
                            ))}
                            {fields.length > 5 && (
                              <span className="px-1.5 py-0.5 text-[10px] rounded text-muted-foreground">
                                +{fields.length - 5} more
                              </span>
                            )}
                          </div>
                        )}

                        <div className="mt-auto">
                          <Button
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => navigate('/map')}
                          >
                            <MapPin className="w-3 h-3 mr-1.5" /> Select Regions on Map
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* Map CTA */}
          <Card
            className="surgical-glass border-primary/20 hover:border-primary/40 transition-all cursor-pointer group"
            onClick={() => navigate('/map')}
          >
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Map className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-display text-lg font-semibold text-foreground">Explore the Voter Impact Map</p>
                  <p className="text-sm text-muted-foreground">Browse population, turnout, donors & more</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>

          {/* Recent Orders */}
          {recentOrders.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-3">Recent Orders</h2>
              <div className="space-y-2">
                {recentOrders.map(order => (
                  <Card
                    key={order.id}
                    className="surgical-glass border-white/[0.06] hover:border-white/[0.12] transition-colors cursor-pointer"
                    onClick={() => navigate('/account?tab=orders')}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={statusColor[order.status] ?? 'border-muted-foreground/30 text-muted-foreground'}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </Badge>
                        <span className="text-sm text-foreground font-mono">
                          #{order.id.slice(0, 8)}
                        </span>
                        {order.total_amount != null && Number(order.total_amount) > 0 && (
                          <span className="text-xs font-medium text-foreground/70">
                            ${Number(order.total_amount).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(order.created_at), 'MMM d, yyyy')}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Your Regions at a Glance */}
          {(savedRegions?.length ?? 0) > 0 && (
            <YourRegionsWidget regions={savedRegions!} />
          )}
        </main>

        {/* Right Sidebar — Top Impactable Districts */}
        <aside className="w-full lg:w-80 shrink-0">
          <div className="lg:sticky lg:top-[72px] space-y-4">
            <div className="surgical-glass border border-white/[0.06] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-amber-400" />
                <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
                  Top Impactable Districts
                </h2>
              </div>

              {impactDistricts && impactDistricts.length > 0 ? (
                <div className="space-y-3">
                  {impactDistricts.map(d => (
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
                      <QuickAddButton district={d} voterProduct={voterProduct} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No impactable districts found.</p>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-primary text-xs mt-4"
                onClick={() => navigate('/map')}
              >
                Explore all on map <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
            <RecommendedDistricts />
          </div>
        </aside>
      </div>

      {/* Guided Tour */}
      {showTour && (
        <GuidedTour
          steps={HOME_TOUR_STEPS}
          stepOffset={0}
          onComplete={() => {
            setShowTour(false);
            navigate('/map?tour=1');
          }}
          onSkip={() => {
            setShowTour(false);
            completeTour.mutate();
          }}
        />
      )}
    </div>
  );
}
