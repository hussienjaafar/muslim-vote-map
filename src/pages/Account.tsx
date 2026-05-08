import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  User, ShoppingBag, MapPin, ArrowLeft, Loader2, Trash2, ExternalLink,
  Shield, List, Settings, Lock, Globe, Calendar, Pencil, RotateCcw,
} from 'lucide-react';
import { formatNumber } from '@/lib/geoUtils';
import { useDataOrders, useDataOrderItems } from '@/queries/useDataProductQueries';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTourStatus } from '@/hooks/useTourStatus';

// ─── Shared hooks ───

function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user!.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
}

function useUserRole() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', user!.id);
      if (error) throw error;
      if (!data || data.length === 0) return 'user';
      if (data.some(r => r.role === 'admin')) return 'admin';
      if (data.some(r => r.role === 'moderator')) return 'moderator';
      return 'user';
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}

function useLastLogin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['last-login', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_activity_log')
        .select('created_at')
        .eq('user_id', user!.id)
        .eq('event_type', 'login')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0]?.created_at ?? null;
    },
    enabled: !!user?.id,
  });
}

// ─── Avatar helper ───

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
}

const roleBadgeStyle: Record<string, string> = {
  admin: 'bg-primary/20 text-primary border-primary/30',
  moderator: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  user: 'bg-muted text-muted-foreground border-border',
};

// ─── Profile Header ───

