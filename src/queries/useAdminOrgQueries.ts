import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export type AdminOrg = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  seat_limit: number;
  created_at: string;
  member_count: number;
};

export type OrgMember = {
  membership_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
  full_name: string | null;
  email: string | null;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `org-${Date.now()}`;
}

/** All client organizations with member counts (platform admin only). */
export function useAdminOrganizations() {
  return useQuery<AdminOrg[]>({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
      const [orgsRes, memsRes] = await Promise.all([
        supabase.from('client_organizations').select('*').order('created_at', { ascending: false }),
        supabase.from('organization_memberships').select('organization_id'),
      ]);
      if (orgsRes.error) throw orgsRes.error;

      const counts = new Map<string, number>();
      (memsRes.data ?? []).forEach((m: any) => {
        counts.set(m.organization_id, (counts.get(m.organization_id) ?? 0) + 1);
      });

      return (orgsRes.data ?? []).map((o: any) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        logo_url: o.logo_url,
        seat_limit: o.seat_limit,
        created_at: o.created_at,
        member_count: counts.get(o.id) ?? 0,
      }));
    },
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, seatLimit }: { name: string; seatLimit: number }) => {
      const { data, error } = await supabase
        .from('client_organizations')
        .insert({ name: name.trim(), slug: slugify(name), seat_limit: seatLimit })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-organizations'] }),
  });
}

export function useAdminOrganization(orgId: string | undefined) {
  return useQuery<AdminOrg | null>({
    queryKey: ['admin-organization', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('client_organizations')
        .select('*')
        .eq('id', orgId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { ...(data as any), member_count: 0 } as AdminOrg;
    },
  });
}

export function useOrgMembers(orgId: string | undefined) {
  return useQuery<OrgMember[]>({
    queryKey: ['org-members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return [];
      const { data: mems, error } = await supabase
        .from('organization_memberships')
        .select('id, user_id, role, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const ids = (mems ?? []).map((m: any) => m.user_id);
      const profilesMap = new Map<string, { full_name: string | null; email: string | null }>();
      if (ids.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', ids);
        (profiles ?? []).forEach((p: any) => profilesMap.set(p.id, { full_name: p.full_name, email: p.email }));
      }

      return (mems ?? []).map((m: any) => ({
        membership_id: m.id,
        user_id: m.user_id,
        role: m.role,
        created_at: m.created_at,
        full_name: profilesMap.get(m.user_id)?.full_name ?? null,
        email: profilesMap.get(m.user_id)?.email ?? null,
      }));
    },
  });
}

export function useUpdateMemberRole(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ membershipId, role }: { membershipId: string; role: OrgRole }) => {
      const { error } = await supabase
        .from('organization_memberships')
        .update({ role })
        .eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members', orgId] }),
  });
}

export function useRemoveMember(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase
        .from('organization_memberships')
        .delete()
        .eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members', orgId] }),
  });
}

export function useAddMember(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: OrgRole }) => {
      if (!orgId) throw new Error('No organization selected');
      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) throw new Error('No user found with that email. They must sign up first.');

      const { error } = await supabase
        .from('organization_memberships')
        .insert({ organization_id: orgId, user_id: profile.id, role });
      if (error) {
        if (error.code === '23505') throw new Error('That user is already a member of this organization.');
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members', orgId] }),
  });
}

export type SeatRequest = {
  id: string;
  requested_seats: number;
  current_seat_limit: number;
  reason: string | null;
  status: string;
  created_at: string;
};

export function useSeatRequests(orgId: string | undefined) {
  return useQuery<SeatRequest[]>({
    queryKey: ['seat-requests', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('seat_requests')
        .select('id, requested_seats, current_seat_limit, reason, status, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SeatRequest[];
    },
  });
}

/** Approve/reject a seat request; on approval bump seat_limit + write change log. */
export function useProcessSeatRequest(orgId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      request,
      approve,
      notes,
    }: {
      request: SeatRequest;
      approve: boolean;
      notes?: string;
    }) => {
      if (!orgId) throw new Error('No organization selected');

      if (approve) {
        const { error: orgErr } = await supabase
          .from('client_organizations')
          .update({ seat_limit: request.requested_seats })
          .eq('id', orgId);
        if (orgErr) throw orgErr;

        const { error: logErr } = await supabase.from('seat_change_log').insert({
          organization_id: orgId,
          changed_by: user?.id ?? null,
          delta: request.requested_seats - request.current_seat_limit,
          previous_limit: request.current_seat_limit,
          new_limit: request.requested_seats,
          reason: notes ?? request.reason ?? 'Seat request approved',
        });
        if (logErr) throw logErr;
      }

      const { error } = await supabase
        .from('seat_requests')
        .update({
          status: approve ? 'approved' : 'rejected',
          processed_by: user?.id ?? null,
          processed_at: new Date().toISOString(),
          admin_notes: notes ?? null,
        })
        .eq('id', request.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seat-requests', orgId] });
      qc.invalidateQueries({ queryKey: ['admin-organization', orgId] });
      qc.invalidateQueries({ queryKey: ['admin-organizations'] });
    },
  });
}

export function useUpdateSeatLimit(orgId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ newLimit, previousLimit }: { newLimit: number; previousLimit: number }) => {
      if (!orgId) throw new Error('No organization selected');
      const { error } = await supabase
        .from('client_organizations')
        .update({ seat_limit: newLimit })
        .eq('id', orgId);
      if (error) throw error;
      await supabase.from('seat_change_log').insert({
        organization_id: orgId,
        changed_by: user?.id ?? null,
        delta: newLimit - previousLimit,
        previous_limit: previousLimit,
        new_limit: newLimit,
        reason: 'Manual seat adjustment by platform admin',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-organization', orgId] });
      qc.invalidateQueries({ queryKey: ['admin-organizations'] });
    },
  });
}
