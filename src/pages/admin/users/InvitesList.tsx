import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { UserPlus, Shield, Trash2, Mail, Search, AlertCircle, Bell } from 'lucide-react';

type EmailStatus = 'pending' | 'sent' | 'failed' | 'dlq' | null;

interface InviteWithStatus {
  id: string;
  email: string;
  invited_at: string;
  accepted_at: string | null;
  invited_by: string | null;
  email_status: EmailStatus;
  email_error: string | null;
  last_attempt: string | null;
  reminders_sent: number;
  reminder_details: Array<{ num: number; sent_at: string; status: string }>;
}

function useInvites() {
  return useQuery({
    queryKey: ['admin-invites'],
    queryFn: async () => {
      // Fetch invites
      const { data: invites, error } = await supabase
        .from('invited_emails')
        .select('*')
        .order('invited_at', { ascending: false });
      if (error) throw error;

      // Fetch latest email status per invite-email message
      const { data: logs } = await supabase
        .from('email_send_log' as any)
        .select('recipient_email, status, error_message, created_at, template_name, metadata')
        .in('template_name', ['invite-email', 'invite-reminder'])
        .order('created_at', { ascending: false });

      // Build a map: email → latest status (for invite-email only)
      const statusMap = new Map<string, { status: string; error: string | null; created_at: string }>();
      // Build a map: email → reminder numbers sent
      const reminderMap = new Map<string, { count: number; details: Array<{ num: number; sent_at: string; status: string }> }>();
      if (logs) {
        for (const log of logs as any[]) {
          const key = log.recipient_email?.toLowerCase();
          if (!key) continue;
          if (log.template_name === 'invite-email' && !statusMap.has(key)) {
            statusMap.set(key, {
              status: log.status,
              error: log.error_message,
              created_at: log.created_at,
            });
          }
          if (log.template_name === 'invite-reminder' && (log.status === 'pending' || log.status === 'sent')) {
            const num = (log.metadata as any)?.reminder_num as number | undefined;
            if (num) {
              if (!reminderMap.has(key)) reminderMap.set(key, { count: 0, details: [] });
              const entry = reminderMap.get(key)!;
              // Deduplicate by reminder number
              if (!entry.details.some(d => d.num === num)) {
                entry.count++;
                entry.details.push({ num, sent_at: log.created_at, status: log.status });
              }
            }
          }
        }
      }

      return (invites || []).map((inv): InviteWithStatus => {
        const logEntry = statusMap.get(inv.email.toLowerCase());
        const reminders = reminderMap.get(inv.email.toLowerCase());
        return {
          ...inv,
          email_status: (logEntry?.status as EmailStatus) ?? null,
          email_error: logEntry?.error ?? null,
          last_attempt: logEntry?.created_at ?? null,
          reminders_sent: reminders?.count ?? 0,
          reminder_details: reminders?.details ?? [],
        };
      });
    },
  });
}

async function sendInviteEmail(email: string, inviteType: 'user' | 'admin') {
  const { error } = await supabase.functions.invoke('send-invite-email', {
    body: { email, inviteType },
  });
  if (error) throw error;
}

