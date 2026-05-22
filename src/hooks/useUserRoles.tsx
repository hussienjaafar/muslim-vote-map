import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/contexts/OrgContext';

export function useUserRoles() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { organizations, isLoading: orgLoading, refresh } = useOrg();
  const isClientUser = organizations.length > 0;
  return {
    isAdmin,
    isClientUser,
    organizations,
    hasMultipleRoles: isAdmin && isClientUser,
    loading: authLoading || orgLoading,
    refresh,
  };
}