function ProfileHeader() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: role } = useUserRole();
  const { data: lastLogin } = useLastLogin();

  const initials = getInitials(profile?.full_name, user?.email);
  const displayName = profile?.full_name || user?.email || 'User';

  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="w-14 h-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-lg font-semibold text-primary shrink-0 shadow-[0_0_8px_hsl(var(--primary)/0.15)]">
        {initials}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-title-lg text-foreground truncate">{displayName}</h2>
          {role && (
            <Badge variant="outline" className={`text-label-xs capitalize ${roleBadgeStyle[role] ?? roleBadgeStyle.user}`}>
              {role}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-sub-label text-muted-foreground mt-0.5 flex-wrap">
          {profile?.created_at && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Member since {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            </span>
          )}
          {lastLogin && (
            <span className="flex items-center gap-1">
              <Globe className="w-3 h-3" />
              Last login {new Date(lastLogin).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Profile Tab ───

function ProfileTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile, isLoading } = useProfile();

  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [phone, setPhone] = useState('');
  const [initialized, setInitialized] = useState(false);

  if (profile && !initialized) {
    setFullName(profile.full_name ?? '');
    setOrganization(profile.organization ?? '');
    setPhone(profile.phone ?? '');
    setInitialized(true);
  }

  const updateProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() || null, organization: organization.trim() || null, phone: phone.trim() || null })
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); toast.success('Profile updated'); },
    onError: () => toast.error('Failed to update profile'),
  });

  if (isLoading) return <Spinner />;

  return (
    <Card className="surgical-glass border-[var(--surface-border)]">
      <CardHeader>
        <CardTitle className="text-title-md">Profile Settings</CardTitle>
        <CardDescription className="text-sub-label">Manage your account information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Email"><Input value={user?.email ?? ''} disabled className="bg-muted/50" /></Field>
        <Field label="Full Name"><Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" /></Field>
        <Field label="Organization"><Input value={organization} onChange={e => setOrganization(e.target.value)} placeholder="Your org" /></Field>
        <Field label="Phone"><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 123-4567" /></Field>
        <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
          {updateProfile.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Save Changes
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Security Tab ───

function SecurityTab() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sendingReset, setSendingReset] = useState(false);

  const changePassword = useMutation({
    mutationFn: async () => {
      if (!currentPassword) throw new Error('Current password is required');
      if (newPassword.length < 8) throw new Error('Password must be at least 8 characters');
      if (newPassword !== confirmPassword) throw new Error('Passwords do not match');
      // Verify current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user!.email!,
        password: currentPassword,
      });
      if (signInError) throw new Error('Current password is incorrect');
      // Now update
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Password changed successfully'); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleForgotPassword = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('Password reset code sent — check your email.');
      navigate(`/reset-password?email=${encodeURIComponent(user.email)}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSendingReset(false);
    }
  };

  const { data: loginHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['login-history', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_activity_log')
        .select('*')
        .eq('user_id', user!.id)
        .eq('event_type', 'login')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  return (
    <div className="space-y-4">
      <Card className="surgical-glass border-[var(--surface-border)]">
        <CardHeader>
          <CardTitle className="text-title-md flex items-center gap-2"><Lock className="w-4 h-4" />Change Password</CardTitle>
          <CardDescription className="text-sub-label">Update your account password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Current Password">
            <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
          </Field>
          <Field label="New Password">
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 8 characters" />
          </Field>
          <Field label="Confirm Password">
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" />
          </Field>
          {newPassword && newPassword.length < 8 && <p className="text-xs text-destructive">Must be at least 8 characters</p>}
          {confirmPassword && newPassword !== confirmPassword && <p className="text-xs text-destructive">Passwords do not match</p>}
          <Button
            onClick={() => changePassword.mutate()}
            disabled={changePassword.isPending || !currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
          >
            {changePassword.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Update Password
          </Button>
          <button
            type="button"
            className="text-sm text-primary hover:underline w-full text-center mt-1"
            onClick={handleForgotPassword}
            disabled={sendingReset}
          >
            {sendingReset ? 'Sending...' : 'Forgot your password?'}
          </button>
        </CardContent>
      </Card>

      <Card className="surgical-glass border-[var(--surface-border)]">
        <CardHeader>
          <CardTitle className="text-title-md flex items-center gap-2"><Globe className="w-4 h-4" />Login History</CardTitle>
          <CardDescription className="text-sub-label">Recent sign-in activity on your account</CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? <Spinner /> : !loginHistory?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No login history available</p>
          ) : (
            <div className="space-y-0">
              {loginHistory.map((entry, i) => (
                <div key={entry.id} className="flex items-center justify-between text-sm py-2.5">
                  <div>
                    <p className="text-foreground">{new Date(entry.created_at).toLocaleString()}</p>
                    <p className="text-sub-label text-muted-foreground mt-0.5">
                      {[entry.city, entry.region, entry.country].filter(Boolean).join(', ') || 'Location unavailable'}
                    </p>
                  </div>
                  <span className="text-stat-value text-muted-foreground font-mono">{entry.ip_address ?? '—'}</span>
                  {i < loginHistory.length - 1 && <div className="absolute left-0 right-0 bottom-0 h-px bg-white/5" />}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Orders Tab ───

function OrdersTab() {
  const { data: orders, isLoading } = useDataOrders();
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  if (isLoading) return <Spinner />;
  if (!orders?.length) {
    return <EmptyState icon={ShoppingBag} title="No orders yet" subtitle="Your requests will appear here" />;
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    paid: 'bg-blue-500/20 text-blue-400',
    fulfilled: 'bg-green-500/20 text-green-400',
    cancelled: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="space-y-3">
      {orders.map(order => (
        <Card key={order.id} className="surgical-glass border-[var(--surface-border)] hover:bg-[hsl(0_0%_16.5%)] transition-all duration-500">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">Order {order.id.slice(0, 8)}…</p>
                <p className="text-sub-label text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={statusColor[order.status] ?? 'bg-muted text-muted-foreground'}>{order.status}</Badge>
                <span className="text-stat-value text-foreground">${Number(order.total_amount ?? 0).toFixed(2)}</span>
                <Button variant="ghost" size="sm" onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>
                  {expandedOrder === order.id ? 'Hide' : 'Details'}
                </Button>
              </div>
            </div>
            {expandedOrder === order.id && <OrderItemsList orderId={order.id} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OrderItemsList({ orderId }: { orderId: string }) {
  const { data: items, isLoading } = useDataOrderItems(orderId);
  if (isLoading) return <div className="pt-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  if (!items?.length) return <p className="text-xs text-muted-foreground pt-3">No items</p>;

  return (
    <div className="mt-3 pt-3 space-y-0">
      <div className="h-px bg-white/5 -mt-3 mb-3" />
      {items.map((item, i) => {
        const product = (item as any).data_products;
        return (
          <div key={item.id}>
            <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-1 py-2">
              <div>
                <span className="text-foreground">{product?.name ?? 'Product'}</span>
                <span className="text-sub-label text-muted-foreground ml-2">{item.geo_name} · {formatNumber(item.record_count ?? 0)} records</span>
              </div>
              <span className="text-stat-value text-foreground">${((item.record_count ?? 0) * Number(item.unit_price ?? 0)).toFixed(2)}</span>
            </div>
            {i < items.length - 1 && <div className="h-px bg-white/5" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Saved Regions Tab ───

function SavedRegionsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: regions, isLoading } = useQuery({
    queryKey: ['saved-regions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('saved_regions').select('*').eq('user_id', user!.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const deleteRegion = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('saved_regions').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-regions'] }); toast.success('Region removed'); },
  });

  if (isLoading) return <Spinner />;
  if (!regions?.length) return <EmptyState icon={MapPin} title="No saved regions" subtitle="Bookmark states and districts from the map" />;

  return (
    <div className="space-y-2">
      {regions.map(region => (
        <Card key={region.id} className="surgical-glass border-[var(--surface-border)] hover:bg-[hsl(0_0%_16.5%)] transition-all duration-500">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{region.region_name ?? region.region_code}</p>
              <p className="text-sub-label text-muted-foreground capitalize">{region.region_type} · {region.region_code}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate(`/map?region=${region.region_code}&type=${region.region_type}`)}>
                <ExternalLink className="w-3.5 h-3.5 mr-1" />View
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteRegion.mutate(region.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Saved Lists Tab ───

function SavedListsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: lists, isLoading } = useQuery({
    queryKey: ['saved-lists', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('saved_lists').select('*').eq('user_id', user!.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const renameList = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('saved_lists').update({ name: name.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-lists'] }); setEditingId(null); toast.success('List renamed'); },
  });

  const deleteList = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('saved_lists').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-lists'] }); toast.success('List deleted'); },
  });

  if (isLoading) return <Spinner />;
  if (!lists?.length) return <EmptyState icon={List} title="No saved lists" subtitle="Create lists from the map to organize your data" />;

  return (
    <div className="space-y-2">
      {lists.map(list => {
        const itemCount = Array.isArray(list.items) ? list.items.length : 0;
        const isEditing = editingId === list.id;

        return (
          <Card key={list.id} className="surgical-glass border-[var(--surface-border)] hover:bg-[hsl(0_0%_16.5%)] transition-all duration-500">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); if (editName.trim()) renameList.mutate({ id: list.id, name: editName }); }}>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-sm" autoFocus />
                    <Button type="submit" size="sm" variant="ghost" className="h-7 text-xs">Save</Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                  </form>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground truncate">{list.name}</p>
                    <p className="text-sub-label text-muted-foreground">{itemCount} item{itemCount !== 1 ? 's' : ''} · {new Date(list.created_at).toLocaleDateString()}</p>
                  </>
                )}
              </div>
              {!isEditing && (
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingId(list.id); setEditName(list.name); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteList.mutate(list.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Settings Tab ───

function SettingsTab() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deleteConfirm, setDeleteConfirm] = useState('');

  // Tour status
  const { resetTour } = useTourStatus();

  const { data: isSuppressed, isLoading: suppressLoading } = useQuery({
    queryKey: ['email-suppressed', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_email_suppressed');
      if (error) throw error;
      return data as boolean;
    },
    enabled: !!user?.id,
  });

  const toggleSuppression = useMutation({
    mutationFn: async (suppress: boolean) => {
      const { error } = await supabase.rpc('toggle_email_suppression', { suppress });
      if (error) throw error;
    },
    onSuccess: (_, suppress) => {
      toast.success(suppress ? 'Email notifications disabled' : 'Email notifications enabled');
    },
    onError: () => toast.error('Failed to update preferences'),
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('self_delete_account');
      if (error) throw error;
      await supabase.auth.signOut();
    },
    onSuccess: () => { toast.success('Account deleted'); navigate('/'); },
    onError: () => toast.error('Failed to delete account'),
  });

  return (
    <div className="space-y-4">
      <Card className="surgical-glass border-[var(--surface-border)]">
        <CardHeader>
          <CardTitle className="text-title-md">Notification Preferences</CardTitle>
          <CardDescription className="text-sub-label">Control what emails you receive</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Email notifications</p>
              <p className="text-sub-label text-muted-foreground">Receive order updates and platform announcements</p>
            </div>
            {suppressLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : (
              <Switch
                checked={!isSuppressed}
                onCheckedChange={(checked) => toggleSuppression.mutate(!checked)}
                disabled={toggleSuppression.isPending}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="surgical-glass border-[var(--surface-border)]">
        <CardHeader>
          <CardTitle className="text-title-md flex items-center gap-2"><RotateCcw className="w-4 h-4" />Guided Tour</CardTitle>
          <CardDescription className="text-sub-label">Replay the onboarding tour to learn about the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetTour.mutate();
              navigate('/home');
            }}
            disabled={resetTour.isPending}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Replay Tour
          </Button>
        </CardContent>
      </Card>

      <Card className="surgical-glass border-destructive/30">
        <CardHeader>
          <CardTitle className="text-title-md text-destructive">Danger Zone</CardTitle>
          <CardDescription className="text-sub-label">Permanently delete your account and all associated data</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your account, orders, saved regions, lists, and all associated data.
                  <br /><br />
                  Type <strong>DELETE</strong> to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder='Type "DELETE" to confirm'
                className="mt-2"
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirm('')}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteConfirm !== 'DELETE' || deleteAccount.isPending}
                  onClick={() => deleteAccount.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteAccount.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Delete My Account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Shared Components ───

function Spinner() {
  return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <Card className="surgical-glass border-[var(--surface-border)]">
      <CardContent className="py-12 text-center">
        <Icon className="w-10 h-10 mx-auto mb-3 text-primary/30" />
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-sub-label text-muted-foreground/70 mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-label-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ─── Main Account Page ───

export default function Account() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const tabItems = [
    { value: 'profile', label: 'Profile', icon: User },
    { value: 'security', label: 'Security', icon: Shield },
    { value: 'orders', label: 'Orders', icon: ShoppingBag },
    { value: 'regions', label: 'Regions', icon: MapPin },
    { value: 'lists', label: 'Lists', icon: List },
    { value: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[hsl(0_0%_5.5%)]">
      <header className="border-b border-white/10 bg-[hsl(0_0%_7.5%)]/40 backdrop-blur-xl sticky top-0 z-nav-bar shadow-[0_0_20px_hsl(217_91%_53%/0.05)]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/home')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-bold text-white tracking-tighter font-display">Account</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => { await supabase.auth.signOut(); navigate('/'); }}
          >
            Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <ProfileHeader />

        <Tabs defaultValue="profile">
          <TabsList className="surgical-glass border border-[var(--surface-border)] mb-6 w-full justify-start bg-transparent overflow-hidden">
            {tabItems.map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="shrink-0 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                <tab.icon className="w-3.5 h-3.5 mr-1.5" />
                {!isMobile && tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="profile"><ProfileTab /></TabsContent>
          <TabsContent value="security"><SecurityTab /></TabsContent>
          <TabsContent value="orders"><OrdersTab /></TabsContent>
          <TabsContent value="regions"><SavedRegionsTab /></TabsContent>
          <TabsContent value="lists"><SavedListsTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
