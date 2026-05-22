import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type Organization = {
  id: string;
  name: string;
  logo_url: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
};

type OrgContextValue = {
  activeOrg: Organization | null;
  organizations: Organization[];
  setActiveOrg: (orgId: string) => void;
  isLoading: boolean;
  isOrgAdmin: boolean;
  isOrgOwner: boolean;
  refresh: () => void;
};

const STORAGE_KEY = 'cds:activeOrgId';

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrgs = useCallback(async () => {
    if (!user) {
      setOrganizations([]);
      setActiveOrgIdState(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from('organization_memberships')
      .select('role, organization_id, client_organizations(id, name, logo_url)')
      .eq('user_id', user.id);

    if (error) {
      console.error('[OrgContext] fetch failed:', error);
      setOrganizations([]);
      setIsLoading(false);
      return;
    }

    const orgs: Organization[] = (data ?? [])
      .map((row: any) => {
        const o = row.client_organizations;
        if (!o) return null;
        return { id: o.id, name: o.name, logo_url: o.logo_url, role: row.role } as Organization;
      })
      .filter(Boolean) as Organization[];

    setOrganizations(orgs);

    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const chosen = orgs.find((o) => o.id === stored)?.id ?? orgs[0]?.id ?? null;
    setActiveOrgIdState(chosen);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const setActiveOrg = useCallback((orgId: string) => {
    setActiveOrgIdState(orgId);
    try { localStorage.setItem(STORAGE_KEY, orgId); } catch { /* noop */ }
  }, []);

  const value = useMemo<OrgContextValue>(() => {
    const activeOrg = organizations.find((o) => o.id === activeOrgId) ?? null;
    return {
      activeOrg,
      organizations,
      setActiveOrg,
      isLoading,
      isOrgAdmin: activeOrg?.role === 'owner' || activeOrg?.role === 'admin',
      isOrgOwner: activeOrg?.role === 'owner',
      refresh: fetchOrgs,
    };
  }, [organizations, activeOrgId, isLoading, setActiveOrg, fetchOrgs]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    // Allow usage outside provider (e.g. unauthenticated pages) — return safe defaults
    return {
      activeOrg: null,
      organizations: [],
      setActiveOrg: () => {},
      isLoading: false,
      isOrgAdmin: false,
      isOrgOwner: false,
      refresh: () => {},
    };
  }
  return ctx;
}
