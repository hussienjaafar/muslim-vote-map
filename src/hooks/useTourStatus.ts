import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useTourStatus() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: hasCompletedTour, isLoading } = useQuery({
    queryKey: ['tour-status', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('has_completed_tour')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data?.has_completed_tour ?? false;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const completeTour = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ has_completed_tour: true } as any)
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.setQueryData(['tour-status', user?.id], true);
    },
  });

  const resetTour = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ has_completed_tour: false } as any)
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.setQueryData(['tour-status', user?.id], false);
    },
  });

  return {
    shouldShowTour: !isLoading && hasCompletedTour === false,
    isLoading,
    completeTour,
    resetTour,
  };
}
