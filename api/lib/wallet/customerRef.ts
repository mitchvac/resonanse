/**
 * Pseudonymous customer number.
 *
 * A customerRef is an HMAC over the platform user id + XRPL address, keyed by
 * a server-only secret (CUSTOMER_REF_SECRET). It lets the platform confirm
 * "we are dealing with THIS customer" without storing any personal
 * information (name, email, documents) alongside the wallet.
 *
 * Properties:
 * - Deterministic: the same user+wallet always yields the same number, so we
 *   can re-derive it instead of trusting client input.
 * - Non-reversible: without the secret, the number reveals nothing.
 * - PII-free: it is not derived from — and cannot leak — name/email/documents.
 *
 * Display format: RC-XXXX-XXXX-XXXX (Crockford base32, 60 bits).
 */
import { createHmac } from "node:crypto";
import { env } from "../env";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32Encode(buf: Buffer, chars: number): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= chars) break;
  }
  return out;
}

/** Compute the customer number for a user+wallet pair. */
export function computeCustomerRef(userId: number, xrplAddress: string): string {
  const secret = env.customerRefSecret;
  if (!secret) throw new Error("CUSTOMER_REF_SECRET is not configured");
  const digest = createHmac("sha256", secret)
    .update(`resonance-customer|${userId}|${xrplAddress}`)
    .digest();
  const code = base32Encode(digest.subarray(0, 8), 12); // 60 bits
  return `RC-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

/** Format check — e.g. RC-7K3M-9Q2X-P4TD. */
export function isValidCustomerRef(ref: string): boolean {
  return /^RC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(
    ref,
  );
}
