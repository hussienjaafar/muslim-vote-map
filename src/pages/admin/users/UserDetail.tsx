import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ArrowLeft, Shield, ShieldOff, Phone, Building2, Calendar, MapPin, ShoppingCart, Mail, Ban, UserCheck, Trash2, LogIn, Activity } from 'lucide-react';
import { useState } from 'react';

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isSelf = currentUser?.id === userId;

  const { data: profile, isLoading } = useQuery({
    queryKey: ['admin-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: userRoles } = useQuery({
    queryKey: ['admin-user-roles', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('*').eq('user_id', userId!);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: orders } = useQuery({
    queryKey: ['admin-user-orders', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('data_orders').select('*').eq('user_id', userId!).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: savedRegions } = useQuery({
    queryKey: ['admin-user-regions', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('saved_regions').select('*').eq('user_id', userId!).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: cartItems } = useQuery({
    queryKey: ['admin-user-cart', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('data_cart_items').select('*, data_products(name, price_per_record)').eq('user_id', userId!);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: loginHistory } = useQuery({
    queryKey: ['admin-user-logins', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_activity_log')
        .select('*')
        .eq('user_id', userId!)
        .eq('event_type', 'login')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: recentActivity } = useQuery({
    queryKey: ['admin-user-activity', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_activity_log')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const isAdmin = userRoles?.some(r => r.role === 'admin') ?? false;
  const isSuspended = !!(profile as any)?.suspended;

  const toggleAdmin = useMutation({
    mutationFn: async () => {
      if (isAdmin) {
        const { error } = await supabase.from('user_roles').delete().eq('user_id', userId!).eq('role', 'admin');
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_roles').insert({ user_id: userId!, role: 'admin' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-user-roles', userId] });
      qc.invalidateQueries({ queryKey: ['admin-all-roles'] });
      toast.success(isAdmin ? 'Admin role revoked' : 'Admin role granted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_delete_user', { target_user_id: userId! });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('User permanently deleted');
      navigate('/admin/users');
    },
    onError: (e: Error) => { toast.error(e.message); setShowDeleteDialog(false); },
  });

  const toggleSuspend = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({
          suspended: !isSuspended,
          suspended_at: new Date().toISOString(),
          suspended_by: currentUser?.id,
        } as any)
        .eq('id', userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-profile', userId] });
      qc.invalidateQueries({ queryKey: ['admin-profiles'] });
      toast.success(isSuspended ? 'User unsuspended' : 'User suspended');
      setShowSuspendDialog(false);
    },
    onError: (e: Error) => { toast.error(e.message); setShowSuspendDialog(false); },
  });

  if (isLoading) {
    return <div className="p-6 lg:p-10"><p className="text-muted-foreground text-center py-12">Loading user...</p></div>;
  }

  if (!profile) {
    return <div className="p-6 lg:p-10"><p className="text-muted-foreground text-center py-12">User not found</p></div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 space-y-6 sm:space-y-8">
      <button
        onClick={() => navigate('/admin/users')}
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-[10px] font-bold uppercase tracking-[0.15em]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Users
      </button>

      {/* Profile Card */}
      <div className="surgical-glass p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div className="flex items-start gap-4 flex-1">
          <Avatar className="h-14 w-14">
            <AvatarFallback className={`text-lg font-display ${isSuspended ? 'bg-destructive/20 text-destructive' : 'bg-blue-500/20 text-blue-400'}`}>
              {getInitials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-semibold font-display text-foreground">{profile.full_name || 'Unnamed User'}</h2>
              {isAdmin ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-blue-500/20 text-blue-400 border-blue-500/30">Admin</span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-white/5 text-muted-foreground border-white/10">User</span>
              )}
              {isSuspended && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-red-500/20 text-red-400 border-red-500/30">Suspended</span>
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {profile.email && (
                <span className="flex items-center gap-1.5 min-w-0"><Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{profile.email}</span></span>
              )}
              {profile.organization && (
                <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {profile.organization}</span>
              )}
              {profile.phone && (
                <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {profile.phone}</span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Joined {format(new Date(profile.created_at), 'MMM d, yyyy')}
              </span>
              {isSuspended && (profile as any).suspended_at && (
                <span className="flex items-center gap-1.5 text-red-400">
                  <Ban className="h-3.5 w-3.5" /> Suspended {format(new Date((profile as any).suspended_at), 'MMM d, yyyy')}
                </span>
              )}
            </div>
          </div>
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <button
              onClick={() => setShowDeleteDialog(true)}
              disabled={isSelf || deleteUser.isPending}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] text-[10px] font-bold uppercase tracking-[0.15em] rounded-sm transition-colors disabled:opacity-50 text-red-400 border border-[rgba(255,255,255,0.08)] hover:bg-red-600/10"
              title={isSelf ? 'Cannot delete your own account' : undefined}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete User
            </button>
            <button
              onClick={() => setShowSuspendDialog(true)}
              disabled={toggleSuspend.isPending}
              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] text-[10px] font-bold uppercase tracking-[0.15em] rounded-sm transition-colors disabled:opacity-50 ${
                isSuspended
                  ? 'text-emerald-400 border border-[rgba(255,255,255,0.08)] hover:bg-emerald-600/10'
                  : 'text-red-400 border border-[rgba(255,255,255,0.08)] hover:bg-red-600/10'
              }`}
            >
              {isSuspended ? <><UserCheck className="h-3.5 w-3.5" /> Unsuspend</> : <><Ban className="h-3.5 w-3.5" /> Suspend</>}
            </button>
            <button
              onClick={() => toggleAdmin.mutate()}
              disabled={toggleAdmin.isPending}
              className={`col-span-2 inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] text-[10px] font-bold uppercase tracking-[0.15em] rounded-sm transition-colors disabled:opacity-50 ${
                isAdmin
                  ? 'text-red-400 border border-[rgba(255,255,255,0.08)] hover:bg-red-600/10'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isAdmin ? <><ShieldOff className="h-3.5 w-3.5" /> Revoke Admin</> : <><Shield className="h-3.5 w-3.5" /> Grant Admin</>}
            </button>
          </div>
        </div>
      </div>

      {/* Orders Section */}
      <div className="surgical-glass">
        <div className="p-4 border-b border-white/5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground font-display">
            Orders ({orders?.length ?? 0})
          </h3>
        </div>
        {orders && orders.length > 0 ? (
          <div className="overflow-x-auto"><Table>
            <TableHeader>
              <TableRow className="border-b border-white/5 hover:bg-transparent">
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Date</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Status</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Total</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Delivery Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map(o => (
                <TableRow key={o.id} className="border-b border-white/5 hover:bg-[#1c1c1e] transition-colors">
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(o.created_at), 'MMM d, yyyy')}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      o.status === 'fulfilled' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                      o.status === 'pending' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                      'bg-white/5 text-muted-foreground border-white/10'
                    }`}>
                      {o.status}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums text-foreground">${((o.total_amount ?? 0) / 100).toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{o.delivery_email || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></div>
        ) : (
          <div className="py-8 text-center"><p className="text-sm text-muted-foreground">No orders yet</p></div>
        )}
      </div>

      {/* Saved Regions Section */}
      <div className="surgical-glass p-6">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground font-display flex items-center gap-2 mb-4">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Saved Regions ({savedRegions?.length ?? 0})
        </h3>
        {savedRegions && savedRegions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {savedRegions.map(r => (
              <span key={r.id} className="inline-flex items-center px-3 py-1 rounded-sm text-xs border border-[rgba(255,255,255,0.08)] text-muted-foreground bg-white/5">
                {r.region_name || r.region_code} <span className="text-muted-foreground/60 ml-1">({r.region_type})</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No saved regions</p>
        )}
      </div>

      {/* Cart Section */}
      <div className="surgical-glass">
        <div className="p-4 border-b border-white/5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground font-display flex items-center gap-2">
            <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" /> Cart Items ({cartItems?.length ?? 0})
          </h3>
        </div>
        {cartItems && cartItems.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/5 hover:bg-transparent">
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Product</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Region</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Records</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cartItems.map(item => (
                <TableRow key={item.id} className="border-b border-white/5 hover:bg-[#1c1c1e] transition-colors">
                  <TableCell className="font-medium text-foreground">{(item as any).data_products?.name ?? item.product_id}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{item.geo_name || item.geo_code} ({item.geo_type})</TableCell>
                  <TableCell className="tabular-nums">{item.record_count?.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="py-8 text-center"><p className="text-sm text-muted-foreground">Cart is empty</p></div>
        )}
      </div>

      {/* Login History Section */}
      <div className="surgical-glass">
        <div className="p-4 border-b border-white/5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground font-display flex items-center gap-2">
            <LogIn className="h-3.5 w-3.5 text-muted-foreground" /> Login History ({loginHistory?.length ?? 0})
          </h3>
        </div>
        {loginHistory && loginHistory.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/5 hover:bg-transparent">
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Date & Time</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Location</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loginHistory.map((l: any) => (
                <TableRow key={l.id} className="border-b border-white/5 hover:bg-[#1c1c1e] transition-colors">
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(l.created_at), 'MMM d, yyyy HH:mm:ss')}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {[l.city, l.region, l.country].filter(Boolean).join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{l.ip_address || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="py-8 text-center"><p className="text-sm text-muted-foreground">No login history</p></div>
        )}
      </div>

      {/* Recent Activity Section */}
      <div className="surgical-glass">
        <div className="p-4 border-b border-white/5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground font-display flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" /> Recent Activity ({recentActivity?.length ?? 0})
          </h3>
        </div>
        {recentActivity && recentActivity.length > 0 ? (
          <div className="divide-y divide-white/5">
            {recentActivity.map((a: any) => (
              <div key={a.id} className="px-5 py-3 flex items-center gap-4">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm ${
                  a.event_type === 'login' ? 'bg-blue-500/20 text-blue-400' :
                  a.event_type === 'add_to_cart' ? 'bg-amber-500/20 text-amber-400' :
                  a.event_type === 'submit_order' ? 'bg-emerald-500/20 text-emerald-400' :
                  'bg-white/5 text-muted-foreground'
                }`}>
                  {a.event_type.replace(/_/g, ' ')}
                </span>
                <span className="text-xs text-muted-foreground flex-1 truncate">
                  {a.metadata && Object.keys(a.metadata).length > 0
                    ? Object.entries(a.metadata).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')
                    : '—'}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
                  {[a.city, a.region].filter(Boolean).join(', ') && (
                    <><MapPin className="w-3 h-3" /> {[a.city, a.region].filter(Boolean).join(', ')} · </>
                  )}
                  {format(new Date(a.created_at), 'MMM d, HH:mm')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center"><p className="text-sm text-muted-foreground">No activity recorded</p></div>
        )}
      </div>

      {/* Suspend Confirmation Dialog */}
      <AlertDialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isSuspended ? 'Unsuspend User' : 'Suspend User'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isSuspended
                ? `Are you sure you want to unsuspend ${profile.full_name || 'this user'}? They will regain access to their account.`
                : `Are you sure you want to suspend ${profile.full_name || 'this user'}? They will be signed out and unable to access their account.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={isSuspended ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
              onClick={() => toggleSuspend.mutate()}
            >
              {isSuspended ? 'Unsuspend' : 'Suspend'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{profile.full_name || 'this user'}</strong>? This will remove their account, profile, orders, cart, saved regions, and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUser.mutate()}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
