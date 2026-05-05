import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Users, Mail, FileText } from 'lucide-react';

function usePendingCount() {
  return useQuery({
    queryKey: ['admin-applications-pending-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('access_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 30_000,
  });
}

const tabs = [
  { label: 'Users', to: '/admin/users', icon: Users, end: true },
  { label: 'Invitations', to: '/admin/users/invites', icon: Mail, end: false },
  { label: 'Applications', to: '/admin/users/applications', icon: FileText, end: false, showBadge: true },
];

export default function UsersLayout() {
  const location = useLocation();
  const { data: pendingCount } = usePendingCount();

  const isActive = (to: string, end?: boolean) =>
    end ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <div className="p-4 sm:p-6 lg:p-10 space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-foreground tracking-tight">User Management</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">User accounts, roles, invitations, and access applications.</p>
      </div>

      {/* Surgical tabs */}
      <div className="flex gap-1 bg-[#1c1c1e]/80 backdrop-blur-[20px] rounded-lg border border-[rgba(255,255,255,0.08)] p-1 w-fit max-w-full overflow-x-auto">
        {tabs.map(({ label, to, icon: Icon, end, showBadge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 text-[10px] font-bold uppercase tracking-[0.15em] rounded-sm transition-colors whitespace-nowrap ${
              isActive(to, end)
                ? 'bg-[#2a2a2a] text-blue-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {showBadge && pendingCount != null && pendingCount > 0 && (
              <span className="bg-amber-500/20 text-amber-400 text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none tabular-nums">
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
