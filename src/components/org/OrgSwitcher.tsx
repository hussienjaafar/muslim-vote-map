import { useState } from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { OrgPicker } from './OrgPicker';
import { cn } from '@/lib/utils';

export function OrgSwitcher({ className }: { className?: string }) {
  const { activeOrg, organizations, setActiveOrg, isLoading } = useOrg();
  const [open, setOpen] = useState(false);

  if (isLoading || organizations.length <= 1) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-card/60 text-sm text-foreground hover:bg-accent/20 transition-colors',
          className
        )}
        aria-label="Switch organization"
      >
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="truncate max-w-[160px]">{activeOrg?.name ?? 'Select org'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <OrgPicker
        open={open}
        onOpenChange={setOpen}
        organizations={organizations}
        selectedId={activeOrg?.id ?? null}
        onSelect={setActiveOrg}
      />
    </>
  );
}
