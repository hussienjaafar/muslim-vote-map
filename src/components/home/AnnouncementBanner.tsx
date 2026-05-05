import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Info, AlertTriangle, Megaphone, X } from 'lucide-react';

const typeConfig: Record<string, { icon: typeof Info; borderColor: string; iconColor: string }> = {
  info: { icon: Info, borderColor: 'border-l-blue-500', iconColor: 'text-blue-400' },
  warning: { icon: AlertTriangle, borderColor: 'border-l-amber-500', iconColor: 'text-amber-400' },
  update: { icon: Megaphone, borderColor: 'border-l-emerald-500', iconColor: 'text-emerald-400' },
};

export function AnnouncementBanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: announcements } = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: dismissedIds } = useQuery({
    queryKey: ['dismissed-announcements', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('dismissed_announcements')
        .select('announcement_id')
        .eq('user_id', user!.id);
      return new Set((data ?? []).map(d => d.announcement_id));
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const dismiss = useMutation({
    mutationFn: async (announcementId: string) => {
      const { error } = await supabase
        .from('dismissed_announcements')
        .insert({ user_id: user!.id, announcement_id: announcementId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dismissed-announcements'] });
    },
  });

  const visible = useMemo(() => {
    if (!announcements) return [];
    return announcements.filter(a => !(dismissedIds?.has(a.id)));
  }, [announcements, dismissedIds]);

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map(ann => {
        const config = typeConfig[ann.type] ?? typeConfig.info;
        const Icon = config.icon;
        return (
          <div
            key={ann.id}
            className={`surgical-glass border border-white/[0.06] ${config.borderColor} border-l-[3px] rounded-lg px-4 py-3 flex items-start gap-3`}
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.iconColor}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{ann.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ann.body}</p>
            </div>
            {user && (
              <button
                onClick={() => dismiss.mutate(ann.id)}
                className="shrink-0 p-1 rounded hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
