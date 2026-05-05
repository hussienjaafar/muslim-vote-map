import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type IssueMetric =
  | 'total_donors'
  | 'gold_donors'
  | 'silver_donors'
  | 'gold_cell_phones'
  | 'silver_cell_phones';

export interface Issue {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_published: boolean;
  display_order: number;
}

export interface IssueDonorDistrict {
  id: string;
  issue_id: string;
  cd_code: string;
  state_code: string;
  district_num: number;
  gold_donors: number;
  gold_addresses: number;
  gold_cell_phones: number;
  silver_donors: number;
  silver_addresses: number;
  silver_cell_phones: number;
  total_donors: number;
}

export interface IssueDonorState {
  id: string;
  issue_id: string;
  state_code: string;
  gold_donors: number;
  gold_addresses: number;
  gold_cell_phones: number;
  silver_donors: number;
  silver_addresses: number;
  silver_cell_phones: number;
  total_donors: number;
  district_count: number;
}

export function useIssues() {
  return useQuery({
    queryKey: ['issues'],
    queryFn: async (): Promise<Issue[]> => {
      const { data, error } = await supabase
        .from('issues')
        .select('*')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Issue[];
    },
  });
}

export function useIssueDonorDistricts(issueIds: string[]) {
  return useQuery({
    queryKey: ['issue-donor-districts', [...issueIds].sort()],
    queryFn: async (): Promise<IssueDonorDistrict[]> => {
      if (!issueIds.length) return [];
      const { data, error } = await supabase
        .from('issue_donor_districts')
        .select('*')
        .in('issue_id', issueIds);
      if (error) throw error;
      return (data ?? []) as IssueDonorDistrict[];
    },
    enabled: issueIds.length > 0,
  });
}

export function useIssueDonorStates(issueIds: string[]) {
  return useQuery({
    queryKey: ['issue-donor-states', [...issueIds].sort()],
    queryFn: async (): Promise<IssueDonorState[]> => {
      if (!issueIds.length) return [];
      const { data, error } = await supabase
        .from('issue_donor_states')
        .select('*')
        .in('issue_id', issueIds);
      if (error) throw error;
      return (data ?? []) as IssueDonorState[];
    },
    enabled: issueIds.length > 0,
  });
}

// ---------------------------------------------------------------------------
// Voter context — joins donor data with voter_impact_districts/states by code.
// Used by the Issue Map sidebar to show election results + Muslim-voter
// denominators alongside donor counts.
// ---------------------------------------------------------------------------

export interface VoterDistrictContext {
  cd_code: string;
  state_code: string;
  district_num: number;
  muslim_voters: number | null;
  total_votes: number | null;
  turnout_pct: number | null;
  actual_turnout_pct: number | null;
  winner: string | null;
  winner_party: string | null;
  winner_votes: number | null;
  runner_up: string | null;
  runner_up_party: string | null;
  runner_up_votes: number | null;
  margin_votes: number | null;
  margin_pct: number | null;
}

export interface VoterStateContext {
  state_code: string;
  state_name: string;
  muslim_voters: number | null;
  registered: number | null;
  registered_pct: number | null;
  vote_2024: number | null;
  vote_2024_pct: number | null;
}

export function useVoterDistrictContext(cdCode: string | null) {
  return useQuery({
    queryKey: ['voter-context-district', cdCode],
    queryFn: async (): Promise<VoterDistrictContext | null> => {
      if (!cdCode) return null;
      const { data, error } = await supabase
        .from('voter_impact_districts')
        .select('cd_code, state_code, district_num, muslim_voters, total_votes, turnout_pct, actual_turnout_pct, winner, winner_party, winner_votes, runner_up, runner_up_party, runner_up_votes, margin_votes, margin_pct')
        .eq('cd_code', cdCode)
        .maybeSingle();
      if (error) throw error;
      return (data as VoterDistrictContext | null) ?? null;
    },
    enabled: !!cdCode,
    staleTime: 5 * 60 * 1000,
  });
}

export function useVoterStateContext(stateCode: string | null) {
  return useQuery({
    queryKey: ['voter-context-state', stateCode],
    queryFn: async (): Promise<VoterStateContext | null> => {
      if (!stateCode) return null;
      const { data, error } = await supabase
        .from('voter_impact_states')
        .select('state_code, state_name, muslim_voters, registered, registered_pct, vote_2024, vote_2024_pct')
        .eq('state_code', stateCode)
        .maybeSingle();
      if (error) throw error;
      return (data as VoterStateContext | null) ?? null;
    },
    enabled: !!stateCode,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Lightweight directory of all districts (cd_code + state) for the search dropdown.
 * Cached aggressively since it's static reference data.
 */
export function useAllDistrictsDirectory() {
  return useQuery({
    queryKey: ['all-districts-directory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voter_impact_districts')
        .select('cd_code, state_code, district_num, muslim_voters')
        .order('cd_code', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useAllStatesDirectory() {
  return useQuery({
    queryKey: ['all-states-directory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voter_impact_states')
        .select('state_code, state_name, muslim_voters')
        .order('state_name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 60 * 1000,
  });
}
