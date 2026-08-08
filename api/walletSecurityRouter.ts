import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { walletDelegations, walletKeys } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { computeCustomerRef } from "./lib/wallet/customerRef";
import { getDb } from "./queries/connection";

/**
 * walletSecurityRouter — customer-controlled wallet keys.
 *
 * SECURITY CONTRACT (do not weaken):
 * - The wallet password IS the customer's secret key. It is derived into an
 *   AES-GCM key in the browser (WebCrypto, PBKDF2) and NEVER leaves the
 *   client. This router has NO field that accepts a password or a plaintext
 *   seed — `provision` stores ciphertext + salt + iv + kdf params only and
 *   hard-rejects any extra/forbidden keys.
 * - `unlockPayload` hands the sealed payload back to the OWNER only, and is
 *   rate-limited in-memory to blunt online guessing of the wallet password.
 * - `revoke` never requires any proof — the customer can always kick the
 *   platform out instantly.
 * - Nothing in this router logs ciphertext, salt, iv, or any client payload.
 */

/** Placeholder platform delegate — becomes an on-ledger SetRegularKey once
 * the DC issuer account exists (grantTxHash/revokeTxHash are reserved). */
const PLATFORM_DELEGATE_KEY_ID = "platform-delegate-1";

const XRPL_ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Keys that must never appear in any payload — secrets stay client-side. */
const FORBIDDEN_KEYS = new Set([
  "seed",
  "password",
  "secret",
  "secretKey",
  "privateKey",
  "mnemonic",
  "recoveryWords",
  "passphrase",
]);

/** Allowlist-picked, shape-validated, extra-key-rejecting provision input. */
const provisionInput = z
  .object({
    walletId: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    xrplAddress: z.string().regex(XRPL_ADDRESS_RE),
    ciphertext: z.string().min(1).max(8192).regex(BASE64_RE), // ≤ 8KB base64
    salt: z.string().min(1).max(64).regex(BASE64_RE),
    iv: z.string().min(1).max(32).regex(BASE64_RE),
  })
  .strict() // hard-reject ANY extra key
  .superRefine((val, ctx) => {
    for (const key of Object.keys(val)) {
      if (FORBIDDEN_KEYS.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `Forbidden field "${key}" — secrets never leave the client`,
        });
      }
    }
  });

/* — In-memory throttle for unlockPayload: 10 requests / 10 min / user — */
const UNLOCK_WINDOW_MS = 10 * 60 * 1000;
const UNLOCK_LIMIT = 10;
const unlockHits = new Map<number, number[]>();

function throttleUnlock(userId: number): void {
  const now = Date.now();
  const hits = (unlockHits.get(userId) ?? []).filter(
    (t) => now - t < UNLOCK_WINDOW_MS,
  );
  if (hits.length >= UNLOCK_LIMIT) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many unlock attempts — try again in a few minutes",
    });
  }
  hits.push(now);
  unlockHits.set(userId, hits);
}

