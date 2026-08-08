/**
 * walletSecurity/crypto.ts — client-side key custody for Date-Coin wallets.
 *
 * SECURITY BOUNDARY: everything in this module runs ONLY in the browser via
 * WebCrypto. The wallet password derives (PBKDF2-SHA-256, 250k iterations)
 * the AES-GCM 256 key that seals the XRPL wallet seed. The server only ever
 * receives ciphertext + salt + iv + kdf params — never the password, never
 * a plaintext seed.
 *
 * NOTE on memory hygiene: JavaScript cannot guarantee when (or whether)
 * strings are garbage-collected, so plaintext seed lifetime is deliberately
 * scoped to the create/unlock handlers that call these functions. Callers
 * overwrite local references after use and never persist plaintext to
 * React state beyond the one-time recovery reveal, or to any storage.
 */

export const KDF_LABEL = 'PBKDF2-250000';
const KDF_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export type WalletSecurityErrorCode =
  | 'WRONG_PASSWORD'
  | 'DECRYPT_FAILED'
  | 'UNSUPPORTED'
  | 'GENERATION_FAILED';

export class WalletSecurityError extends Error {
  readonly code: WalletSecurityErrorCode;

  constructor(code: WalletSecurityErrorCode, message: string) {
    super(message);
    this.name = 'WalletSecurityError';
    this.code = code;
  }
}

export type SealedSeed = {
  ciphertextB64: string;
  saltB64: string;
  ivB64: string;
};

/* ------------------------------------------------------------------ */
/* base64 helpers (chunked so large payloads can't blow the stack)     */
/* ------------------------------------------------------------------ */

export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Key derivation + seal/open                                          */
/* ------------------------------------------------------------------ */

function assertWebCrypto(): void {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new WalletSecurityError(
      'UNSUPPORTED',
      'This browser does not support the Web Crypto API',
    );
  }
}

/** PBKDF2-SHA-256 × 250,000 → non-extractable AES-GCM 256 CryptoKey. */
export async function deriveKey(password: string, saltB64: string): Promise<CryptoKey> {
  assertWebCrypto();
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(saltB64) as BufferSource,
      iterations: KDF_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Seal a plaintext seed with a fresh random salt + iv. */
export async function encryptSeed(password: string, seed: string): Promise<SealedSeed> {
  assertWebCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, toBase64(salt));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(seed),
  );
  return {
    ciphertextB64: toBase64(new Uint8Array(sealed)),
    saltB64: toBase64(salt),
    ivB64: toBase64(iv),
  };
}

/**
 * Open a sealed seed. A wrong password fails the AES-GCM auth tag — mapped
 * to a WalletSecurityError('WRONG_PASSWORD') so callers can show a friendly
 * inline error instead of a raw DOMException.
 */
export async function decryptSeed(password: string, sealed: SealedSeed): Promise<string> {
  assertWebCrypto();
  try {
    const key = await deriveKey(password, sealed.saltB64);
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.ivB64) as BufferSource },
      key,
      fromBase64(sealed.ciphertextB64) as BufferSource,
    );
    return new TextDecoder().decode(opened);
  } catch (err) {
    if (err instanceof WalletSecurityError) throw err;
    if (err instanceof DOMException && err.name === 'OperationError') {
      throw new WalletSecurityError('WRONG_PASSWORD', 'Decryption failed');
    }
    throw new WalletSecurityError('DECRYPT_FAILED', 'Decryption failed');
  }
}

/* ------------------------------------------------------------------ */
/* Password strength (length + character-class variety)                */
/* ------------------------------------------------------------------ */

export type PasswordStrength = {
  /** 0–4 */
  score: number;
  label: string;
};

const STRENGTH_LABELS = ['Very weak', 'Weak', 'Okay', 'Strong', 'Excellent'] as const;

export function passwordStrength(pw: string): PasswordStrength {
  if (pw.length === 0) return { score: 0, label: STRENGTH_LABELS[0] };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (pw.length >= 16) score += 1;
  const classes = [
    /[a-z]/.test(pw),
    /[A-Z]/.test(pw),
    /\d/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ].filter(Boolean).length;
  if (classes >= 3) score += 1;
  score = Math.min(4, score);
  return { score, label: STRENGTH_LABELS[score] };
}

/* ------------------------------------------------------------------ */
/* XRPL wallet generation (dynamic import keeps xrpl out of main bundle) */
/* ------------------------------------------------------------------ */

export type GeneratedXrplWallet = {
  /** Classic address (r…) — public, safe to store. */
  address: string;
  /** Family seed (sEd…) — PLAINTEXT SECRET. Scope it, then wipe it. */
  seed: string;
};

export async function generateXrplWallet(): Promise<GeneratedXrplWallet> {
  const { Wallet } = await import('xrpl');
  const wallet = Wallet.generate();
  if (!wallet.address || !wallet.seed) {
    throw new WalletSecurityError('GENERATION_FAILED', 'Wallet generation failed');
  }
  return { address: wallet.address, seed: wallet.seed };
}
