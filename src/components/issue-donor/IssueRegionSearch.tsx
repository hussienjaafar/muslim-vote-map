import React, { useState, useMemo } from 'react';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { STATE_ABBREVIATIONS } from '@/lib/us-states';
import { useIsMobile } from '@/hooks/use-mobile';

interface IssueRegionSearchProps {
  statesData: Array<{ state_code: string; state_name: string }> | null;
  districtsData: Array<{ cd_code: string; state_code: string }> | null;
  onSelect: (regionId: string, type: 'state' | 'district') => void;
}

export function IssueRegionSearch({ statesData, districtsData, onSelect }: IssueRegionSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const isMobile = useIsMobile();

  const stateOptions = useMemo(() => {
    if (!statesData) return [];
    const all = statesData
      .map(s => ({
        id: s.state_code,
        label: `${s.state_name} (${s.state_code})`,
        type: 'state' as const,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter(s => s.label.toLowerCase().includes(q));
  }, [statesData, query]);

  const districtOptions = useMemo(() => {
    if (!districtsData || !query || query.length < 2) return [];
    const q = query.toLowerCase();
    return districtsData
      .filter(d => {
        const code = d.cd_code?.toLowerCase() || '';
        const stateName = (STATE_ABBREVIATIONS[d.state_code] || '').toLowerCase();
        return code.includes(q) || stateName.includes(q) || d.state_code?.toLowerCase().includes(q);
      })
      .slice(0, 20)
      .map(d => ({
        id: d.cd_code,
        label: `${d.cd_code} — ${STATE_ABBREVIATIONS[d.state_code] || d.state_code}`,
        type: 'district' as const,
        voters: d.muslim_voters ?? 0,
      }));
  }, [districtsData, query]);

  const handleSelect = (id: string, type: 'state' | 'district') => {
    setOpen(false);
    setQuery('');
    onSelect(id, type);
  };

  const commandContent = (
    <Command shouldFilter={false} className="rounded-lg border border-[rgba(255,255,255,0.08)] shadow-md bg-popover/95 backdrop-blur-[20px]">
      <CommandInput
        placeholder="Search states or districts…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {stateOptions.length > 0 && (
          <CommandGroup heading={<span className="font-display">States</span>}>
            {stateOptions.map(s => (
              <CommandItem key={s.id} value={s.label} onSelect={() => handleSelect(s.id, 'state')}>
                <div className="flex items-center justify-between w-full">
                  <span>{s.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{s.voters.toLocaleString()} voters</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {districtOptions.length > 0 && (
          <CommandGroup heading={<span className="font-display">Districts</span>}>
            {districtOptions.map(d => (
              <CommandItem key={d.id} value={d.label} onSelect={() => handleSelect(d.id, 'district')}>
                <div className="flex items-center justify-between w-full">
                  <span>{d.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{d.voters.toLocaleString()} voters</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );

  if (isMobile) {
    return (
      <>
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="h-8 w-8">
          <Search className="w-4 h-4" />
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="p-0 gap-0 max-w-[95vw] sm:max-w-lg">
            {commandContent}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-1.5 text-xs text-muted-foreground font-normal px-2.5 border-white/10 bg-[#1c1c1e]/80 hover:bg-white/5"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Search regions…</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 max-w-lg">
          {commandContent}
        </DialogContent>
      </Dialog>
    </>
  );
}