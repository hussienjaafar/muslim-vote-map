import { useEffect, useState, useRef, useMemo, useCallback } from 'react';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity, LogIn, ShoppingCart, Bookmark, FileText, Eye, MapPin,
  Filter, Users, Globe, Loader2,
} from 'lucide-react';

const EVENT_META: Record<string, { label: string; icon: typeof LogIn; color: string; dotColor: string }> = {
  login: { label: 'Login', icon: LogIn, color: 'text-blue-400', dotColor: '#60a5fa' },
  add_to_cart: { label: 'Add to Cart', icon: ShoppingCart, color: 'text-amber-400', dotColor: '#fbbf24' },
  submit_order: { label: 'Order Submitted', icon: FileText, color: 'text-emerald-400', dotColor: '#34d399' },
  save_region: { label: 'Saved Region', icon: Bookmark, color: 'text-purple-400', dotColor: '#c084fc' },
  page_view: { label: 'Page View', icon: Eye, color: 'text-muted-foreground', dotColor: '#6b7280' },
};

function getEventMeta(type: string) {
  return EVENT_META[type] ?? { label: type, icon: Activity, color: 'text-muted-foreground', dotColor: '#6b7280' };
}

interface ActivityRow {
  id: string;
  user_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  profile?: { full_name: string | null; email: string | null } | null;
}

/* ─── US Albers-style projection (simplified) ─── */
// Maps lat/lng roughly onto a 960×600 canvas covering the continental US
function projectToUS(lat: number, lng: number, width: number, height: number): { x: number; y: number } | null {
  // Continental US bounding box (approx)
  const minLng = -125, maxLng = -66, minLat = 24, maxLat = 50;
  if (lat < minLat - 5 || lat > maxLat + 5 || lng < minLng - 10 || lng > maxLng + 10) return null;
  const x = ((lng - minLng) / (maxLng - minLng)) * width;
  const y = ((maxLat - lat) / (maxLat - minLat)) * height;
  return { x, y };
}

/* ─── GeoJSON to SVG path helpers ─── */
function geoToSvgCoords(lng: number, lat: number, W: number, H: number) {
  const minLng = -125, maxLng = -66, minLat = 24, maxLat = 50;
  const x = ((lng - minLng) / (maxLng - minLng)) * W;
  const y = ((maxLat - lat) / (maxLat - minLat)) * H;
  return { x, y };
}

