import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ShoppingCart, Package, Database, Map, LogOut, Search, User, Activity, Target, MoreHorizontal, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { useCartItems } from '@/queries/useDataProductQueries';
import { DataCartIcon } from '@/components/voter-impact/DataCartIcon';
import { Button } from '@/components/ui/button';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { OrgSwitcher } from '@/components/org/OrgSwitcher';

const navItems = [
  { title: 'Dashboard', url: '/admin', icon: LayoutDashboard, end: true },
  { title: 'Users', url: '/admin/users', icon: Users },
  { title: 'Orgs', url: '/admin/orgs', icon: Building2 },
  { title: 'Orders', url: '/admin/orders', icon: ShoppingCart },
  { title: 'Products', url: '/admin/products', icon: Package },
  { title: 'Data', url: '/admin/data', icon: Database },
  { title: 'Map', url: '/admin/issue-map', icon: Map },
  { title: 'Live', url: '/admin/live', icon: Activity },
];

// Top 4 + "More" overflow on mobile bottom nav
const mobilePrimary = [
  { title: 'Home', url: '/admin', icon: LayoutDashboard, end: true },
  { title: 'Users', url: '/admin/users', icon: Users },
  { title: 'Orders', url: '/admin/orders', icon: ShoppingCart },
  { title: 'Map', url: '/admin/issue-map', icon: Map },
];
const mobileOverflow = [
  { title: 'Organizations', url: '/admin/orgs', icon: Building2 },
  { title: 'Products', url: '/admin/products', icon: Package },
  { title: 'Data', url: '/admin/data', icon: Database },
  { title: 'Live Activity', url: '/admin/live', icon: Activity },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: cartItems } = useCartItems();
  const [searchOpen, setSearchOpen] = useState(false);

  const cartCount = cartItems?.length ?? 0;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(open => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const isActive = (url: string, end?: boolean) =>
    end ? location.pathname === url : location.pathname.startsWith(url);

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-foreground">
      {/* Fixed top nav bar */}
      <header className="fixed top-0 w-full z-nav-bar bg-[#131313]/40 backdrop-blur-xl border-b border-white/10 flex justify-between items-center px-3 sm:px-6 h-14 sm:h-16 shadow-[0_0_20px_rgba(59,130,246,0.05)]">
        <div className="flex items-center gap-8 min-w-0">
          <h1 className="text-base sm:text-xl font-bold text-white tracking-tighter font-display truncate">
            <span className="hidden sm:inline">Campaign Data Solutions</span>
            <span className="sm:hidden">CDS Admin</span>
          </h1>
        </div>
        <div className="flex items-center gap-1 sm:gap-4">
          {/* Org switcher (only shows when user has 2+ orgs) */}
          <OrgSwitcher className="hidden sm:inline-flex" />

          {/* Search — Command Palette */}
          <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} aria-label="Search (⌘K)" className="h-10 w-10">
            <Search className="w-5 h-5" />
          </Button>

          {/* Cart */}
          <DataCartIcon count={cartCount} onClick={() => navigate('/admin/orders')} />

          {/* Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Profile menu" className="h-10 w-10">
                <User className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs truncate">{user?.email ?? 'Account'}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/account')}>My Account</DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">Sign Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Fixed left sidebar */}
      <aside className="fixed left-0 top-16 h-[calc(100vh-64px)] w-64 border-r border-white/5 bg-[#0e0e0e] hidden md:flex flex-col py-4 z-sidebar">
        {/* Brand block */}
        <div className="px-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
              <LayoutDashboard className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-blue-400 font-display uppercase tracking-[0.2em]">Admin Panel</p>
              <p className="text-[9px] text-muted-foreground tracking-widest uppercase">Surgical Precision Mode</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.title}
              to={item.url}
              end={item.end}
              className={`flex items-center gap-3 px-6 py-3 transition-all duration-300 ease-in-out font-display text-xs uppercase tracking-widest ${
                isActive(item.url, item.end)
                  ? 'bg-[#201f1f] text-blue-400 border-l-2 border-blue-400'
                  : 'text-muted-foreground hover:bg-[#1c1b1b] hover:text-white border-l-2 border-transparent'
              }`}
              activeClassName=""
            >
              <item.icon className="w-[18px] h-[18px]" />
              <span>{item.title}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-6 pt-4 mt-auto border-t border-white/5">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 py-4 text-muted-foreground hover:text-white transition-colors font-display text-[10px] uppercase tracking-[0.15em] w-full"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <main className="md:pl-64 pt-14 sm:pt-16 pb-20 md:pb-0 min-h-screen">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <MobileBottomNav />

      {/* Command Palette */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Jump to page…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {navItems.map((item) => (
              <CommandItem
                key={item.title}
                onSelect={() => { navigate(item.url); setSearchOpen(false); }}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (url: string, end?: boolean) =>
    end ? location.pathname === url : location.pathname.startsWith(url);

  // Hide on map pages where the page owns its own bottom UI (legend, sheet)
  const hideOnMaps = location.pathname.includes('/issue-map');
  if (hideOnMaps) return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#131313]/95 backdrop-blur-xl border-t border-white/10"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Admin bottom navigation"
    >
      <div className="flex items-stretch h-14">
        {mobilePrimary.map((item) => {
          const active = isActive(item.url, (item as any).end);
          return (
            <button
              key={item.title}
              onClick={() => navigate(item.url)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px] ${
                active ? 'text-blue-400' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label={item.title}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-wider">{item.title}</span>
              {active && <span className="absolute bottom-0 h-0.5 w-8 bg-blue-400 rounded-t-full" />}
            </button>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px] ${
                mobileOverflow.some(i => isActive(i.url)) ? 'text-blue-400' : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label="More navigation"
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-wider">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="bg-[#131313] border-white/10 pb-8">
            <SheetHeader className="text-left">
              <SheetTitle className="text-foreground font-display text-sm uppercase tracking-widest">More</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {mobileOverflow.map((item) => {
                const active = isActive(item.url);
                return (
                  <button
                    key={item.title}
                    onClick={() => { navigate(item.url); setMoreOpen(false); }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-md border min-h-[44px] transition-colors ${
                      active
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        : 'bg-white/[0.02] border-white/5 text-foreground hover:bg-white/5'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{item.title}</span>
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