export const walletSecurityRouter = createRouter({
  /** Public-safe wallet key status — NEVER returns ciphertext/salt/iv. */
  status: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select({
        walletId: walletKeys.walletId,
        xrplAddress: walletKeys.xrplAddress,
        customerRef: walletKeys.customerRef,
        delegationStatus: walletDelegations.status,
        grantedAt: walletDelegations.grantedAt,
        revokedAt: walletDelegations.revokedAt,
      })
      .from(walletKeys)
      .leftJoin(walletDelegations, eq(walletDelegations.userId, walletKeys.userId))
      .where(eq(walletKeys.userId, ctx.user.id))
      .limit(1);
    const row = rows.at(0);
    if (!row) {
      return {
        hasWallet: false as const,
        xrplAddress: null,
        walletId: null,
        customerRef: null,
        delegation: { status: null, grantedAt: null, revokedAt: null },
      };
    }
    return {
      hasWallet: true as const,
      xrplAddress: row.xrplAddress,
      walletId: row.walletId,
      customerRef: row.customerRef ?? computeCustomerRef(ctx.user.id, row.xrplAddress),
      delegation: {
        status: row.delegationStatus ?? null,
        grantedAt: row.grantedAt ?? null,
        revokedAt: row.revokedAt ?? null,
      },
    };
  }),

  /**
   * Store a freshly sealed wallet. Refuses to overwrite an existing row —
   * rotation is a future flow. Also creates the delegation row in 'revoked'
   * state (the customer starts non-participating).
   */
  provision: authedQuery
    .input(provisionInput)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db
        .select({ id: walletKeys.id })
        .from(walletKeys)
        .where(eq(walletKeys.userId, ctx.user.id))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A wallet key already exists for this account",
        });
      }
      await db.transaction(async (tx) => {
        await tx.insert(walletKeys).values({
          userId: ctx.user.id,
          walletId: input.walletId,
          xrplAddress: input.xrplAddress,
          customerRef: computeCustomerRef(ctx.user.id, input.xrplAddress),
          ciphertext: input.ciphertext,
          salt: input.salt,
          iv: input.iv,
        });
        await tx.insert(walletDelegations).values({
          userId: ctx.user.id,
          walletId: input.walletId,
          status: "revoked",
        });
      });
      return { ok: true as const, xrplAddress: input.xrplAddress };
    }),

  /**
   * Return the sealed payload to the OWNER only, throttled so the wallet
   * password can't be brute-forced through repeated downloads (the KDF cost
   * is paid per guess client-side; this caps server-side fetch attempts).
   */
  unlockPayload: authedQuery.query(async ({ ctx }) => {
    throttleUnlock(ctx.user.id);
    const rows = await getDb()
      .select({
        ciphertext: walletKeys.ciphertext,
        salt: walletKeys.salt,
        iv: walletKeys.iv,
        kdf: walletKeys.kdf,
      })
      .from(walletKeys)
      .where(eq(walletKeys.userId, ctx.user.id))
      .limit(1);
    const row = rows.at(0);
    if (!row) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No wallet key exists for this account",
      });
    }
    return row;
  }),

  /**
   * Opt the wallet INTO the Date-Coin ecosystem. Requires an existing
   * wallet_keys row; the client proves key custody by successfully
   * decrypting the payload locally before calling this.
   */
  grant: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const keyRows = await db
      .select({ walletId: walletKeys.walletId })
      .from(walletKeys)
      .where(eq(walletKeys.userId, ctx.user.id))
      .limit(1);
    const key = keyRows.at(0);
    if (!key) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Create a wallet key before granting system access",
      });
    }
    const now = new Date();
    const existing = await db
      .select({ id: walletDelegations.id })
      .from(walletDelegations)
      .where(eq(walletDelegations.userId, ctx.user.id))
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(walletDelegations)
        .set({
          status: "active",
          grantedAt: now,
          delegateKeyId: PLATFORM_DELEGATE_KEY_ID,
        })
        .where(eq(walletDelegations.userId, ctx.user.id));
    } else {
      await db.insert(walletDelegations).values({
        userId: ctx.user.id,
        walletId: key.walletId,
        status: "active",
        grantedAt: now,
        delegateKeyId: PLATFORM_DELEGATE_KEY_ID,
      });
    }
    return { ok: true as const, status: "active" as const };
  }),

  /**
   * Instant revoke. ALWAYS allowed — no password, no proof, no delegation
   * state required. The customer can kick the platform out at any time.
   */
  revoke: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const now = new Date();
    const existing = await db
      .select({ id: walletDelegations.id, walletId: walletDelegations.walletId })
      .from(walletDelegations)
      .where(eq(walletDelegations.userId, ctx.user.id))
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(walletDelegations)
        .set({ status: "revoked", revokedAt: now })
        .where(eq(walletDelegations.userId, ctx.user.id));
    } else {
      // No delegation row — revoke still succeeds. Persist the revoked state
      // when a wallet exists so "off" is durable; without a wallet there is
      // simply nothing to revoke.
      const keyRows = await db
        .select({ walletId: walletKeys.walletId })
        .from(walletKeys)
        .where(eq(walletKeys.userId, ctx.user.id))
        .limit(1);
      const key = keyRows.at(0);
      if (key) {
        await db.insert(walletDelegations).values({
          userId: ctx.user.id,
          walletId: key.walletId,
          status: "revoked",
          revokedAt: now,
        });
      }
    }
    return { ok: true as const, status: "revoked" as const };
  }),
});
