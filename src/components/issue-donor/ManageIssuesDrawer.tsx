import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, Save, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { Issue } from '@/hooks/useIssueDonorData';

interface ManageIssuesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: Issue[];
}

export function ManageIssuesDrawer({ open, onOpenChange, issues }: ManageIssuesDrawerProps) {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, { name?: string; display_order?: number }>>({});

  const togglePublish = useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const { error } = await supabase
        .from('issues')
        .update({ is_published: publish })
        .eq('id', id);
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
      qc.invalidateQueries({ queryKey: ['issues'] });
      toast.success('Issue deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setEdit = (id: string, patch: { name?: string; display_order?: number }) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-[#0e0e0e] border-l border-white/10 text-foreground overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground font-display">Manage Issues</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Toggle published status, rename, or delete issues. Draft issues are only visible to admins.
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {issues.length === 0 && (
            <p className="text-sm text-muted-foreground">No issues yet. Import a donor file to create some.</p>
          )}
          {issues.map(issue => {
            const edit = edits[issue.id] ?? {};
            const pendingName = edit.name ?? issue.name;
            const pendingOrder = edit.display_order ?? issue.display_order;
            const dirty = edit.name !== undefined || edit.display_order !== undefined;

            return (
              <div key={issue.id} className="border border-white/5 rounded-md p-3 bg-white/[0.02] space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                      <Input
                        value={pendingName}
                        onChange={e => setEdit(issue.id, { name: e.target.value })}
                        className="h-7 text-xs bg-[#1c1c1e] border-white/10"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                      <span>slug: {issue.slug}</span>
                      <span>•</span>
                      <label className="flex items-center gap-1">
                        order:
                        <Input
                          type="number"
                          value={pendingOrder}
                          onChange={e => setEdit(issue.id, { display_order: parseInt(e.target.value, 10) || 0 })}
                          className="h-6 w-14 text-[10px] bg-[#1c1c1e] border-white/10"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <label className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {issue.is_published ? 'Live' : 'Draft'}
                      </span>
                      <Switch
                        checked={issue.is_published}
                        onCheckedChange={(v) => togglePublish.mutate({ id: issue.id, publish: v })}
                      />
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
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
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete "${issue.name}" and all its donor data?`)) {
                        remove.mutate(issue.id);
                      }
                    }}
                    className="h-7 text-[10px] gap-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
