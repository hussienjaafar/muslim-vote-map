import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, XCircle, User, Package, Mail, StickyNote, Zap } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

const STATUS_STYLES: Record<string, string> = {
  fulfilled: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  paid: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const STATUS_ACCENT: Record<string, string> = {
  fulfilled: 'border-l-emerald-500',
  paid: 'border-l-blue-500',
  cancelled: 'border-l-red-500',
  pending: 'border-l-amber-500',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${STATUS_STYLES[status] ?? 'bg-white/5 text-muted-foreground border-white/10'}`}>
      {status}
    </span>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <h3 className="text-label-xs text-muted-foreground">{label}</h3>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  // Fetch order + profile
  const { data: order, isLoading } = useQuery({
    queryKey: ['admin-order-detail', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_orders')
        .select('*')
        .eq('id', orderId!)
        .single();
      if (error) throw error;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name, organization')
        .eq('id', data.user_id)
        .single();

      return { ...data, profile: profile ?? null };
    },
    enabled: !!orderId,
  });

  // Fetch order items
  const { data: items } = useQuery({
    queryKey: ['admin-order-items', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_order_items')
        .select('*, data_products(name)')
        .eq('order_id', orderId!);
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
  });

  // Local state
  const [notes, setNotes] = useState<string | null>(null);
  const [deliveryEmail, setDeliveryEmail] = useState<string | null>(null);

  const currentNotes = notes ?? (order as any)?.admin_notes ?? '';
  const currentDeliveryEmail = deliveryEmail ?? order?.delivery_email ?? order?.profile?.email ?? '';

  // Mutations
  const fulfill = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('data_orders').update({
        status: 'fulfilled',
        fulfilled_at: new Date().toISOString(),
      }).eq('id', orderId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-order-detail', orderId] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success('Order fulfilled');
      const recipientEmail = order?.delivery_email || order?.profile?.email;
      if (recipientEmail) {
        supabase.functions.invoke('notify-admins', {
          body: { type: 'order_fulfilled', data: { recipientEmail, userName: (order?.profile as any)?.full_name, orderId, itemCount: items?.length ?? 0 } },
        }).catch(() => {});
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('data_orders').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: user?.id,
      } as any).eq('id', orderId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-order-detail', orderId] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success('Order cancelled');
      const recipientEmail = order?.delivery_email || order?.profile?.email;
      if (recipientEmail) {
        supabase.functions.invoke('notify-admins', {
          body: { type: 'order_cancelled', data: { recipientEmail, userName: (order?.profile as any)?.full_name, orderId, adminNotes: (order as any)?.admin_notes } },
        }).catch(() => {});
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNotes = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase.from('data_orders').update({ admin_notes: value } as any).eq('id', orderId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-order-detail', orderId] });
      toast.success('Notes saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDeliveryEmail = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase.from('data_orders').update({ delivery_email: value }).eq('id', orderId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-order-detail', orderId] });
      toast.success('Delivery email saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Computed total
  const total = items?.reduce((sum, it) => sum + (it.record_count ?? 0) * Number(it.unit_price ?? 0), 0) ?? 0;
  const totalRecords = items?.reduce((sum, it) => sum + (it.record_count ?? 0), 0) ?? 0;

  if (isLoading) {
    return (
      <div className="p-6 lg:p-10">
        <p className="text-sm text-muted-foreground">Loading order...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 lg:p-10">
        <p className="text-sm text-muted-foreground">Order not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/admin/orders')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Orders
        </Button>
      </div>
    );
  }

  const profile = order.profile as { id: string; email: string | null; full_name: string | null; organization: string | null } | null;

  return (
    <div className="p-4 sm:p-6 lg:p-10 space-y-6 sm:space-y-8 max-w-4xl">
      {/* Back link */}
      <button
        onClick={() => navigate('/admin/orders')}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Orders
      </button>

      {/* Header — with status accent left border */}
      <div className={`surgical-glass p-6 space-y-3 border-l-[3px] ${STATUS_ACCENT[order.status] ?? 'border-l-muted'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground tracking-tight">
              Order <span className="font-mono text-lg">{order.id.slice(0, 8)}...</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Created {format(new Date(order.created_at), 'MMMM d, yyyy \'at\' h:mm a')}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {/* Customer info */}
      <div className="surgical-glass p-6 space-y-4">
        <SectionHeader icon={User} label="Customer" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Name</p>
            <p className="text-foreground font-medium">{profile?.full_name ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Email</p>
            <p className="text-foreground font-medium">{profile?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Organization</p>
            <p className="text-foreground font-medium">{profile?.organization ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Order items */}
      <div className="surgical-glass overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <SectionHeader icon={Package} label="Order Items" />
        </div>
        {!items?.length ? (
          <div className="px-6 pb-6">
            <p className="text-xs text-muted-foreground">No items.</p>
          </div>
        ) : (
          <div className="overflow-x-auto"><Table>
            <TableHeader>
              <TableRow className="border-b border-white/5 hover:bg-transparent">
                <TableHead className="text-label-xs text-muted-foreground">Product</TableHead>
                <TableHead className="text-label-xs text-muted-foreground">Issue</TableHead>
                <TableHead className="text-label-xs text-muted-foreground">Region</TableHead>
                <TableHead className="text-label-xs text-muted-foreground text-right">Records</TableHead>
                <TableHead className="text-label-xs text-muted-foreground text-right">Unit Price</TableHead>
                <TableHead className="text-label-xs text-muted-foreground text-right">Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it, idx) => {
                const lineTotal = (it.record_count ?? 0) * Number(it.unit_price ?? 0);
                return (
                  <TableRow key={it.id} className={`border-b border-white/5 ${idx % 2 === 1 ? 'bg-white/[0.02]' : ''}`}>
                    <TableCell className="text-sm text-foreground font-medium">{(it as any).data_products?.name ?? it.product_id}</TableCell>
                    <TableCell className="text-sm text-foreground">{(it as any).issue_name ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{it.geo_name || it.geo_code} ({it.geo_type})</TableCell>
                    <TableCell className="text-sm text-foreground tabular-nums text-right">{it.record_count?.toLocaleString() ?? 0}</TableCell>
                    <TableCell className="text-sm text-foreground tabular-nums text-right">${Number(it.unit_price ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-foreground tabular-nums text-right font-medium">${lineTotal.toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
              {/* Total row */}
              <TableRow className="border-t border-white/10 hover:bg-transparent">
                <TableCell colSpan={5} className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Total</TableCell>
                <TableCell className="text-right text-lg font-bold text-primary tabular-nums">${total.toFixed(2)}</TableCell>
              </TableRow>
            </TableBody>
          </Table></div>
        )}
      </div>

      {/* Delivery Email + Admin Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="surgical-glass p-6 space-y-3">
          <SectionHeader icon={Mail} label="Delivery Email" />
          <Input
            value={currentDeliveryEmail}
            onChange={e => setDeliveryEmail(e.target.value)}
            onBlur={() => {
              const val = deliveryEmail;
              if (val !== null && val !== (order.delivery_email ?? order.profile?.email ?? '')) {
                saveDeliveryEmail.mutate(val);
              }
            }}
            placeholder="Email for delivery..."
            className="bg-muted border-[rgba(255,255,255,0.08)]"
          />
        </div>

        <div className="surgical-glass p-6 space-y-3">
          <SectionHeader icon={StickyNote} label="Admin Notes" />
          <Textarea
            value={currentNotes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== null && notes !== ((order as any).admin_notes ?? '')) {
                saveNotes.mutate(notes);
              }
            }}
            placeholder="Internal notes about this order..."
            className="resize-none min-h-[60px] bg-muted border-[rgba(255,255,255,0.08)]"
            rows={3}
          />
        </div>
      </div>

      {/* Action buttons — grouped card */}
      {order.status === 'pending' && (
        <div className="surgical-glass p-6 space-y-4">
          <SectionHeader icon={Zap} label="Actions" />
          <div className="flex gap-3">
            <Button
              onClick={() => fulfill.mutate()}
              disabled={fulfill.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {fulfill.isPending ? 'Fulfilling...' : 'Fulfill Order'}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="bg-red-600 hover:bg-red-700 text-white font-bold">
                  <XCircle className="h-4 w-4 mr-2" /> Cancel Order
                </Button>
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
                    onClick={() => cancel.mutate()}
                  >
                    Cancel Order
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </div>
  );
}