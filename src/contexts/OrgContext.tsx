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
  // Platform-admin impersonation ("view as org")
  isImpersonating: boolean;
  impersonatedOrg: Organization | null;
  startImpersonation: (org: { id: string; name: string; logo_url?: string | null }) => void;
  stopImpersonation: () => void;
};

const STORAGE_KEY = 'cds:activeOrgId';
const IMPERSONATE_KEY = 'cds:impersonatedOrg';

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

function readImpersonated(): Organization | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(IMPERSONATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id) return null;
    return { id: parsed.id, name: parsed.name, logo_url: parsed.logo_url ?? null, role: 'admin' };
  } catch {
    return null;
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonatedOrg, setImpersonatedOrg] = useState<Organization | null>(() => readImpersonated());

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

  const startImpersonation = useCallback(
    (org: { id: string; name: string; logo_url?: string | null }) => {
      const next: Organization = { id: org.id, name: org.name, logo_url: org.logo_url ?? null, role: 'admin' };
      setImpersonatedOrg(next);
      try { sessionStorage.setItem(IMPERSONATE_KEY, JSON.stringify(next)); } catch { /* noop */ }
    },
    []
  );

  const stopImpersonation = useCallback(() => {
    setImpersonatedOrg(null);
    try { sessionStorage.removeItem(IMPERSONATE_KEY); } catch { /* noop */ }
  }, []);

  // Only platform admins may impersonate; clear stale state for non-admins.
  useEffect(() => {
    if (!isAdmin && impersonatedOrg) stopImpersonation();
  }, [isAdmin, impersonatedOrg, stopImpersonation]);

  const value = useMemo<OrgContextValue>(() => {
    const isImpersonating = isAdmin && !!impersonatedOrg;
    const memberOrg = organizations.find((o) => o.id === activeOrgId) ?? null;
    const activeOrg = isImpersonating ? impersonatedOrg : memberOrg;
    return {
      activeOrg,
      organizations,
      setActiveOrg,
      isLoading,
      isOrgAdmin: activeOrg?.role === 'owner' || activeOrg?.role === 'admin',
      isOrgOwner: activeOrg?.role === 'owner',
      refresh: fetchOrgs,
      isImpersonating,
      impersonatedOrg: isImpersonating ? impersonatedOrg : null,
      startImpersonation,
      stopImpersonation,
    };
  }, [organizations, activeOrgId, isLoading, setActiveOrg, fetchOrgs, isAdmin, impersonatedOrg, startImpersonation, stopImpersonation]);

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
      isImpersonating: false,
      impersonatedOrg: null,
      startImpersonation: () => {},
      stopImpersonation: () => {},
    };
  }
  return ctx;
}
