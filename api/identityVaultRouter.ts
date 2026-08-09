import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { identityVault, identityVaultAudit, walletKeys } from "@db/schema";
import {
  decryptVaultPayload,
  encryptVaultPayload,
  vaultPayloadSchema,
} from "./lib/identity/vaultCrypto";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { screenCustomerRef } from "./lib/sanctions/screener";
import { awardDc, EVENT_IDENTITY_VAULT, VAULT_BONUS_AMOUNT } from "./lib/wallet/earn";

/**
 * identityVaultRouter — Encrypted ID Vault (self-hosted KYC Phase 1)
 *
 * Customers submit legal identity data (tax/verification compliance). The
 * server stores it as ONE AES-256-GCM envelope (api/lib/identity/vaultCrypto)
 * keyed ONLY by the pseudonymous customerRef (RC-XXXX-XXXX-XXXX) — there is
 * no userId column and no display-name connection.
 *
 * SECURITY CONTRACT (do not weaken):
 * - customerRef is ALWAYS resolved server-side from ctx.user.id via
 *   wallet_keys — it is NEVER accepted from client input.
 * - `status` never returns the payload or any PII field.
 * - Audit meta carries counts/actions only — never PII.
 * - `export` decrypts only the caller's OWN record.
 */

/** Resolve the caller's pseudonymous customer number via their wallet. */
async function resolveCustomerRef(userId: number): Promise<string> {
  const rows = await getDb()
    .select({ customerRef: walletKeys.customerRef })
    .from(walletKeys)
    .where(eq(walletKeys.userId, userId))
    .limit(1);
  const customerRef = rows.at(0)?.customerRef;
  if (!customerRef) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Set up your wallet first",
    });
  }
  return customerRef;
}

/** Audit trail row — meta must never contain PII. */
async function audit(
  customerRef: string,
  action: "UPSERT" | "EXPORT" | "PURGE",
  actorUserId: number,
  meta?: Record<string, unknown>,
): Promise<void> {
  await getDb()
    .insert(identityVaultAudit)
    .values({ customerRef, action, actorUserId, meta: meta ?? null });
}

export const identityVaultRouter = createRouter({
  /**
   * Public-safe vault status — returns existence + lifecycle state only.
   * NEVER returns the payload or any identity field.
   */
  status: authedQuery.query(async ({ ctx }) => {
    const customerRef = await resolveCustomerRef(ctx.user.id);
    const rows = await getDb()
      .select({ status: identityVault.status, createdAt: identityVault.createdAt })
      .from(identityVault)
      .where(eq(identityVault.customerRef, customerRef))
      .limit(1);
    const row = rows.at(0);
    if (!row) {
      return { hasRecord: false as const, status: null, submittedAt: null };
    }
    return { hasRecord: true as const, status: row.status, submittedAt: row.createdAt };
  }),

  /**
   * Seal and store (or replace) the caller's identity payload. The payload is
   * validated + encrypted before it touches the DB; upsert keys on the unique
   * customerRef so a customer always has exactly one record.
   */
  upsert: authedQuery
    .input(vaultPayloadSchema)
    .mutation(async ({ ctx, input }) => {
      const customerRef = await resolveCustomerRef(ctx.user.id);
      const payload = encryptVaultPayload(input);
      const fieldCount = Object.values(input).filter(
        (value) => value !== undefined && value !== "",
      ).length;
      const db = getDb();
      await db
        .insert(identityVault)
        .values({ customerRef, payload })
        .onDuplicateKeyUpdate({ set: { payload, updatedAt: new Date() } });
      await audit(customerRef, "UPSERT", ctx.user.id, { fieldCount });
      // Phase 3 hook: screen the freshly-submitted legal name against the
      // sanctions lists. Fire-and-forget — a screening outage must never
      // block a vault write; failures surface via sanctions.status instead.
      void screenCustomerRef(customerRef, input.legalName).catch(() => {});
      // V70 earn hook: one-time +VAULT_BONUS_AMOUNT DC for completing the
      // Identity Vault. Idempotent (unique key) — re-submissions don't
      // double-award. Fire-and-forget like screening; never blocks the write.
      void awardDc(ctx.user.id, EVENT_IDENTITY_VAULT, VAULT_BONUS_AMOUNT).catch(
        () => {},
      );
      return { ok: true as const };
    }),

  /**
   * Decrypt and return the caller's OWN record (data-portability style).
   * This is the only procedure that returns plaintext, and only to the owner.
   */
  export: authedQuery.query(async ({ ctx }) => {
    const customerRef = await resolveCustomerRef(ctx.user.id);
    const rows = await getDb()
      .select({ payload: identityVault.payload })
      .from(identityVault)
      .where(eq(identityVault.customerRef, customerRef))
      .limit(1);
    const row = rows.at(0);
    if (!row) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No identity record exists for your customer number",
      });
    }
    await audit(customerRef, "EXPORT", ctx.user.id);
    return decryptVaultPayload(row.payload);
  }),

  /**
   * Delete the caller's vault record. Idempotent — purging when nothing is
   * stored still succeeds; only a real deletion is audited.
   */
  purge: authedQuery.mutation(async ({ ctx }) => {
    const customerRef = await resolveCustomerRef(ctx.user.id);
    const db = getDb();
    const rows = await db
      .select({ id: identityVault.id })
      .from(identityVault)
      .where(eq(identityVault.customerRef, customerRef))
      .limit(1);
    if (rows.length > 0) {
      await db
        .delete(identityVault)
        .where(eq(identityVault.customerRef, customerRef));
      await audit(customerRef, "PURGE", ctx.user.id);
    }
    return { ok: true as const };
  }),
});
