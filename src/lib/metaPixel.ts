/**
 * Meta Pixel + Conversions API helper.
 *
 * The pixel is initialised dynamically by calling `initMetaPixel()` once
 * at app boot. It fetches the pixel ID from the meta-capi edge function
 * (GET request) to avoid hardcoding secrets.
 *
 * Client-side: fires fbq() with a unique event_id for dedup.
 * Server-side: fire-and-forget POST to the meta-capi edge function
 * which relays to Meta's Conversions API with SHA-256 hashed PII.
 */

import { supabase } from '@/integrations/supabase/client';

let pixelId: string | null = null;
let pixelReady = false;

/* ------------------------------------------------------------------ */
/*  fbq type shim                                                      */
/* ------------------------------------------------------------------ */
declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
  }
}

/* ------------------------------------------------------------------ */
/*  Bootstrap: load pixel script + init                                */
/* ------------------------------------------------------------------ */
export async function initMetaPixel() {
  if (pixelReady) return;

  try {
    const { data, error } = await supabase.functions.invoke('meta-capi', {
      method: 'GET',
    });
    if (error || !data?.pixel_id) {
      console.warn('Could not fetch Meta pixel ID:', error);
      return;
    }
    pixelId = data.pixel_id;
  } catch {
    console.warn('Meta Pixel init failed');
    return;
  }

  // Inject fbevents.js
  const f = window as any;
  if (f.fbq) return;
  const n: any = (f.fbq = function (...args: any[]) {
    n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
  });
  if (!f._fbq) f._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [] as any[];

  const t = document.createElement('script');
  t.async = true;
  t.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const s = document.getElementsByTagName('script')[0];
  s?.parentNode?.insertBefore(t, s);

  window.fbq!('init', pixelId);
  window.fbq!('track', 'PageView');
  pixelReady = true;
}

/* ------------------------------------------------------------------ */
/*  Advanced matching — call after login to improve match rates        */
/* ------------------------------------------------------------------ */
export function initAdvancedMatching(userData: {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}) {
  if (!pixelId || !window.fbq) return;

  const matchData: Record<string, string> = {};
  if (userData.email) matchData.em = userData.email.trim().toLowerCase();
  if (userData.firstName) matchData.fn = userData.firstName.trim().toLowerCase();
  if (userData.lastName) matchData.ln = userData.lastName.trim().toLowerCase();
  if (userData.phone) matchData.ph = userData.phone.replace(/\D/g, '');

  if (Object.keys(matchData).length > 0) {
    window.fbq('init', pixelId, matchData);
  }
}

/* ------------------------------------------------------------------ */
/*  Core tracking function                                             */
/* ------------------------------------------------------------------ */
interface TrackOptions {
  eventName: string;
  customData?: Record<string, any>;
  userData?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
}

function track({ eventName, customData, userData }: TrackOptions): string {
  const eventId = crypto.randomUUID();

  // 1. Client-side pixel
  if (window.fbq) {
    window.fbq('track', eventName, customData ?? {}, { eventID: eventId });
  }

  // 2. Server-side CAPI (fire-and-forget)
  supabase.functions
    .invoke('meta-capi', {
      body: {
        event_name: eventName,
        event_id: eventId,
        event_source_url: window.location.href,
        user_data: userData ?? {},
        custom_data: customData ?? {},
        fbc: getCookie('_fbc') ?? undefined,
        fbp: getCookie('_fbp') ?? undefined,
      },
    })
    .catch(() => {});

  return eventId;
}

/* ------------------------------------------------------------------ */
/*  Typed event helpers                                                 */
/* ------------------------------------------------------------------ */

export function trackLead(data: {
  contentName: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}) {
  return track({
    eventName: 'Lead',
    customData: {
      content_name: data.contentName,
      content_category: 'access_request',
    },
    userData: {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
    },
  });
}

export function trackCompleteRegistration(data: {
  email: string;
  firstName?: string;
  lastName?: string;
}) {
  return track({
    eventName: 'CompleteRegistration',
    customData: {
      content_name: data.email,
      status: true,
    },
    userData: {
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
    },
  });
}

export function trackAddToCart(data: {
  productId: string;
  productName: string;
  geoName: string;
  email?: string;
}) {
  return track({
    eventName: 'AddToCart',
    customData: {
      content_type: 'product',
      content_ids: [data.productId],
      content_name: data.geoName,
    },
    userData: { email: data.email },
  });
}

export function trackInitiateCheckout(data: {
  itemCount: number;
  orderId: string;
  email?: string;
  firstName?: string;
}) {
  return track({
    eventName: 'InitiateCheckout',
    customData: {
      num_items: data.itemCount,
      content_type: 'product',
    },
    userData: {
      email: data.email,
      firstName: data.firstName,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Utility                                                            */
/* ------------------------------------------------------------------ */
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
