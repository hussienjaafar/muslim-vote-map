import React, { useMemo, useState } from 'react';
import { Plus, X, Settings2, UploadCloud, ChevronDown } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import type { Issue } from '@/hooks/useIssueDonorData';
import { getIssuePalette } from '@/lib/issueColors';

interface IssueSelectorProps {
  allIssues: Issue[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onManage: () => void;
  maxSelected?: number;
  compact?: boolean;
  onExpand?: () => void;
}

export function IssueSelector({ allIssues, selectedIds, onChange, onManage, maxSelected = 3, compact, onExpand }: IssueSelectorProps) {
  const [open, setOpen] = useState(false);
  const [swapOpenId, setSwapOpenId] = useState<string | null>(null);
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const publishIssue = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('issues').update({ is_published: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      toast.success('Issue published');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selected = useMemo(
    () => selectedIds.map(id => allIssues.find(i => i.id === id)).filter(Boolean) as Issue[],
    [selectedIds, allIssues],
  );

  const remaining = useMemo(
    () => allIssues.filter(i => !selectedIds.includes(i.id)),
    [selectedIds, allIssues],
  );

  const canAdd = selected.length < maxSelected && remaining.length > 0;

  const add = (id: string) => {
    if (selected.length >= maxSelected) return;
    onChange([...selectedIds, id]);
    setOpen(false);
  };

  const remove = (id: string) => onChange(selectedIds.filter(s => s !== id));

  if (compact) {
    const firstPalette = selected.length > 0 ? getIssuePalette(0) : null;
    return (
      <button
        onClick={onExpand}
        className="flex items-center gap-2 bg-[#1c1c1e]/90 backdrop-blur-[20px] rounded-full border border-white/10 px-3 py-2 shadow-lg min-h-[40px] hover:bg-[#1c1c1e]"
        aria-label="Manage selected issues"
      >
        {firstPalette && (
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: firstPalette.swatch }} />
        )}
        <span className="text-xs font-display font-semibold text-foreground">
          {selected.length === 0 ? 'Pick issues' : selected.length === 1 ? selected[0].name : `Issues (${selected.length}/${maxSelected})`}
        </span>
        <Plus className="h-3 w-3 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="bg-[#1c1c1e]/90 backdrop-blur-[20px] rounded-lg border border-white/10 p-2 shadow-xl min-w-[260px] max-w-sm">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground font-display">
          Issues ({selected.length}/{maxSelected})
        </span>
        <button
          onClick={onManage}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Manage issues"
          title="Manage issues"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        {selected.map((issue, idx) => {
          const palette = getIssuePalette(idx);
          return (
            <div
              key={issue.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/5 border border-white/5"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: palette.swatch }}
              />
              <span className="text-xs text-foreground flex-1 truncate">{issue.name}</span>
              {issue.is_published ? (
                <Badge variant="secondary" className="h-4 text-[9px] px-1.5 bg-emerald-500/20 text-emerald-300 border-0">
                  Live
                </Badge>
              ) : isAdmin ? (
                <button
                  onClick={() => publishIssue.mutate(issue.id)}
                  disabled={publishIssue.isPending}
                  className="flex items-center gap-1 h-5 px-1.5 rounded text-[9px] font-medium bg-amber-500/20 text-amber-300 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors disabled:opacity-50"
                  title="Publish this issue (make it Live)"
                >
                  <UploadCloud className="h-2.5 w-2.5" />
                  Publish
                </button>
              ) : (
                <Badge variant="secondary" className="h-4 text-[9px] px-1.5 bg-amber-500/20 text-amber-300 border-0">
                  Draft
                </Badge>
              )}
              <button
                onClick={() => remove(issue.id)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`Remove ${issue.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <button
              disabled={!canAdd}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-dashed border-white/15 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              {selected.length === 0 ? 'Add an issue' : 'Add another issue'}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
            {remaining.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                No more issues available.
              </div>
            ) : remaining.map(issue => (
              <DropdownMenuItem key={issue.id} onSelect={() => add(issue.id)} className="flex items-center justify-between gap-2">
                <span className="text-sm">{issue.name}</span>
                {!issue.is_published && (
                  <span className="text-[9px] uppercase tracking-wider text-amber-400">Draft</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
