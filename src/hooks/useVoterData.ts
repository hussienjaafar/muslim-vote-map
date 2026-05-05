import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useStatesData() {
  return useQuery({
    queryKey: ['voter-states'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voter_impact_states')
        .select('*');
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useDistrictsData(stateCode?: string | null) {
  return useQuery({
    queryKey: ['voter-districts', stateCode],
    queryFn: async () => {
      let query = supabase.from('voter_impact_districts').select('*');
      if (stateCode) query = query.eq('state_code', stateCode);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!stateCode,
  });
}

export function useAllDistricts() {
  return useQuery({
    queryKey: ['voter-districts-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voter_impact_districts')
        .select('id, cd_code, state_code, district_num, can_impact, muslim_voters, muslim_registered, muslim_unregistered, voted_2024, didnt_vote_2024, actual_turnout_pct, margin_votes, margin_pct, votes_needed, donor_gold_count, donor_silver_count, donor_platinum_count, political_activists, political_donors, cell_phones, households, winner, winner_party, winner_votes, runner_up, runner_up_party, runner_up_votes, total_votes, turnout_pct, voted_2022, turnout_2022_pct, primary_2024, primary_2024_pct, primary_2022, primary_2022_pct, registration_pct, cost_estimate');
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });
}