export default function InvitesList() {
  const qc = useQueryClient();
  const { data: invites, isLoading } = useInvites();
  const [newEmail, setNewEmail] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    if (!invites) return [];
    return invites.filter(inv => {
      const q = search.toLowerCase();
      const matchesSearch = !q || inv.email.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'pending' && !inv.accepted_at) ||
        (statusFilter === 'accepted' && !!inv.accepted_at);
      return matchesSearch && matchesStatus;
    });
  }, [invites, search, statusFilter]);

  const addInvite = useMutation({
    mutationFn: async ({ email, asAdmin }: { email: string; asAdmin: boolean }) => {
      const trimmed = email.toLowerCase().trim();
      const { error } = await supabase.from('invited_emails').insert({ email: trimmed });
      if (error) throw error;
      try {
        await sendInviteEmail(trimmed, asAdmin ? 'admin' : 'user');
      } catch (emailErr) {
        console.error('Failed to send invite email:', emailErr);
        toast.warning('Invite added but email could not be queued');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-invites'] });
      setNewEmail('');
      toast.success('Invitation queued for delivery');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendInvite = useMutation({
    mutationFn: async ({ email, inviteType }: { email: string; inviteType: 'user' | 'admin' }) => {
      await sendInviteEmail(email, inviteType);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-invites'] });
      toast.success('Invitation re-queued for delivery');
    },
    onError: (e: Error) => toast.error(`Failed to resend: ${e.message}`),
  });

  const deleteInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invited_emails').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-invites'] }); toast.success('Invite removed'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Invite form */}
        <form
          className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center"
          onSubmit={e => { e.preventDefault(); if (newEmail) addInvite.mutate({ email: newEmail, asAdmin: false }); }}
        >
          <Input
            placeholder="email@example.com"
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            className="w-full sm:max-w-xs h-10"
          />
          <Button type="submit" size="sm" disabled={!newEmail || addInvite.isPending} className="min-h-[40px]">
            <UserPlus className="h-4 w-4 mr-1" /> Invite as User
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!newEmail || addInvite.isPending}
            onClick={() => { if (newEmail) addInvite.mutate({ email: newEmail, asAdmin: true }); }}
            className="min-h-[40px]"
          >
            <Shield className="h-4 w-4 mr-1" /> Invite as Admin
          </Button>
        </form>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center">
          <div className="relative w-full sm:flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px] h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground sm:ml-auto">
            {filtered.length} invite{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading invitations...</p>
        ) : (
          <>
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-border -mx-6">
            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No invitations found</p>
            ) : filtered.map(inv => (
              <div key={inv.id} className="px-6 py-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm truncate">{inv.email}</span>
                  {inv.accepted_at ? (
                    <Badge className="bg-accent/20 text-accent border-accent/30 shrink-0">Accepted</Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">Pending</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{format(new Date(inv.invited_at), 'MMM d, yyyy')}</span>
                  {!inv.accepted_at && (
                    <span className="flex items-center gap-1"><Bell className="h-3 w-3" /> {inv.reminders_sent}/3</span>
                  )}
                  <DeliveryBadge status={inv.email_status} error={inv.email_error} />
                </div>
                <div className="flex gap-2 pt-1">
                  {!inv.accepted_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 min-h-[40px]"
                      onClick={() => resendInvite.mutate({ email: inv.email, inviteType: 'user' })}
                      disabled={resendInvite.isPending}
                    >
                      <Mail className="h-4 w-4 mr-1" /> Resend
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 min-h-[40px] text-destructive"
                    onClick={() => deleteInvite.mutate(inv.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Invited</TableHead>
                <TableHead>Invite Status</TableHead>
                <TableHead>Reminders</TableHead>
                <TableHead>Email Delivery</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.email}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(inv.invited_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    {inv.accepted_at ? (
                      <Badge className="bg-accent/20 text-accent border-accent/30">Accepted</Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!inv.accepted_at && inv.reminders_sent > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 cursor-default">
                            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                            <Badge variant="secondary" className="text-xs">
                              {inv.reminders_sent}/3
                            </Badge>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs space-y-1">
                          {inv.reminder_details
                            .sort((a, b) => a.num - b.num)
                            .map(d => (
                              <div key={d.num}>
                                Reminder {d.num}: {format(new Date(d.sent_at), 'MMM d, yyyy')} — {d.status}
                              </div>
                            ))}
                        </TooltipContent>
                      </Tooltip>
                    ) : !inv.accepted_at ? (
                      <span className="text-xs text-muted-foreground">0/3</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DeliveryBadge status={inv.email_status} error={inv.email_error} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {!inv.accepted_at && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => resendInvite.mutate({ email: inv.email, inviteType: 'user' })}
                              disabled={resendInvite.isPending}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Resend invitation</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteInvite.mutate(inv.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remove invite</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No invitations found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DeliveryBadge({ status, error }: { status: EmailStatus; error: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;

  const config: Record<string, { label: string; className: string }> = {
    pending: { label: 'Queued', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    sent: { label: 'Sent', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
    failed: { label: 'Failed', className: 'bg-destructive/20 text-destructive border-destructive/30' },
    dlq: { label: 'Failed (DLQ)', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  };

  const c = config[status] || { label: status, className: '' };

  return (
    <div className="flex items-center gap-1.5">
      <Badge className={c.className}>{c.label}</Badge>
      {error && (status === 'failed' || status === 'dlq') && (
        <Tooltip>
          <TooltipTrigger>
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{error}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
