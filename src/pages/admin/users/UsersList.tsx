import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Shield, ShieldOff, Trash2, Search, Ban, UserCheck } from 'lucide-react';

function useProfiles() {
  return useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useAllRoles() {
  return useQuery({
    queryKey: ['admin-all-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('*');
      if (error) throw error;
      return data;
    },
  });
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function UsersList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profiles, isLoading } = useProfiles();
  const { data: roles } = useAllRoles();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string; suspended: boolean } | null>(null);

  const rolesMap = useMemo(() => {
    const map = new Map<string, string[]>();
    roles?.forEach(r => {
      const existing = map.get(r.user_id) || [];
      existing.push(r.role);
      map.set(r.user_id, existing);
    });
    return map;
  }, [roles]);

  const filtered = useMemo(() => {
    if (!profiles) return [];
    return profiles.filter(p => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (p.full_name || '').toLowerCase().includes(q) ||
        (p.organization || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q);
      const userRoles = rolesMap.get(p.id) || [];
      const isAdmin = userRoles.includes('admin');
      const isSuspended = !!(p as any).suspended;
      const matchesRole =
        roleFilter === 'all' ||
        (roleFilter === 'admin' && isAdmin) ||
        (roleFilter === 'user' && !isAdmin && !isSuspended) ||
        (roleFilter === 'suspended' && isSuspended);
      return matchesSearch && matchesRole;
    });
  }, [profiles, search, roleFilter, rolesMap]);

  const grantAdmin = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: 'admin' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-all-roles'] }); toast.success('Admin role granted'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeAdmin = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', 'admin');
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-all-roles'] }); toast.success('Admin role revoked'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeAccess = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from('user_roles').delete().eq('user_id', userId);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-all-roles'] }); toast.success('Access revoked'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSuspend = useMutation({
    mutationFn: async ({ userId, suspended }: { userId: string; suspended: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          suspended: !suspended,
          suspended_at: new Date().toISOString(),
          suspended_by: user?.id,
        } as any)
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: (_, { suspended }) => {
      qc.invalidateQueries({ queryKey: ['admin-profiles'] });
      toast.success(suspended ? 'User unsuspended' : 'User suspended');
      setSuspendTarget(null);
    },
    onError: (e: Error) => { toast.error(e.message); setSuspendTarget(null); },
  });

  return (
    <>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center">
            <div className="relative w-full sm:flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or organization..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[140px] h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="user">Users</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground sm:ml-auto">
              {filtered.length} user{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading users...</p>
          ) : (
            <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-border -mx-6">
              {filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No users found</p>
              ) : filtered.map(p => {
                const userRoles = rolesMap.get(p.id) || [];
                const isAdmin = userRoles.includes('admin');
                const isSuspended = !!(p as any).suspended;
                return (
                  <div key={p.id} className="px-6 py-4">
                    <button
                      onClick={() => navigate(`/admin/users/${p.id}`)}
                      className="w-full flex items-center gap-3 text-left"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className={`text-xs ${isSuspended ? 'bg-destructive/20 text-destructive' : 'bg-primary/10 text-primary'}`}>
                          {getInitials(p.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium truncate">{p.full_name || '—'}</span>
                          {isAdmin ? (
                            <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">Admin</Badge>
                          ) : null}
                          {isSuspended && (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">Suspended</Badge>
                          )}
                        </div>
                        {p.email && <p className="text-xs text-muted-foreground truncate">{p.email}</p>}
                        {p.organization && <p className="text-xs text-muted-foreground truncate">{p.organization}</p>}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Joined {format(new Date(p.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </button>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className={`flex-1 min-h-[40px] ${isSuspended ? 'text-emerald-500' : 'text-destructive'}`}
                        onClick={() => setSuspendTarget({ id: p.id, name: p.full_name || 'this user', suspended: isSuspended })}
                      >
                        {isSuspended ? <UserCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 min-h-[40px]"
                        onClick={() => isAdmin ? revokeAdmin.mutate(p.id) : grantAdmin.mutate(p.id)}
                      >
                        {isAdmin ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 min-h-[40px] text-destructive"
                        onClick={() => revokeAccess.mutate(p.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Signed Up</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => {
                  const userRoles = rolesMap.get(p.id) || [];
                  const isAdmin = userRoles.includes('admin');
                  const isSuspended = !!(p as any).suspended;
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/admin/users/${p.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className={`text-xs ${isSuspended ? 'bg-destructive/20 text-destructive' : 'bg-primary/10 text-primary'}`}>
                              {getInitials(p.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="font-medium block">{p.full_name || '—'}</span>
                            {p.email && (
                              <span className="text-xs text-muted-foreground">{p.email}</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.organization || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {isAdmin ? (
                            <Badge className="bg-primary/20 text-primary border-primary/30">Admin</Badge>
                          ) : (
                            <Badge variant="secondary">User</Badge>
                          )}
                          {isSuspended && (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Suspended</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {format(new Date(p.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className={isSuspended ? 'text-emerald-500 hover:text-emerald-400' : 'text-destructive hover:text-destructive'}
                                onClick={() => setSuspendTarget({ id: p.id, name: p.full_name || 'this user', suspended: isSuspended })}
                              >
                                {isSuspended ? <UserCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{isSuspended ? 'Unsuspend user' : 'Suspend user'}</TooltipContent>
                          </Tooltip>
                          {isAdmin ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" onClick={() => revokeAdmin.mutate(p.id)}>
                                  <ShieldOff className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Revoke admin</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" onClick={() => grantAdmin.mutate(p.id)}>
                                  <Shield className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Grant admin</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revokeAccess.mutate(p.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Revoke all access</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!suspendTarget} onOpenChange={open => !open && setSuspendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendTarget?.suspended ? 'Unsuspend User' : 'Suspend User'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendTarget?.suspended
                ? `Are you sure you want to unsuspend ${suspendTarget.name}? They will regain access to their account.`
                : `Are you sure you want to suspend ${suspendTarget?.name}? They will be signed out and unable to access their account.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={suspendTarget?.suspended ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
              onClick={() => suspendTarget && toggleSuspend.mutate({ userId: suspendTarget.id, suspended: suspendTarget.suspended })}
            >
              {suspendTarget?.suspended ? 'Unsuspend' : 'Suspend'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
