import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useDataOrders, useCartItems, useDataProducts, useAddToCart } from '@/queries/useDataProductQueries';
import { useIssues, useIssueDonorDistricts, useIssueDonorStates } from '@/hooks/useIssueDonorData';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Package, ShoppingCart, MapPin, ArrowRight, User, LogOut, Map,
  Users, TrendingUp, Zap, Database, CheckCircle2, Plus,
  Layers, Phone, Clock,
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

const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  total_donors: <Users className="w-4 h-4 text-cyan-400" />,
  gold_donors: <Zap className="w-4 h-4 text-yellow-400" />,
  silver_donors: <Zap className="w-4 h-4 text-slate-300" />,
  gold_cell_phones: <Phone className="w-4 h-4 text-violet-400" />,
  silver_cell_phones: <Phone className="w-4 h-4 text-violet-300" />,
  gold_addresses: <MapPin className="w-4 h-4 text-emerald-400" />,
  silver_addresses: <MapPin className="w-4 h-4 text-emerald-300" />,
};

function formatCompact(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

/** Quick-add button for top district cards in sidebar */
function QuickAddButton({ district, product }: {
  district: { cd_code: string; state_code: string; total_donors: number };
  product: { id: string } | undefined;
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
        <><CheckCircle2 className="w-3 h-3" /> Added to request</>
      ) : (
        <><Plus className="w-3 h-3" /> Add to quote request</>
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

  const { data: issues } = useIssues();
  const publishedIssues = useMemo(() => (issues ?? []).filter(i => i.is_published), [issues]);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);

  // Auto-select first published issue
  useEffect(() => {
    if (!activeIssueId && publishedIssues.length > 0) {
      setActiveIssueId(publishedIssues[0].id);
    }
  }, [publishedIssues, activeIssueId]);

  const issueIds = activeIssueId ? [activeIssueId] : [];
  const { data: issueStates } = useIssueDonorStates(issueIds);
  const { data: issueDistricts } = useIssueDonorDistricts(issueIds);

  const issueStats = useMemo(() => {
    if (!issueStates?.length) return null;
    const totals = issueStates.reduce((acc, s) => ({
      total_donors: acc.total_donors + (s.total_donors || 0),
      gold_donors: acc.gold_donors + (s.gold_donors || 0),
      silver_donors: acc.silver_donors + (s.silver_donors || 0),
      gold_cell_phones: acc.gold_cell_phones + (s.gold_cell_phones || 0),
      silver_cell_phones: acc.silver_cell_phones + (s.silver_cell_phones || 0),
      gold_addresses: acc.gold_addresses + (s.gold_addresses || 0),
      silver_addresses: acc.silver_addresses + (s.silver_addresses || 0),
      district_count: acc.district_count + (s.district_count || 0),
    }), {
      total_donors: 0, gold_donors: 0, silver_donors: 0,
      gold_cell_phones: 0, silver_cell_phones: 0,
      gold_addresses: 0, silver_addresses: 0, district_count: 0,
    });
    return { ...totals, state_count: issueStates.length };
  }, [issueStates]);

  const topDistricts = useMemo(() => {
    if (!issueDistricts?.length) return [];
    return [...issueDistricts]
      .sort((a, b) => (b.total_donors || 0) - (a.total_donors || 0))
      .slice(0, 5);
  }, [issueDistricts]);

  const { data: products } = useDataProducts();

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
      return data && data.length > 1 ? data[1].created_at : null;
    },
    enabled: !!user?.id,
    staleTime: 60 * 60 * 1000,
  });

  const { shouldShowTour, completeTour } = useTourStatus();
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    if (shouldShowTour) {
      const timer = setTimeout(() => setShowTour(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTour]);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'there';
  const initial = (profile?.full_name || user?.email || '?').charAt(0).toUpperCase();

  const isNewUser = (orders?.length ?? 0) === 0 && cartCount === 0 && (savedRegions?.length ?? 0) === 0;

  // Default product for quick-add (first active product, fallback)
  const quickAddProduct = products?.[0];

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const activeIssue = publishedIssues.find(i => i.id === activeIssueId);

  return (
    <div className="min-h-screen bg-[hsl(0_0%_5.5%)]">
      <link rel="prefetch" href="/geojson/us-states.json" as="fetch" crossOrigin="anonymous" />
      <link rel="prefetch" href={`${supabaseUrl}/storage/v1/object/public/geojson/congressional-districts-119.json`} as="fetch" crossOrigin="anonymous" />
      <link rel="prefetch" href="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" as="fetch" crossOrigin="anonymous" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[hsl(0_0%_7.5%)]/40 backdrop-blur-2xl border-b border-white/[0.04] shadow-[0_0_20px_hsl(var(--primary)/0.05)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-icon.png" alt="CDS" className="h-7 w-7 rounded-md" />
            <span className="font-display text-sm font-semibold text-foreground hidden sm:inline">Campaign Data Solutions</span>
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
        <main className="flex-1 min-w-0 space-y-8">
          {/* Welcome */}
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
              Welcome back, {displayName}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-muted-foreground text-sm">Issue-based donor intelligence, district by district.</p>
              {lastVisit && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 bg-white/[0.03] px-2 py-0.5 rounded-full">
                  <Clock className="w-3 h-3" />
                  Last visit {formatDistanceToNow(new Date(lastVisit), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>

          {/* Issue selector */}
          {publishedIssues.length > 0 && (
            <div className="flex items-center gap-3">
              <Layers className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Active issue:</span>
              <Select value={activeIssueId ?? undefined} onValueChange={setActiveIssueId}>
                <SelectTrigger className="w-[260px] surgical-glass border-white/[0.06]">
                  <SelectValue placeholder="Select an issue" />
                </SelectTrigger>
                <SelectContent>
                  {publishedIssues.map(issue => (
                    <SelectItem key={issue.id} value={issue.id}>{issue.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Full-width National Overview Map */}
          <div data-tour="mini-map">
            <HomeMiniMap issueId={activeIssueId} issueName={activeIssue?.name} />
          </div>

          <AnnouncementBanner />

          {isNewUser ? (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.06] to-transparent">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Map className="w-6 h-6 text-primary" />
                  </div>
                  <div className="space-y-3">
                    <h2 className="font-display text-lg font-semibold text-foreground">Get Started with the Issue Map</h2>
                    <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                      <li>Pick the issue your campaign is built around</li>
                      <li>Identify your strongest districts on the map</li>
                      <li>Add audiences and submit a quote request</li>
                    </ol>
                    <Button onClick={() => navigate('/map')} className="mt-2">
                      Open the Issue Map <ArrowRight className="w-4 h-4 ml-2" />
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
                    <p className="text-label-xs text-muted-foreground">Quote Requests</p>
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
                    <p className="text-label-xs text-muted-foreground">Items in Request</p>
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

          {/* National Snapshot — issue-driven */}
          <section data-tour="national-stats">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                National Snapshot {activeIssue && <span className="text-foreground/80 normal-case tracking-normal">— {activeIssue.name}</span>}
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <Card className="surgical-glass border-white/[0.06] border-t-2 border-t-cyan-500/30">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">Total Donors</p>
                    <p className="text-lg font-bold text-foreground">{formatCompact(issueStats?.total_donors)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="surgical-glass border-white/[0.06] border-t-2 border-t-yellow-500/30">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">Gold Donors</p>
                    <p className="text-lg font-bold text-foreground">{formatCompact(issueStats?.gold_donors)}</p>
                    <p className="text-[10px] text-yellow-400/80">High-value tier</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="surgical-glass border-white/[0.06] border-t-2 border-t-slate-400/30">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-slate-500/10 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-slate-300" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">Silver Donors</p>
                    <p className="text-lg font-bold text-foreground">{formatCompact(issueStats?.silver_donors)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="surgical-glass border-white/[0.06] border-t-2 border-t-violet-500/30">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">Cell Phones</p>
                    <p className="text-lg font-bold text-foreground">{formatCompact((issueStats?.gold_cell_phones ?? 0) + (issueStats?.silver_cell_phones ?? 0))}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="surgical-glass border-white/[0.06] border-t-2 border-t-emerald-500/30">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-label-xs text-muted-foreground">Districts Covered</p>
                    <p className="text-lg font-bold text-foreground">{issueStats?.district_count ?? '—'}</p>
                    <p className="text-[10px] text-muted-foreground/80">of 435</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Audiences Catalog */}
          {products && products.length > 0 && (
            <section data-tour="data-products">
              <h2 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Available Audiences
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map(product => {
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

                        {product.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{product.description}</p>
                        )}

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
                            <MapPin className="w-3 h-3 mr-1.5" /> Select Districts on Map
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
                  <p className="font-display text-lg font-semibold text-foreground">Open the Issue Map</p>
                  <p className="text-sm text-muted-foreground">See which districts care about the issues you campaign on</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>

          {/* Recent Quote Requests */}
          {recentOrders.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-3">Recent Quote Requests</h2>
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
            <YourRegionsWidget regions={savedRegions!} issueId={activeIssueId} />
          )}
        </main>

        {/* Right Sidebar — Top Districts for Active Issue */}
        <aside className="w-full lg:w-80 shrink-0">
          <div className="lg:sticky lg:top-[72px] space-y-4">
            <div className="surgical-glass border border-white/[0.06] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h2 className="font-display text-sm font-semibold text-foreground uppercase tracking-wider">
                  Top Districts
                </h2>
              </div>
              <p className="text-[11px] text-muted-foreground mb-4">
                {activeIssue ? `Strongest districts on ${activeIssue.name}` : 'Pick an issue to see top districts'}
              </p>

              {topDistricts.length > 0 ? (
                <div className="space-y-3">
                  {topDistricts.map(d => (
                    <div
                      key={d.cd_code}
                      className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.10] transition-colors cursor-pointer"
                      onClick={() => navigate(`/map?region=${d.cd_code}&type=district&issue=${activeIssueId ?? ''}`)}
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
                      <QuickAddButton district={d} product={quickAddProduct} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {activeIssue ? 'No district data yet for this issue.' : 'No published issues available.'}
                </p>
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
            <RecommendedDistricts issueId={activeIssueId} />
          </div>
        </aside>
      </div>

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
