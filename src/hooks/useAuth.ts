import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logActivity } from '@/lib/logActivity';
import type { User } from '@supabase/supabase-js';

// Module-level flag: only one hook instance should log per SIGNED_IN event
let _loginLoggedForSession = false;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkAdmin(userId: string) {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      if (mounted) setIsAdmin(!!data);
    }

    async function checkSuspended(userId: string): Promise<boolean> {
      const { data } = await supabase
        .from('profiles')
        .select('suspended')
        .eq('id', userId)
        .maybeSingle();
      const suspended = !!(data as any)?.suspended;
      if (mounted) {
        setIsSuspended(suspended);
        if (suspended) {
          await supabase.auth.signOut();
          setUser(null);
          setIsAdmin(false);
        }
      }
      return suspended;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      // Track initial user so we can detect real sign-ins vs refreshes
      previousUserIdRef.current = u?.id ?? null;
      if (u) {
        Promise.all([checkAdmin(u.id), checkSuspended(u.id)]).then(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          checkAdmin(u.id);
          checkSuspended(u.id);

          // Only log login when transitioning from no-user to user (real sign-in),
          // not on token refreshes, page reloads, or INITIAL_SESSION events.
          // The module-level flag prevents duplicate logs from multiple hook instances.
          if (
            event === 'SIGNED_IN' &&
            previousUserIdRef.current === null &&
            !_loginLoggedForSession
          ) {
            _loginLoggedForSession = true;
            logActivity('login');
          }
          previousUserIdRef.current = u.id;
        } else {
          setIsAdmin(false);
          previousUserIdRef.current = null;
          // Reset module flag on sign-out so next real login is tracked
          _loginLoggedForSession = false;
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading, isAdmin, isSuspended };
}
