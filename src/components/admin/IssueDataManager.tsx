import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIssues } from '@/hooks/useIssueDonorData';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { IssueDonorImport } from '@/components/admin/IssueDonorImport';

function useIssueDonorCounts() {
  return useQuery({
    queryKey: ['issue-donor-counts'],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('issue_donor_districts')
        .select('issue_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const id = (row as { issue_id: string }).issue_id;
        counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    },
  });
}

export function IssueDataManager() {
  const qc = useQueryClient();
  const { data: issues, isLoading } = useIssues();
  const { data: counts } = useIssueDonorCounts();
  const [edits, setEdits] = useState<Record<string, { name?: string; display_order?: number }>>({});

  const setEdit = (id: string, patch: { name?: string; display_order?: number }) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['issues'] });
    qc.invalidateQueries({ queryKey: ['issue-donor-counts'] });
  };

  const togglePublish = useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const { error } = await supabase.from('issues').update({ is_published: publish }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      toast.success(vars.publish ? 'Issue published' : 'Issue set to draft');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveEdit = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { name?: string; display_order?: number } }) => {
      const { error } = await supabase.from('issues').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      setEdits(prev => { const next = { ...prev }; delete next[id]; return next; });
      toast.success('Issue updated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('issues').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Issue deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <IssueDonorImport />

    <div className="surgical-glass">

      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground font-display">Issues</h3>
        <p className="text-[10px] text-muted-foreground">Rename, reorder, publish, or delete issues. Draft issues are admin-only.</p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center"><p className="text-sm text-muted-foreground">Loading...</p></div>
      ) : !issues?.length ? (
        <div className="py-12 text-center"><p className="text-sm text-muted-foreground">No issues yet. Import a donor file to create some.</p></div>
      ) : (
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/5 hover:bg-transparent">
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Name</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground w-20">Order</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Slug</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Donor Records</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Status</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map(issue => {
                const edit = edits[issue.id] ?? {};
                const pendingName = edit.name ?? issue.name;
                const pendingOrder = edit.display_order ?? issue.display_order;
                const dirty = edit.name !== undefined || edit.display_order !== undefined;
                return (
                  <TableRow key={issue.id} className="border-b border-white/5 hover:bg-[#1c1c1e] transition-colors">
                    <TableCell>
                      <Input
                        value={pendingName}
                        onChange={e => setEdit(issue.id, { name: e.target.value })}
                        className="h-8 text-xs bg-[#1c1c1e] border-white/10 min-w-[160px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={pendingOrder}
                        onChange={e => setEdit(issue.id, { display_order: parseInt(e.target.value, 10) || 0 })}
                        className="h-8 w-16 text-xs bg-[#1c1c1e] border-white/10"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">{issue.slug}</TableCell>
                    <TableCell className="tabular-nums text-xs text-muted-foreground">
                      {counts?.[issue.id]?.toLocaleString() ?? '0'}
                    </TableCell>
                    <TableCell>
                      <label className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-9">
                          {issue.is_published ? 'Live' : 'Draft'}
                        </span>
                        <Switch
                          checked={issue.is_published}
                          onCheckedChange={(v) => togglePublish.mutate({ id: issue.id, publish: v })}
                        />
                      </label>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {dirty && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => saveEdit.mutate({ id: issue.id, patch: edit })}
                            className="h-7 text-[10px] gap-1"
                          >
                            <Save className="h-3 w-3" /> Save
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-red-400 hover:bg-red-600/10 transition-colors rounded-sm"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-[#1c1c1e] border-[rgba(255,255,255,0.08)]">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-display text-foreground">Delete "{issue.name}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This permanently removes the issue and all {counts?.[issue.id]?.toLocaleString() ?? '0'} of its donor records. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-[rgba(255,255,255,0.08)] text-muted-foreground hover:bg-white/5">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove.mutate(issue.id)} className="bg-red-600 text-white hover:bg-red-700">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
