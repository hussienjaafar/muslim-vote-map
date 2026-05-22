import { useOrg } from '@/contexts/OrgContext';

/**
 * Thin compatibility hook for ported Molitico code. Returns the active
 * organization id. Impersonation lands in a later phase.
 */
export function useClientOrganization() {
  const { activeOrg, isLoading } = useOrg();
  return { organizationId: activeOrg?.id ?? null, isLoading };
}
