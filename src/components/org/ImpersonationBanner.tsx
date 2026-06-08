import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, X, ChevronDown, Settings, Check } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useAdminOrganizations } from '@/queries/useAdminOrgQueries';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export function ImpersonationBanner() {
  const { isImpersonating, impersonatedOrg, startImpersonation, stopImpersonation } = useOrg();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Lazy-load org list only when the switcher is opened.
  const { data: orgs, isLoading } = useAdminOrganizations();

  if (!isImpersonating || !impersonatedOrg) return null;

  const handleSelect = (org: { id: string; name: string; logo_url: string | null }) => {
    setOpen(false);
    if (org.id === impersonatedOrg.id) return;
    startImpersonation({ id: org.id, name: org.name, logo_url: org.logo_url });
    navigate('/dashboard');
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500/15 border-b border-amber-500/30 backdrop-blur-sm">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 h-10 flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
        <Eye className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-amber-200 shrink-0 hidden sm:inline">Viewing as</span>

        {/* Org switcher */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 h-7 text-amber-100 hover:bg-amber-500/20 transition-colors max-w-[180px] sm:max-w-[260px]"
              aria-label="Switch organization"
            >
              <span className="font-semibold truncate">{impersonatedOrg.name}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search organizations…" />
              <CommandList>
                {isLoading ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
                ) : (
                  <>
                    <CommandEmpty>No organizations found.</CommandEmpty>
                    <CommandGroup>
                      {(orgs ?? []).map((o) => (
                        <CommandItem
                          key={o.id}
                          value={`${o.name} ${o.slug}`}
                          onSelect={() => handleSelect(o)}
                          className="cursor-pointer"
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              o.id === impersonatedOrg.id ? 'opacity-100 text-primary' : 'opacity-0'
                            )}
                          />
                          <span className="truncate">{o.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <span className="hidden md:inline text-amber-300/70">· admin impersonation</span>

        <div className="ml-auto flex items-center gap-2">
          {/* Jump back to admin panel without exiting impersonation */}
          <button
            onClick={() => navigate('/admin')}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 h-7 text-amber-100 hover:bg-amber-500/20 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Admin</span>
          </button>

          {/* Exit impersonation */}
          <button
            onClick={() => {
              stopImpersonation();
              navigate('/admin/orgs');
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 h-7 text-amber-100 hover:bg-amber-500/20 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
