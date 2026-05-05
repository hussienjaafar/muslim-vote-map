import { supabase } from '@/integrations/supabase/client';

/**
 * Fire-and-forget activity logger. Never throws.
 */
export function logActivity(eventType: string, metadata: Record<string, unknown> = {}) {
  void (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) return;

      await supabase.functions.invoke('log-activity', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: { event_type: eventType, metadata },
      });
    } catch {
      // silently swallow – activity logging is non-critical
    }
  })();
}
