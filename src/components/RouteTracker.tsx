import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { logActivity } from '@/lib/logActivity';
import { initMetaPixel, initAdvancedMatching } from '@/lib/metaPixel';
import { useAuth } from '@/hooks/useAuth';

/**
 * Logs page_view events on route changes. Debounced to skip rapid redirects.
 * Also initialises Meta Pixel advanced matching when a user is authenticated.
 * Mount once inside <BrowserRouter>.
 */
export function RouteTracker() {
  const { pathname } = useLocation();
  const prevPath = useRef(pathname);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const { user } = useAuth();
  const matchingInitRef = useRef(false);

  // Bootstrap Meta Pixel on first mount
  useEffect(() => {
    initMetaPixel();
  }, []);

  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    // Debounce: skip if another nav happens within 300ms (redirects)
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      logActivity('page_view', { path: pathname });
    }, 300);

    return () => clearTimeout(timer.current);
  }, [pathname]);

  // Init Meta Pixel advanced matching once when user is available
  useEffect(() => {
    if (!user || matchingInitRef.current) return;
    matchingInitRef.current = true;

    const fullName = user.user_metadata?.full_name || '';
    const parts = fullName.split(' ');
    initAdvancedMatching({
      email: user.email,
      firstName: parts[0] || undefined,
      lastName: parts.slice(1).join(' ') || undefined,
    });
  }, [user]);

  return null;
}
