import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CheckCircle, Download, ChevronDown, ChevronUp, XCircle, Search, Clock, PackageCheck, Ban } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useAdminOrders() {
  return useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from('data_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Fetch profiles for all user_ids
      const userIds = [...new Set(orders.map(o => o.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));
      return orders.map(o => ({ ...o, profile: profileMap.get(o.user_id) ?? null }));
    },
  });
}

function useOrderItems(orderId: string | null) {
  return useQuery({
    queryKey: ['admin-order-items', orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from('data_order_items')
        .select('*, data_products(name)')
        .eq('order_id', orderId);
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATUS_STYLES: Record<string, string> = {
  fulfilled: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  paid: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${STATUS_STYLES[status] ?? 'bg-white/5 text-muted-foreground border-white/10'}`}>
      {status}
    </span>
  );
}

function computeItemsTotal(items: Array<{ record_count: number | null; unit_price: number | null }>) {
  return items.reduce((sum, it) => sum + (it.record_count ?? 0) * Number(it.unit_price ?? 0), 0);
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function OrdersPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: orders, isLoading } = useAdminOrders();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: items } = useOrderItems(expandedId);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Local admin notes state keyed by order id
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});

  // Filtered orders
  const filtered = useMemo(() => {
    if (!orders) return [];
    return orders.filter(o => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const email = o.profile?.email?.toLowerCase() ?? '';
        const name = o.profile?.full_name?.toLowerCase() ?? '';
        if (!o.id.toLowerCase().includes(q) && !email.includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, search]);

  // Clear selection on filter change
  const handleSearchChange = useCallback((v: string) => { setSearch(v); setExpandedId(null); }, []);
  const handleStatusChange = useCallback((v: string) => { setStatusFilter(v); setExpandedId(null); }, []);

  /* --- Mutations --- */

  const fulfill = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.from('data_orders').update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: (_data, orderId) => {
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success('Order fulfilled');
      const o = orders?.find(x => x.id === orderId);
      if (o) {
        const recipientEmail = o.delivery_email || o.profile?.email;
        if (recipientEmail) {
          supabase.functions.invoke('notify-admins', {
            body: { type: 'order_fulfilled', data: { recipientEmail, userName: o.profile?.full_name, orderId, itemCount: itemCounts[orderId] ?? 0 } },
          }).catch(() => {});
        }
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.from('data_orders').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user?.id,
      } as any).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: (_data, orderId) => {
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success('Order cancelled');
      const o = orders?.find(x => x.id === orderId);
      if (o) {
        const recipientEmail = o.delivery_email || o.profile?.email;
        if (recipientEmail) {
          supabase.functions.invoke('notify-admins', {
            body: { type: 'order_cancelled', data: { recipientEmail, userName: o.profile?.full_name, orderId, adminNotes: (o as any).admin_notes } },
          }).catch(() => {});
        }
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNotes = useMutation({
    mutationFn: async ({ orderId, notes }: { orderId: string; notes: string }) => {
      const { error } = await supabase.from('data_orders').update({ admin_notes: notes } as any).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-orders'] }); toast.success('Notes saved'); },
    onError: (e: Error) => toast.error(e.message),
  });

  /* --- Export --- */

  const exportCsv = () => {
    if (!orders?.length) return;
    const header = 'ID,Status,Amount,Email,Created,Fulfilled\n';
    const rows = orders.map(o => {
      return `${o.id},${o.status},${o.total_amount ?? 0},${o.profile?.email ?? ''},${o.created_at},${o.fulfilled_at ?? ''}`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'orders.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  /* --- Computed item counts per order --- */
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});

  // Fetch item counts for visible orders
  useMemo(() => {
    if (!filtered?.length) return;
    const ids = filtered.map(o => o.id);
    supabase
      .from('data_order_items')
      .select('order_id, record_count, unit_price')
      .in('order_id', ids)
      .then(({ data }) => {
        if (!data) return;
        const counts: Record<string, number> = {};
        const totals: Record<string, number> = {};
        data.forEach(item => {
          counts[item.order_id] = (counts[item.order_id] ?? 0) + 1;
          totals[item.order_id] = (totals[item.order_id] ?? 0) + (item.record_count ?? 0) * Number(item.unit_price ?? 0);
        });
        setItemCounts(counts);
        setCalcTotals(totals);
      });
  }, [filtered]);

  const [calcTotals, setCalcTotals] = useState<Record<string, number>>({});

  // Summary counts
  const statusCounts = useMemo(() => {
    if (!orders) return { total: 0, pending: 0, fulfilled: 0, cancelled: 0 };
    return {
      total: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      fulfilled: orders.filter(o => o.status === 'fulfilled').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
    };
  }, [orders]);

  const statCards = [
    { label: 'Total', value: statusCounts.total, icon: PackageCheck, accent: 'text-foreground', filterValue: 'all' },
    { label: 'Pending', value: statusCounts.pending, icon: Clock, accent: 'text-amber-400', filterValue: 'pending' },
    { label: 'Fulfilled', value: statusCounts.fulfilled, icon: CheckCircle, accent: 'text-emerald-400', filterValue: 'fulfilled' },
    { label: 'Cancelled', value: statusCounts.cancelled, icon: Ban, accent: 'text-red-400', filterValue: 'cancelled' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-10 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-foreground tracking-tight">Orders</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">Order management and fulfillment tracking.</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!orders?.length}
          className="inline-flex items-center gap-2 px-4 py-2 text-label-xs border border-[rgba(255,255,255,0.08)] bg-transparent text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors rounded-sm disabled:opacity-40 disabled:cursor-not-allowed self-start min-h-[40px]"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, accent, filterValue }) => {
          const isActive = statusFilter === filterValue;
          return (
            <button
              key={label}
              onClick={() => handleStatusChange(filterValue)}
              className={`surgical-glass p-4 flex items-center gap-3 text-left transition-all cursor-pointer ${isActive ? 'ring-1 ring-primary/50 bg-white/[0.03]' : 'hover:bg-white/[0.02]'}`}
            >
              <div className={`p-2 rounded-md bg-white/[0.04] ${accent}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-stat-hero">{value}</p>
                <p className="text-label-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by email, name, or order ID..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full sm:w-[160px] h-10 bg-muted border-[rgba(255,255,255,0.08)]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="fulfilled">Fulfilled</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="surgical-glass">
        {isLoading ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Loading orders...</p>
          </div>
        ) : !filtered?.length ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{search || statusFilter !== 'all' ? 'No orders match your filters.' : 'No orders yet.'}</p>
          </div>
        ) : (
          <>
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-white/5">
            {filtered.map((o) => {
              const profile = o.profile;
              const total = calcTotals[o.id] ?? Number(o.total_amount ?? 0);
              const count = itemCounts[o.id] ?? 0;
              return (
                <div key={o.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => navigate(`/admin/orders/${o.id}`)}
                      className="font-mono text-xs text-blue-400 hover:underline font-medium text-left"
                    >
                      {o.id.slice(0, 8)}…
                    </button>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="text-xs">
                    <div className="text-foreground font-medium truncate">{profile?.full_name ?? '—'}</div>
                    <div className="text-muted-foreground truncate">{profile?.email ?? '—'}</div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{format(new Date(o.created_at), 'MMM d, yyyy')}</span>
                    <span className="tabular-nums text-foreground font-semibold">${total.toFixed(2)}{count > 0 && <span className="text-muted-foreground font-normal"> · {count} {count === 1 ? 'item' : 'items'}</span>}</span>
                  </div>
                  {o.status === 'pending' && (
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => fulfill.mutate(o.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-sm"
                      >
                        <CheckCircle className="h-4 w-4" /> Fulfill
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded-sm">
                            <XCircle className="h-4 w-4" /> Cancel
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will mark the order as cancelled. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Order</AlertDialogCancel>
                            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => cancel.mutate(o.id)}>
                              Cancel Order
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="border-b border-white/5 hover:bg-transparent">
                <TableHead className="w-8 text-label-xs text-muted-foreground" />
                <TableHead className="text-label-xs text-muted-foreground">Order ID</TableHead>
                <TableHead className="text-label-xs text-muted-foreground">Customer</TableHead>
                <TableHead className="text-label-xs text-muted-foreground">Status</TableHead>
                <TableHead className="text-label-xs text-muted-foreground">Amount</TableHead>
                <TableHead className="text-label-xs text-muted-foreground">Created</TableHead>
                <TableHead className="text-label-xs text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o, idx) => {
                const profile = o.profile;
                const orderNotes = notesMap[o.id] ?? (o as any).admin_notes ?? '';
                const total = calcTotals[o.id] ?? Number(o.total_amount ?? 0);
                const count = itemCounts[o.id] ?? 0;

                return (
                  <React.Fragment key={o.id}>
                    <TableRow
                      className={`cursor-pointer border-b border-white/5 hover:bg-[#1c1c1e] transition-colors ${idx % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
                      onClick={() => setExpandedId(prev => prev === o.id ? null : o.id)}
                    >
                      <TableCell className="text-muted-foreground">
                        {expandedId === o.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/admin/orders/${o.id}`); }}
                            className="font-mono text-xs text-blue-400 hover:underline font-medium"
                          >
                            {o.id.slice(0, 8)}...
                          </button>
                          {count > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-white/[0.06] border-white/10 text-foreground">
                              {count} {count === 1 ? 'item' : 'items'}
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <div className="text-foreground font-medium">{profile?.full_name ?? '—'}</div>
                          <div className="text-muted-foreground">{profile?.email ?? '—'}</div>
                        </div>
                      </TableCell>
                      <TableCell><StatusBadge status={o.status} /></TableCell>
                      <TableCell className="tabular-nums text-foreground font-semibold">${total.toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(o.created_at), 'MMM d, yyyy h:mm a')}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex gap-1" onClick={e => e.stopPropagation()}>
                          {o.status === 'pending' && (
                            <>
                              <button
                                onClick={() => fulfill.mutate(o.id)}
                                className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-sm transition-colors"
                                title="Mark fulfilled"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-sm transition-colors"
                                    title="Cancel order"
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will mark the order as cancelled. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Keep Order</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 text-white hover:bg-red-700"
                                      onClick={() => cancel.mutate(o.id)}
                                    >
                                      Cancel Order
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </span>
                      </TableCell>
                    </TableRow>

                    {expandedId === o.id && (
                      <TableRow key={`${o.id}-items`} className="border-b border-white/5 hover:bg-transparent">
                        <TableCell colSpan={7} className="p-0">
                          <div className="mx-4 my-4 surgical-glass p-5 space-y-4">
                            {/* Items */}
                            {!items?.length ? (
                              <span className="text-xs text-muted-foreground">No items.</span>
                            ) : (
                              <div className="space-y-0">
                                {items.map((it, itIdx) => (
                                  <div key={it.id} className={`flex justify-between text-xs py-2.5 px-3 rounded-sm ${itIdx % 2 === 1 ? 'bg-white/[0.02]' : ''}`}>
                                    <span className="text-foreground font-medium">
                                      {(it as any).data_products?.name ?? it.product_id}
                                      <span className="text-muted-foreground ml-2 font-normal">— {it.geo_name || it.geo_code} ({it.geo_type})</span>
                                    </span>
                                    <span className="text-foreground tabular-nums">
                                      {it.record_count?.toLocaleString()} records × ${Number(it.unit_price || 0).toFixed(2)} = <span className="font-semibold">${((it.record_count ?? 0) * Number(it.unit_price ?? 0)).toFixed(2)}</span>
                                    </span>
                                  </div>
                                ))}
                                <div className="flex justify-end pt-3 mt-2 border-t border-white/[0.06]">
                                  <span className="text-sm font-bold text-primary tabular-nums">
                                    Total: ${computeItemsTotal(items).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Admin Notes */}
                            <div>
                              <label className="text-label-xs text-muted-foreground mb-1.5 block">Admin Notes</label>
                              <Textarea
                                value={orderNotes}
                                onChange={e => setNotesMap(prev => ({ ...prev, [o.id]: e.target.value }))}
                                onBlur={() => {
                                  const current = notesMap[o.id];
                                  if (current !== undefined && current !== ((o as any).admin_notes ?? '')) {
                                    saveNotes.mutate({ orderId: o.id, notes: current });
                                  }
                                }}
                                placeholder="Internal notes about this order..."
                                className="resize-none min-h-[60px] bg-muted border-[rgba(255,255,255,0.08)]"
                                rows={2}
                              />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
          </>
        )}
      </div>
    </div>
  );
}