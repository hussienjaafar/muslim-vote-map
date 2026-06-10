import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/contexts/OrgContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrgSwitcher } from '@/components/org/OrgSwitcher';
import { User, LogOut, TrendingUp, Map, Loader2, MessageSquare } from 'lucide-react';
import Home from './Home';
import Dashboard from './Dashboard';
import SmsBroadcasts from './SmsBroadcasts';

export default function Workspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { activeOrg, organizations, isLoading: orgLoading } = useOrg();
  // True for real org members AND admins impersonating an org ("View as org").
  const hasOrg = !!activeOrg || organizations.length > 0;
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user!.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const initial = (profile?.full_name || user?.email || '?').charAt(0).toUpperCase();

  // Org members default to the Fundraising tab; non-org users only ever see Data.
  const tabParam = searchParams.get('tab');
  const tab = hasOrg ? (tabParam === 'data' ? 'data' : tabParam === 'sms' ? 'sms' : 'fundraising') : 'data';

  const setTab = (next: string) => {
    setSearchParams(
      (prev) => {
        prev.set('tab', next);
        return prev;
      },
      { replace: true }
    );
  };

  if (orgLoading) {
    return (
      <div className="min-h-dvh bg-[hsl(0_0%_5.5%)] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[hsl(0_0%_5.5%)]">
      {/* Shared header */}
      <header className="sticky top-0 z-40 bg-[hsl(0_0%_7.5%)]/40 backdrop-blur-2xl border-b border-white/[0.04] shadow-[0_0_20px_hsl(var(--primary)/0.05)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <img src="/logo-icon.png" alt="CDS" className="h-7 w-7 rounded-md" />
            <span className="font-display text-sm font-semibold text-foreground hidden md:inline">Campaign Data Solutions</span>
          </div>

          {hasOrg && (
            <Tabs value={tab} onValueChange={setTab} className="min-w-0">
              <TabsList>
                <TabsTrigger value="fundraising" className="gap-1.5">
                  <TrendingUp className="w-4 h-4" /> <span className="hidden sm:inline">Fundraising</span>
                </TabsTrigger>
                <TabsTrigger value="data" className="gap-1.5">
                  <Map className="w-4 h-4" /> <span className="hidden sm:inline">Data &amp; Issues</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <OrgSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="focus:outline-none" data-tour="account-menu">
                  <Avatar className="h-8 w-8 border border-white/10 cursor-pointer shadow-[0_0_8px_hsl(var(--primary)/0.15)]">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initial}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="surgical-glass min-w-[160px]">
                <DropdownMenuItem onClick={() => navigate('/account')} className="cursor-pointer gap-2">
                  <User className="w-4 h-4" /> My Account
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}
                  className="cursor-pointer gap-2 text-red-400 focus:text-red-400"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {tab === 'fundraising' ? (
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10">
          <Dashboard embedded />
        </div>
      ) : (
        <Home embedded />
      )}
    </div>
  );
}