function ringToPath(ring: number[][], W: number, H: number): string {
  return ring
    .map((c, i) => {
      const { x, y } = geoToSvgCoords(c[0], c[1], W, H);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ') + 'Z';
}

function featureToPath(feature: any, W: number, H: number): string {
  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    return (geom as any).coordinates.map((ring: number[][]) => ringToPath(ring, W, H)).join(' ');
  }
  if (geom.type === 'MultiPolygon') {
    return (geom as any).coordinates
      .map((polygon: number[][][]) => polygon.map((ring) => ringToPath(ring, W, H)).join(' '))
      .join(' ');
  }
  return '';
}

// Filter to continental US (exclude AK, HI, territories with coords far outside bounds)
function isContinental(feature: any): boolean {
  const name = (feature.properties?.name ?? '').toLowerCase();
  if (['alaska', 'hawaii', 'puerto rico', 'guam', 'american samoa', 'virgin islands', 'northern mariana islands'].some(t => name.includes(t))) return false;
  return true;
}

/* ─── US Map with dots ─── */
function USActivityMap({ events, activeUserIds }: { events: ActivityRow[]; activeUserIds: Set<string> }) {
  const W = 960;
  const H = 560;
  const [statePaths, setStatePaths] = useState<{ name: string; d: string }[]>([]);

  // Load GeoJSON on mount
  useEffect(() => {
    fetch('/geojson/us-states.json')
      .then((r) => r.json())
      .then((geojson) => {
        const paths = (geojson.features as any[])
          .filter((f) => f.geometry && isContinental(f))
          .map((f) => ({
            name: f.properties?.name ?? '',
            d: featureToPath(f, W, H),
          }))
          .filter((p) => p.d.length > 0);
        setStatePaths(paths);
      })
      .catch(() => {});
  }, []);

  // Group active events with coordinates by user (latest event per user)
  const dots = useMemo(() => {
    const userDots = new Map<string, { x: number; y: number; name: string; eventType: string; city: string | null; region: string | null }>();
    for (const e of events) {
      if (!activeUserIds.has(e.user_id)) continue;
      if (userDots.has(e.user_id)) continue;
      if (e.latitude == null || e.longitude == null) continue;
      const pos = projectToUS(e.latitude, e.longitude, W, H);
      if (!pos) continue;
      userDots.set(e.user_id, {
        ...pos,
        name: e.profile?.full_name || e.profile?.email || 'Unknown',
        eventType: e.event_type,
        city: e.city,
        region: e.region,
      });
    }
    return [...userDots.values()];
  }, [events, activeUserIds]);

  // All events with coords for the faded trail dots
  const trailDots = useMemo(() => {
    const seen = new Set<string>();
    return events
      .filter((e) => {
        if (e.latitude == null || e.longitude == null) return false;
        if (activeUserIds.has(e.user_id)) return false;
        const key = `${e.latitude.toFixed(1)},${e.longitude.toFixed(1)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 50)
      .map((e) => {
        const pos = projectToUS(e.latitude!, e.longitude!, W, H);
        return pos ? { ...pos, eventType: e.event_type } : null;
      })
      .filter(Boolean) as { x: number; y: number; eventType: string }[];
  }, [events, activeUserIds]);

  return (
    <div className="surgical-glass p-4 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-4 h-4 text-blue-400" />
        <span className="text-label-xs text-foreground">User Locations</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{dots.length} active on map</span>
      </div>
      <div className="relative w-full" style={{ aspectRatio: `${W}/${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
          {/* State outlines from real GeoJSON */}
          {statePaths.map((s) => (
            <path
              key={s.name}
              d={s.d}
              fill="white"
              fillOpacity={0.03}
              stroke="white"
              strokeOpacity={0.12}
              strokeWidth={0.5}
            />
          ))}

          {/* Trail dots (faded past activity) */}
          {trailDots.map((d, i) => (
            <circle
              key={`trail-${i}`}
              cx={d.x}
              cy={d.y}
              r={3}
              fill={getEventMeta(d.eventType).dotColor}
              opacity={0.15}
            />
          ))}

          {/* Active user dots */}
          {dots.map((d, i) => {
            const meta = getEventMeta(d.eventType);
            return (
              <g key={`dot-${i}`}>
                {/* Pulse ring */}
                <circle cx={d.x} cy={d.y} r={12} fill={meta.dotColor} opacity={0.1}>
                  <animate attributeName="r" values="6;16;6" dur="2.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.2;0;0.2" dur="2.5s" repeatCount="indefinite" />
                </circle>
                {/* Glow */}
                <circle cx={d.x} cy={d.y} r={6} fill={meta.dotColor} opacity={0.25} />
                {/* Core dot */}
                <circle cx={d.x} cy={d.y} r={4} fill={meta.dotColor} stroke="#0e0e0e" strokeWidth={1.5} />
                {/* Label */}
                <text x={d.x + 8} y={d.y + 3} fill="white" fontSize={9} fontFamily="inherit" opacity={0.7}>
                  {d.name.split(' ')[0]}
                  {d.city ? ` · ${d.city}` : ''}
                </text>
              </g>
            );
          })}
        </svg>
        {dots.length === 0 && trailDots.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-muted-foreground/40">No geolocated activity yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LiveActivity() {
  const [events, setEvents] = useState<ActivityRow[]>([]);
  const [filterType, setFilterType] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Initial load: last 50 events
  const { data: initialEvents, isLoading } = useQuery({
    queryKey: ['live-activity-initial'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      // Fetch profiles for these users
      const userIds = [...new Set((data ?? []).map((e: any) => e.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

      return (data ?? []).map((e: any) => ({
        ...e,
        metadata: e.metadata ?? {},
        profile: profileMap.get(e.user_id) ?? null,
      })) as ActivityRow[];
    },
    staleTime: 60_000,
  });

  // Seed from initial query
  useEffect(() => {
    if (initialEvents) setEvents(initialEvents);
  }, [initialEvents]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('live-activity')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_activity_log' },
        async (payload) => {
          const row = payload.new as any;
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', row.user_id)
            .maybeSingle();

          const newEvent: ActivityRow = {
            ...row,
            metadata: row.metadata ?? {},
            profile: profile ?? null,
          };
          setEvents((prev) => [newEvent, ...prev].slice(0, 200));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Tick every 30s so "active users" window stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Active users (last 5 min)
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const activeUsers = new Map<string, { name: string; city: string | null; region: string | null; lastSeen: string }>();
  const activeUserIds = new Set<string>();
  events.forEach((e) => {
    if (new Date(e.created_at).getTime() > fiveMinAgo && !activeUsers.has(e.user_id)) {
      activeUsers.set(e.user_id, {
        name: e.profile?.full_name || e.profile?.email || 'Unknown',
        city: e.city,
        region: e.region,
        lastSeen: e.created_at,
      });
      activeUserIds.add(e.user_id);
    }
  });

  // Location groups
  const locationGroups = new Map<string, number>();
  activeUsers.forEach((u) => {
    const loc = [u.city, u.region].filter(Boolean).join(', ') || 'Unknown';
    locationGroups.set(loc, (locationGroups.get(loc) ?? 0) + 1);
  });

  const filteredEvents = filterType ? events.filter((e) => e.event_type === filterType) : events;
  const eventTypes = [...new Set(events.map((e) => e.event_type))];

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)]">
      {/* Main feed */}
      <div className="flex-1 p-4 sm:p-6 lg:p-10 space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <Activity className="w-6 h-6 text-blue-400" />
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse border-2 border-[#0e0e0e]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground tracking-tight">
                Live Activity
              </h2>
              <p className="text-muted-foreground text-xs mt-0.5">
                {activeUsers.size} active user{activeUsers.size !== 1 ? 's' : ''} in the last 5 minutes
              </p>
            </div>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={filterType ?? ''}
              onChange={(e) => setFilterType(e.target.value || null)}
              className="flex-1 sm:flex-none bg-[#1c1b1b] border border-white/10 rounded-sm text-xs text-foreground px-2 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            >
              <option value="">All Events</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>{getEventMeta(t).label}</option>
              ))}
            </select>
          </div>
        </header>

        {/* US Map */}
        <USActivityMap events={events} activeUserIds={activeUserIds} />

        {/* Event stream */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading activity...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-20">
            <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No activity recorded yet</p>
          </div>
        ) : (
          <div ref={listRef} className="space-y-1">
            {filteredEvents.map((event, i) => {
              const meta = getEventMeta(event.event_type);
              const Icon = meta.icon;
              const location = [event.city, event.region].filter(Boolean).join(', ');
              const isNew = i === 0 && Date.now() - new Date(event.created_at).getTime() < 5000;

              return (
                <div
                  key={event.id}
                  className={`surgical-glass px-5 py-4 flex items-start gap-4 transition-all duration-500 ${
                    isNew ? 'ring-1 ring-blue-500/30 bg-blue-500/5' : ''
                  }`}
                >
                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 ${meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase tracking-wider ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 mt-0.5 truncate">
                      {event.profile?.full_name || event.profile?.email || 'Unknown user'}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {location && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <MapPin className="w-3 h-3" /> {location}
                        </span>
                      )}
                      {event.metadata && Object.keys(event.metadata).length > 0 && (
                        <span className="text-[10px] text-muted-foreground/60 truncate">
                          {Object.entries(event.metadata)
                            .slice(0, 2)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' · ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap mt-1">
                    {format(new Date(event.created_at), 'HH:mm:ss')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right panel — Active Users */}
      <aside className="hidden lg:flex w-80 bg-[#131313] border-l border-white/5 flex-col">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <h4 className="text-label-xs text-foreground">Active Users</h4>
          </div>
          <p className="text-sub-label text-muted-foreground mt-1">Last 5 minutes</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeUsers.size === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">No active users</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {[...activeUsers.entries()].map(([uid, u]) => (
                <div key={uid} className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-medium text-foreground truncate">{u.name}</span>
                  </div>
                  {(u.city || u.region) && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1 ml-4">
                      <MapPin className="w-3 h-3" /> {[u.city, u.region].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Location summary */}
        {locationGroups.size > 0 && (
          <div className="p-6 border-t border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-label-xs text-muted-foreground">By Location</span>
            </div>
            <div className="space-y-2">
              {[...locationGroups.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([loc, count]) => (
                  <div key={loc} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate">{loc}</span>
                    <span className="text-xs font-bold text-foreground tabular-nums">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
