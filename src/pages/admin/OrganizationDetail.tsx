import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ArrowLeft, Building2, Users, Trash2, UserPlus, Check, X, TicketCheck } from 'lucide-react';
import {
  useAdminOrganization, useOrgMembers, useUpdateMemberRole, useRemoveMember, useAddMember,
  useSeatRequests, useProcessSeatRequest, useUpdateSeatLimit, type OrgRole, type OrgMember,
} from '@/queries/useAdminOrgQueries';

const ROLES: OrgRole[] = ['owner', 'admin', 'member', 'viewer'];

function getInitials(name?: string | null, email?: string | null) {
  const src = name || email || '?';
  return src.split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const roleBadge: Record<OrgRole, string> = {
  owner: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  admin: 'bg-primary/20 text-primary border-primary/30',
  member: 'bg-white/10 text-foreground border-white/20',
  viewer: 'bg-muted text-muted-foreground border-border',
};

export default function OrganizationDetail() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();

  const { data: org, isLoading } = useAdminOrganization(orgId);
  const { data: members } = useOrgMembers(orgId);
  const { data: seatRequests } = useSeatRequests(orgId);

  const updateRole = useUpdateMemberRole(orgId);
  const removeMember = useRemoveMember(orgId);
  const addMember = useAddMember(orgId);
  const processSeat = useProcessSeatRequest(orgId);
  const updateSeats = useUpdateSeatLimit(orgId);

  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<OrgRole>('member');
  const [seatInput, setSeatInput] = useState('');
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);

  if (isLoading) {
    return <div className="p-10 text-sm text-muted-foreground">Loading organization…</div>;
  }
  if (!org) {
    return (
      <div className="p-10 space-y-4">
        <p className="text-sm text-muted-foreground">Organization not found.</p>
        <Button variant="outline" onClick={() => navigate('/admin/orgs')} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to organizations
        </Button>
      </div>
    );
  }

  const memberCount = members?.length ?? 0;
  const seatsFull = memberCount >= org.seat_limit;
  const pendingRequests = (seatRequests ?? []).filter((r) => r.status === 'pending');

  const handleAdd = async () => {
    if (!newEmail.trim()) { toast.error('Enter a user email'); return; }
    if (seatsFull) { toast.error('Seat limit reached. Increase seats before adding members.'); return; }
    try {
      await addMember.mutateAsync({ email: newEmail, role: newRole });
      toast.success('Member added');
      setNewEmail('');
      setNewRole('member');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to add member');
    }
  };

  const handleSeatSave = async () => {
    const n = Number(seatInput);
    if (!n || n < 1) { toast.error('Enter a valid seat count'); return; }
    if (n < memberCount) { toast.error(`Cannot set below current member count (${memberCount}).`); return; }
    try {
      await updateSeats.mutateAsync({ newLimit: n, previousLimit: org.seat_limit });
      toast.success('Seat limit updated');
      setSeatInput('');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update seats');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 space-y-6 max-w-5xl">
      <button onClick={() => navigate('/admin/orgs')} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Organizations
      </button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <Building2 className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">{org.name}</h2>
          <p className="text-xs text-muted-foreground">{org.slug}</p>
        </div>
        <Badge className={`ml-auto ${seatsFull ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-primary/15 text-primary border-primary/30'}`}>
          <Users className="w-3 h-3 mr-1" />{memberCount}/{org.seat_limit} seats
        </Badge>
      </div>

      {/* Seat management */}
      <Card>
        <CardHeader><CardTitle className="text-base">Seats</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="seats" className="text-xs">Seat limit</Label>
              <Input id="seats" type="number" min={memberCount} placeholder={String(org.seat_limit)} value={seatInput} onChange={(e) => setSeatInput(e.target.value)} className="w-32 h-9" />
            </div>
            <Button onClick={handleSeatSave} disabled={updateSeats.isPending} variant="outline">Update</Button>
            <p className="text-xs text-muted-foreground">{memberCount} of {org.seat_limit} seats used.</p>
          </div>

          {pendingRequests.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><TicketCheck className="w-3.5 h-3.5" /> Pending seat requests</p>
              {pendingRequests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card/50 p-3">
                  <div className="text-sm">
                    <span className="font-medium text-foreground">{r.current_seat_limit} → {r.requested_seats} seats</span>
                    {r.reason && <span className="text-muted-foreground"> · {r.reason}</span>}
                    <p className="text-[10px] text-muted-foreground">{format(new Date(r.created_at), 'PP')}</p>
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <Button size="sm" className="gap-1" onClick={() => processSeat.mutate({ request: r, approve: true }, { onSuccess: () => toast.success('Seat request approved'), onError: (e: any) => toast.error(e.message) })}>
                      <Check className="w-3.5 h-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => processSeat.mutate({ request: r, approve: false }, { onSuccess: () => toast.success('Seat request rejected'), onError: (e: any) => toast.error(e.message) })}>
                      <X className="w-3.5 h-3.5" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add member */}
      <Card>
        <CardHeader><CardTitle className="text-base">Add member</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 flex-1 min-w-[220px]">
              <Label htmlFor="email" className="text-xs">User email</Label>
              <Input id="email" type="email" placeholder="person@example.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as OrgRole)}>
                <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={addMember.isPending} className="gap-2">
              <UserPlus className="w-4 h-4" /> Add
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">The user must already have an account. They'll be linked to this organization.</p>
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader><CardTitle className="text-base">Members ({memberCount})</CardTitle></CardHeader>
        <CardContent>
          {!members?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No members yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.membership_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(m.full_name, m.email)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="font-medium block">{m.full_name || '—'}</span>
                          {m.email && <span className="text-xs text-muted-foreground">{m.email}</span>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select value={m.role} onValueChange={(v) => updateRole.mutate({ membershipId: m.membership_id, role: v as OrgRole }, { onSuccess: () => toast.success('Role updated'), onError: (e: any) => toast.error(e.message) })}>
                        <SelectTrigger className={`w-28 h-8 text-xs capitalize ${roleBadge[m.role]}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{format(new Date(m.created_at), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemoveTarget(m)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {removeTarget?.full_name || removeTarget?.email || 'this user'} from {org.name}? They will lose access to this organization's dashboards and data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeTarget && removeMember.mutate(removeTarget.membership_id, {
                onSuccess: () => { toast.success('Member removed'); setRemoveTarget(null); },
                onError: (e: any) => { toast.error(e.message); setRemoveTarget(null); },
              })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
