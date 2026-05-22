import { useEffect, useMemo, useState } from 'react';
import { Check, Building2, Search, Clock } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandList, CommandSeparator } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import type { Organization } from '@/contexts/OrgContext';

const RECENT_KEY = 'cds:recentOrgIds';
const MAX_RECENT = 5;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizations: Organization[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function addRecent(id: string) {
  const list = [id, ...getRecent().filter((x) => x !== id)].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

const Row = ({ org, isSelected, recent, onSelect }: { org: Organization; isSelected: boolean; recent?: boolean; onSelect: () => void }) => (
  <button
    onClick={onSelect}
    className={cn(
      'flex items-center gap-3 w-full px-3 py-2.5 text-left rounded-md transition-colors',
      'hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      isSelected && 'bg-accent/20 border-l-2 border-primary -ml-[2px] pl-[14px]'
    )}
  >
    {recent && <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
    {org.logo_url ? (
      <img src={org.logo_url} alt="" className="h-7 w-7 rounded-md object-contain shrink-0 bg-muted" />
    ) : (
      <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
        {org.name.substring(0, 2).toUpperCase()}
      </div>
    )}
    <span className="flex-1 truncate text-sm text-foreground">{org.name}</span>
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{org.role}</span>
    {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
  </button>
);

export function OrgPicker({ open, onOpenChange, organizations, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState('');
  useEffect(() => { if (open) setSearch(''); }, [open]);

  const handle = (id: string) => { addRecent(id); onSelect(id); onOpenChange(false); };

  const recents = useMemo(() => {
    const ids = getRecent();
    return ids.map((id) => organizations.find((o) => o.id === id)).filter(Boolean) as Organization[];
  }, [organizations, open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return organizations;
    const q = search.toLowerCase();
    return organizations.filter((o) => o.name.toLowerCase().includes(q));
  }, [organizations, search]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center border-b border-border px-3 bg-card">
        <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          className="flex h-12 w-full bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Search organizations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <CommandList className="max-h-[400px] bg-card">
        <CommandEmpty>
          <div className="py-8 text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-foreground">No organizations found</p>
          </div>
        </CommandEmpty>

        {!search.trim() && recents.length > 0 && (
          <>
            <CommandGroup className="px-2 py-2">
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent</p>
              <div className="space-y-0.5">
                {recents.map((org) => (
                  <Row key={`r-${org.id}`} org={org} recent isSelected={selectedId === org.id} onSelect={() => handle(org.id)} />
                ))}
              </div>
            </CommandGroup>
            <CommandSeparator className="bg-border" />
          </>
        )}

        <CommandGroup className="px-2 py-2">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            All Organizations ({filtered.length})
          </p>
          <div className="space-y-0.5">
            {filtered.map((org) => (
              <Row key={org.id} org={org} isSelected={selectedId === org.id} onSelect={() => handle(org.id)} />
            ))}
          </div>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
