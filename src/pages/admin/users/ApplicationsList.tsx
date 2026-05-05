import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Search, CheckCircle, XCircle, MessageCircle, ChevronDown, ChevronUp,
  ExternalLink, Loader2, Globe, User, Building2, FileText, X,
} from 'lucide-react';

type AppStatus = 'pending' | 'approved' | 'rejected' | 'more_info';

const STATUS_BADGE: Record<AppStatus, string> = {
  pending: 'bg-amber-500/20 text-amber-400',
  approved: 'bg-emerald-500/20 text-emerald-400',
  rejected: 'bg-red-500/20 text-red-400',
  more_info: 'bg-blue-500/20 text-blue-400',
};

const STATUS_LABELS: Record<AppStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  more_info: 'More Info',
};

const ACTIONABLE_STATUSES = ['pending', 'more_info'];

function useApplications() {
  return useQuery({
    queryKey: ['admin-applications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('access_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });
}

export default function ApplicationsList() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: apps, isLoading } = useApplications();
  const [filter, setFilter] = useState<'all' | AppStatus>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

  // Clear selection when search or filter changes
  useEffect(() => { setSelectedIds(new Set()); }, [search, filter]);

  const filtered = useMemo(() => {
    if (!apps) return [];
    let list = apps;
    if (filter !== 'all') list = list.filter(a => a.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.full_name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.organization.toLowerCase().includes(q)
      );
    }
    return list;
  }, [apps, filter, search]);

  const actionableFiltered = useMemo(
    () => filtered.filter(a => ACTIONABLE_STATUSES.includes(a.status)),
    [filtered]
  );

  const pendingCount = useMemo(() => apps?.filter(a => a.status === 'pending').length ?? 0, [apps]);

  const allActionableSelected = actionableFiltered.length > 0 && actionableFiltered.every(a => selectedIds.has(a.id));

  const toggleSelectAll = useCallback(() => {
    if (allActionableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(actionableFiltered.map(a => a.id)));
    }
  }, [allActionableSelected, actionableFiltered]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleApprove = async (app: any) => {
    setActionLoading(app.id);
    try {
      const { error: updateError } = await supabase
        .from('access_requests')
        .update({
          status: 'approved',
          reviewer_id: user!.id,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: notesInput.trim() || null,
        })
        .eq('id', app.id);
      if (updateError) throw updateError;

      const { error: inviteError } = await supabase
        .from('invited_emails')
        .upsert({ email: app.email, invited_by: user!.id }, { onConflict: 'email' });
      if (inviteError) throw inviteError;

      await supabase.functions.invoke('send-invite-email', {
        body: { email: app.email, inviteType: 'user' },
      });

      qc.invalidateQueries({ queryKey: ['admin-applications'] });
      qc.invalidateQueries({ queryKey: ['admin-invites'] });
      setExpandedId(null);
      setNotesInput('');
      toast.success(`Approved — invite sent to ${app.email}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (app: any) => {
    setActionLoading(app.id);
    try {
      const { error } = await supabase
        .from('access_requests')
        .update({
          status: 'rejected',
          reviewer_id: user!.id,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: notesInput.trim() || null,
        })
        .eq('id', app.id);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ['admin-applications'] });
      setExpandedId(null);
      setNotesInput('');
      toast.success('Application rejected');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMoreInfo = async (app: any) => {
    if (!notesInput.trim()) {
      toast.error('Please enter notes explaining what information you need.');
      return;
    }
    setActionLoading(app.id);
    try {
      const { error } = await supabase
        .from('access_requests')
        .update({
          status: 'more_info',
          reviewer_id: user!.id,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: notesInput.trim(),
        })
        .eq('id', app.id);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ['admin-applications'] });
      setExpandedId(null);
      setNotesInput('');
      toast.success('Requested more information');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkApprove = async () => {
    const selectedApps = filtered.filter(a => selectedIds.has(a.id));
    if (selectedApps.length === 0) return;

    const total = selectedApps.length;
    let successes = 0;
    let failures = 0;

    setBulkProgress({ current: 0, total });

    for (let i = 0; i < selectedApps.length; i++) {
      const app = selectedApps[i];
      setBulkProgress({ current: i + 1, total });

      try {
        const { error: updateError } = await supabase
          .from('access_requests')
          .update({
            status: 'approved',
            reviewer_id: user!.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', app.id);
        if (updateError) throw updateError;

        const { error: inviteError } = await supabase
          .from('invited_emails')
          .upsert({ email: app.email, invited_by: user!.id }, { onConflict: 'email' });
        if (inviteError) throw inviteError;

        // Fire-and-forget
        supabase.functions.invoke('send-invite-email', {
          body: { email: app.email, inviteType: 'user' },
        }).catch(() => {});

        successes++;
      } catch {
        failures++;
      }
    }

    setBulkProgress(null);
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: ['admin-applications'] });
    qc.invalidateQueries({ queryKey: ['admin-invites'] });

    if (failures === 0) {
      toast.success(`All ${successes} applications approved`);
    } else {
      toast.warning(`${successes} approved, ${failures} failed`);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or organization..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({apps?.length ?? 0})</SelectItem>
            <SelectItem value="pending">Pending ({pendingCount})</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="more_info">More Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="surgical-glass border-[rgba(255,255,255,0.08)] overflow-hidden relative">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5">
              <TableHead className="w-10">
                {actionableFiltered.length > 0 && (
                  <Checkbox
                    checked={allActionableSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all actionable"
                  />
                )}
              </TableHead>
              <TableHead className="font-display text-[10px] uppercase tracking-widest">Applicant</TableHead>
              <TableHead className="font-display text-[10px] uppercase tracking-widest">Organization</TableHead>
              <TableHead className="font-display text-[10px] uppercase tracking-widest">Status</TableHead>
              <TableHead className="font-display text-[10px] uppercase tracking-widest">Date</TableHead>
              <TableHead className="font-display text-[10px] uppercase tracking-widest w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  {search || filter !== 'all' ? 'No applications match your filters.' : 'No applications yet.'}
                </TableCell>
              </TableRow>
            ) : filtered.map(app => {
              const isActionable = ACTIONABLE_STATUSES.includes(app.status);
              const isSelected = selectedIds.has(app.id);
              return (
                <>
                  <TableRow
                    key={app.id}
                    className="border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => {
                      setExpandedId(expandedId === app.id ? null : app.id);
                      setNotesInput(app.reviewer_notes || '');
                    }}
                  >
                    <TableCell onClick={e => e.stopPropagation()}>
                      {isActionable && (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(app.id)}
                          aria-label={`Select ${app.full_name}`}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">{app.full_name}</p>
                        <p className="text-xs text-muted-foreground">{app.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-foreground">{app.organization}</p>
                      {app.title && <p className="text-xs text-muted-foreground">{app.title}</p>}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_BADGE[app.status as AppStatus] ?? 'bg-muted text-muted-foreground'}>
                        {STATUS_LABELS[app.status as AppStatus] ?? app.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {format(new Date(app.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {expandedId === app.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </TableCell>
                  </TableRow>

                  {expandedId === app.id && (
                    <TableRow key={`${app.id}-detail`} className="border-white/5 bg-white/[0.01]">
                      <TableCell colSpan={6} className="p-6">
                        <div className="space-y-4 max-w-2xl">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-start gap-2">
                              <User className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Name</p>
                                <p className="text-foreground">{app.full_name}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Organization</p>
                                <p className="text-foreground">{app.organization}</p>
                              </div>
                            </div>
                            {app.website && (
                              <div className="flex items-start gap-2">
                                <Globe className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Website</p>
                                  <a href={app.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
                                    {app.website} <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                            )}
                            {app.title && (
                              <div className="flex items-start gap-2">
                                <User className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Title</p>
                                  <p className="text-foreground">{app.title}</p>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex items-start gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Use Case</p>
                              <p className="text-sm text-foreground whitespace-pre-wrap">{app.use_case}</p>
                            </div>
                          </div>

                          {app.reviewer_notes && app.status !== 'pending' && (
                            <div className="bg-white/[0.02] border border-white/5 rounded-md p-3">
                              <p className="text-xs text-muted-foreground mb-1">Previous reviewer notes</p>
                              <p className="text-sm text-foreground">{app.reviewer_notes}</p>
                            </div>
                          )}

                          {(app.status === 'pending' || app.status === 'more_info') && (
                            <div className="space-y-3 border-t border-white/5 pt-4">
                              <div className="space-y-2">
                                <label className="text-xs text-muted-foreground">Reviewer notes (required for "More Info", optional otherwise)</label>
                                <textarea
                                  value={notesInput}
                                  onChange={e => setNotesInput(e.target.value)}
                                  placeholder="Add notes for the applicant or for internal records..."
                                  rows={2}
                                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleApprove(app)}
                                  disabled={actionLoading === app.id}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  {actionLoading === app.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMoreInfo(app)}
                                  disabled={actionLoading === app.id}
                                >
                                  <MessageCircle className="w-3.5 h-3.5 mr-1" />
                                  Request More Info
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleReject(app)}
                                  disabled={actionLoading === app.id}
                                  className="text-red-400 hover:text-red-300 border-red-500/30 hover:bg-red-500/10"
                                >
                                  <XCircle className="w-3.5 h-3.5 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>

        {/* Floating bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="sticky bottom-0 left-0 right-0 border-t border-white/10 bg-[rgba(20,20,22,0.95)] backdrop-blur-xl px-6 py-3 flex items-center gap-4">
            <span className="text-sm text-muted-foreground font-medium tabular-nums">
              {bulkProgress
                ? `Approving ${bulkProgress.current}/${bulkProgress.total}...`
                : `${selectedIds.size} selected`}
            </span>
            <Button
              size="sm"
              onClick={handleBulkApprove}
              disabled={!!bulkProgress}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {bulkProgress
                ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
              Bulk Approve ({selectedIds.size})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              disabled={!!bulkProgress}
              className="text-muted-foreground"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
