// Shared helpers for the Meta (Facebook) Marketing API OAuth flow.

export const META_GRAPH_VERSION = 'v19.0';
export const META_SCOPES = [
  'ads_read',
  'ads_management',
  'business_management',
  'pages_read_engagement',
  'pages_show_list',
].join(',');

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY');
  if (!secret) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured');
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export type StatePayload = {
  orgId: string;
  userId: string;
  redirectUri: string;
  ts: number;
};

/** Builds a tamper-proof, time-limited OAuth state token. */
export async function signState(payload: StatePayload): Promise<string> {
  const key = await hmacKey();
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))));
  return `${body}.${sig}`;
}

/** Verifies and parses a state token, rejecting tampered or expired (>15 min) tokens. */
export async function verifyState(token: string): Promise<StatePayload> {
  const [body, sig] = (token ?? '').split('.');
  if (!body || !sig) throw new Error('Malformed state');
  const key = await hmacKey();
  const ok = await crypto.subtle.verify('HMAC', key, fromB64url(sig), new TextEncoder().encode(body));
  if (!ok) throw new Error('Invalid state signature');
  const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as StatePayload;
  if (Date.now() - payload.ts > 15 * 60 * 1000) throw new Error('State expired');
  return payload;
}
