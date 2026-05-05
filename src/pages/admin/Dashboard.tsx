import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Users, ShoppingCart, DollarSign, Database, Loader2, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [profiles, orders, cartItems, states, districts] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('data_orders').select('id, total_amount, status'),
        supabase.from('data_cart_items').select('id', { count: 'exact', head: true }),
        supabase.from('voter_impact_states').select('id', { count: 'exact', head: true }),
        supabase.from('voter_impact_districts').select('id', { count: 'exact', head: true }),
      ]);

      const totalRevenue = (orders.data ?? [])
        .filter(o => o.status === 'fulfilled')
        .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

      return {
        userCount: profiles.count ?? 0,
        orderCount: orders.data?.length ?? 0,
        totalRevenue,
        pendingOrders: (orders.data ?? []).filter(o => o.status === 'pending').length,
        cartItems: cartItems.count ?? 0,
        statesLoaded: states.count ?? 0,
        districtsLoaded: districts.count ?? 0,
      };
    },
    staleTime: 30_000,
  });
}

function useRecentActivity() {
  return useQuery({
    queryKey: ['admin-recent-activity'],
    queryFn: async () => {
      const [recentProfiles, recentOrders] = await Promise.all([
        supabase.from('profiles').select('id, full_name, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('data_orders').select('id, total_amount, status, created_at').order('created_at', { ascending: false }).limit(5),
      ]);

      const items = [
        ...(recentProfiles.data ?? []).map(p => ({
          type: 'signup' as const,
          id: p.id,
          label: p.full_name || 'New user registered',
          date: p.created_at,
          link: `/admin/users/${p.id}`,
        })),
        ...(recentOrders.data ?? []).map(o => ({
          type: 'order' as const,
          id: o.id,
          label: `Order — $${(Number(o.total_amount) || 0).toFixed(2)} (${o.status})`,
          status: o.status,
          date: o.created_at,
          link: `/admin/orders/${o.id}`,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

      return items;
    },
    staleTime: 30_000,
  });
}

const KPI_CARDS = [
  { key: 'users', label: 'Total Users', icon: Users, getValue: (s: any) => s?.userCount?.toLocaleString() ?? '—', getTrend: () => 'Active' },
  { key: 'orders', label: 'Active Orders', icon: ShoppingCart, getValue: (s: any) => s?.orderCount?.toLocaleString() ?? '—', getTrend: (s: any) => s?.pendingOrders ? `${s.pendingOrders} Pending` : 'None Pending' },
  { key: 'revenue', label: 'Revenue', icon: DollarSign, getValue: (s: any) => s ? `$${s.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', getTrend: () => 'Fulfilled Orders' },
  { key: 'coverage', label: 'Data Coverage', icon: Database, getValue: (s: any) => s ? `${s.statesLoaded}/${s.districtsLoaded}` : '—', getTrend: (s: any) => s ? `${s.statesLoaded} States · ${s.districtsLoaded} Districts` : '' },
];

export default function Dashboard() {
  const { data: stats, isLoading } = useAdminStats();
  const { data: activity } = useRecentActivity();

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)]">
      {/* Main content */}
      <div className="flex-1 p-4 sm:p-6 lg:p-10 space-y-8 sm:space-y-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight">
              Executive Overview
            </h2>
            <p className="text-muted-foreground text-sm mt-2 max-w-md">
              Real-time aggregate telemetry across the national voter data network.
            </p>
          </div>
        </header>

        {/* KPI Grid */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-12">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading telemetry...
          </div>
        ) : (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {KPI_CARDS.map(card => (
              <div
                key={card.key}
                className="surgical-glass p-6 group hover:bg-[#2a2a2a] transition-all duration-500"
              >
                <div className="flex justify-between items-start mb-4">
                  <span className="text-label-xs text-muted-foreground">{card.label}</span>
                  <card.icon className="w-[18px] h-[18px] text-blue-400/50 group-hover:text-blue-400 transition-colors" />
                </div>
                <div className="text-stat-hero text-foreground">{card.getValue(stats)}</div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-sub-label text-blue-400 font-bold uppercase tracking-tighter">
                    {card.getTrend(stats)}
                  </span>
                  <div className="h-px flex-1 bg-white/5" />
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Chart Section */}
        <section className="surgical-glass p-4 sm:p-8 relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 sm:mb-8">
            <div>
              <h3 className="text-lg sm:text-xl font-display font-bold text-foreground">Voter Registration Trends</h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Cross-sectional regional variance</p>
            </div>
            <div className="flex flex-wrap gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_#93c5fd]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Registration Rate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Voter Turnout</span>
              </div>
            </div>
          </div>

          {/* Abstract Chart Visualization */}
          <div className="h-[200px] sm:h-[300px] w-full relative">
            {/* Grid lines */}
            <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 opacity-[0.03] pointer-events-none">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="border-r border-b border-white" />
              ))}
            </div>

            {/* SVG Chart Paths */}
            <svg className="absolute inset-0 w-full h-full" fill="none" viewBox="0 0 1000 300" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M0 260C100 230 150 150 250 170C350 190 400 250 500 220C600 190 650 70 750 90C850 110 900 60 1000 40"
                stroke="#93c5fd"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="drop-shadow-[0_0_8px_rgba(147,197,253,0.4)]"
              />
              <path
                d="M0 280C100 250 200 210 300 230C400 250 500 150 600 170C700 190 800 110 900 130C950 140 1000 90 1000 80"
                stroke="#fbbf24"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]"
              />
              <circle cx="250" cy="170" r="3.5" fill="#93c5fd" />
              <circle cx="750" cy="90" r="3.5" fill="#93c5fd" />
              <circle cx="500" cy="150" r="3.5" fill="#fbbf24" />
            </svg>

            {/* X Axis labels */}
            <div className="absolute bottom-0 left-0 w-full flex justify-between px-2 translate-y-5">
              {['JAN', 'MAR', 'MAY', 'JUL', 'SEP', 'NOV'].map(m => (
                <span key={m} className="text-[9px] font-bold text-muted-foreground tabular-nums">{m}</span>
              ))}
            </div>
          </div>
        </section>

        {/* Activity feed — mobile only (visible below lg) */}
        <div className="lg:hidden">
          <ActivityFeed activity={activity} />
        </div>
      </div>

      {/* Right telemetry panel — desktop only */}
      <aside className="hidden lg:flex w-80 bg-[#131313] border-l border-white/5 flex-col">
        <div className="p-6 border-b border-white/5">
          <h4 className="text-label-xs text-foreground">Recent Activity</h4>
          <p className="text-sub-label text-muted-foreground mt-1">Live event stream</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ActivityFeed activity={activity} />
        </div>
      </aside>
    </div>
  );
}

function ActivityFeed({ activity }: { activity: any[] | undefined }) {
  const navigate = useNavigate();

  if (!activity?.length) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No recent activity.</p>
      </div>
    );
  }

  return (
    <>
      {activity.map((item, i) => {
        const isSignup = item.type === 'signup';
        const typeLabel = isSignup ? 'User Signup' : 'Order';
        const orderStatus = item.status as string | undefined;
        const typeColor = isSignup
          ? 'text-blue-400'
          : orderStatus === 'cancelled'
            ? 'text-red-400'
            : orderStatus === 'fulfilled'
              ? 'text-emerald-400'
              : 'text-amber-400';
        const dotColor = isSignup
          ? 'bg-blue-400'
          : orderStatus === 'cancelled'
            ? 'bg-red-400'
            : orderStatus === 'fulfilled'
              ? 'bg-emerald-400'
              : 'bg-amber-400';
        const statusLabel = isSignup
          ? 'Registered'
          : orderStatus === 'cancelled'
            ? 'Cancelled'
            : orderStatus === 'fulfilled'
              ? 'Fulfilled'
              : 'Pending';

        return (
          <button
            key={i}
            onClick={() => navigate(item.link)}
            className="w-full text-left px-6 py-5 border-b border-white/5 hover:bg-[#201f1f] transition-colors group cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2">
              <span className={`text-label-xs font-display ${typeColor}`}>{typeLabel}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sub-label text-muted-foreground tabular-nums uppercase">
                  {format(new Date(item.date), 'HH:mm:ss')}
                </span>
                <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground group-hover:text-foreground/70 transition-colors">{item.label}</p>
            <div className="mt-3 flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${dotColor} animate-pulse`} />
              <span className={`text-sub-label font-bold uppercase tracking-tighter ${typeColor}`}>
                {statusLabel}
              </span>
            </div>
          </button>
        );
      })}
    </>
  );
}
