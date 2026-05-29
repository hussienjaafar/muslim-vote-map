// Shared AES-GCM encryption helpers for client integration credentials.
// Imported by edge functions via relative path.

function getKeyMaterial(): Uint8Array {
  const raw = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY');
  if (!raw) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured');
  // Expect a base64-encoded 32-byte key.
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes');
  }
  return bytes;
}

async function getCryptoKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    getKeyMaterial(),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export type EncryptedPayload = { iv: string; ciphertext: string };

/** Encrypts an arbitrary JSON-serializable object. */
export async function encryptJson(obj: unknown): Promise<EncryptedPayload> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(cipher)) };
}

/** Decrypts a payload produced by encryptJson. */
export async function decryptJson<T = Record<string, unknown>>(
  payload: EncryptedPayload,
): Promise<T> {
  const key = await getCryptoKey();
  const iv = fromBase64(payload.iv);
  const cipher = fromBase64(payload.ciphertext);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
