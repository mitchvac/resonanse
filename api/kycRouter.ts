import { TRPCError } from "@trpc/server";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { identityVault, identityVaultAudit, walletKeys } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  decryptVaultPayload,
  encryptVaultPayload,
} from "./lib/identity/vaultCrypto";
import { crossCheck } from "./lib/kyc/docVerify";
import { extractMrzLines, parseMrz } from "./lib/kyc/mrzExtract";
import { ocrMrzRegion } from "./lib/kyc/ocr";
import { verifyFace, type FaceVerdict } from "./lib/kyc/face/faceVerify";

/**
 * kycRouter — KYC Phase 2a: document verification via MRZ.
 *
 * Members photograph their passport / national ID; the server OCRs the image
 * IN MEMORY (zero retention — the image never touches disk or the database),
 * extracts and validates the ICAO 9303 MRZ (incl. check digits), and
 * cross-checks it against the member's existing encrypted Identity Vault
 * record (legalName / dob). On match the vault status becomes "verified";
 * on mismatch or unreadable documents the status is unchanged and reason
 * codes are returned. Attempts are rate-limited per day.
 *
 * SECURITY CONTRACT (do not weaken):
 * - customerRef is ALWAYS resolved server-side from ctx.user.id via
 *   wallet_keys — never accepted from client input.
 * - The uploaded image lives only in local Buffer variables and is eligible
 *   for GC as soon as the procedure returns. Nothing derived from the image
 *   (OCR text, MRZ fields, PII) is ever logged, audited, or persisted —
 *   audit meta carries the verdict string ONLY.
 * - OCR/infrastructure failures surface as one generic message; internals
 *   never leak to the client.
 */

const MAX_ATTEMPTS_PER_DAY = 5;
/** 10 MB decoded image cap (input base64 is capped at ~14 MB chars). */
const MAX_DECODED_BYTES = 10 * 1024 * 1024;
/** 5 MB decoded cap per selfie frame (input base64 capped at ~7 MB chars). */
const MAX_FRAME_DECODED_BYTES = 5 * 1024 * 1024;

export type KycVerdict =
  | "VERIFIED"
  | "MISMATCH"
  | "UNREADABLE"
  | "UNSUPPORTED"
  | "ALREADY_VERIFIED";

export interface SubmitDocResult {
  verdict: KycVerdict;
  mismatches?: string[];
  reason?: string;
  attemptsToday: number;
  maxAttempts: number;
}

export interface SubmitFaceResult {
  verdict: FaceVerdict | "ALREADY_VERIFIED";
  scoreBand?: "high" | "medium" | "low";
  reason?: string;
  attemptsToday: number;
  maxAttempts: number;
}

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

/** Audit trail row — meta must never contain PII or document data. */
async function audit(
  customerRef: string,
  action: "DOC_ATTEMPT" | "FACE_ATTEMPT" | "STATUS_CHANGE",
  actorUserId: number,
  meta?: Record<string, unknown>,
): Promise<void> {
  await getDb()
    .insert(identityVaultAudit)
    .values({ customerRef, action, actorUserId, meta: meta ?? null });
}

/**
 * Number of verification-attempt audit rows (document + face — they share
 * one daily budget) for the customer since UTC midnight.
 */
async function verificationAttemptsToday(customerRef: string): Promise<number> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const rows = await getDb()
    .select({ n: count() })
    .from(identityVaultAudit)
    .where(
      and(
        eq(identityVaultAudit.customerRef, customerRef),
        inArray(identityVaultAudit.action, ["DOC_ATTEMPT", "FACE_ATTEMPT"]),
        gte(identityVaultAudit.createdAt, dayStart),
      ),
    );
  return rows.at(0)?.n ?? 0;
}

/**
 * Strict base64 decode with a decoded-size cap. The returned Buffer is the
 * ONLY copy of the image and must stay in memory until GC.
 */
function decodeBase64Image(
  encoded: string,
  maxBytes: number,
  label: string,
): Buffer {
  const compact = encoded
    .replace(/^data:[^;,]*(?:;base64)?,/, "")
    .replace(/\s+/g, "");
  if (compact.length === 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} is not valid base64-encoded image data`,
    });
  }
  const buffer = Buffer.from(compact, "base64");
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Decoded image must be larger than 0 bytes and at most ${Math.round(
        maxBytes / (1024 * 1024),
      )} MB`,
    });
  }
  return buffer;
}

export const kycRouter = createRouter({
  /**
   * Public-safe KYC status — vault existence, lifecycle state, and today's
   * verification-attempt usage. NEVER returns the payload or any PII.
   */
  status: authedQuery.query(async ({ ctx }) => {
    const walletRows = await getDb()
      .select({ customerRef: walletKeys.customerRef })
      .from(walletKeys)
      .where(eq(walletKeys.userId, ctx.user.id))
      .limit(1);
    const customerRef = walletRows.at(0)?.customerRef;
    if (!customerRef) {
      return {
        hasVaultRecord: false as const,
        vaultStatus: null,
        faceVerified: false,
        attemptsToday: 0,
        maxAttempts: MAX_ATTEMPTS_PER_DAY,
      };
    }
    const vaultRows = await getDb()
      .select({
        status: identityVault.status,
        faceVerifiedAt: identityVault.faceVerifiedAt,
      })
      .from(identityVault)
      .where(eq(identityVault.customerRef, customerRef))
      .limit(1);
    const attemptsToday = await verificationAttemptsToday(customerRef);
    const row = vaultRows.at(0);
    return {
      hasVaultRecord: row !== undefined,
      vaultStatus: row?.status ?? null,
      faceVerified: row?.faceVerifiedAt != null,
      attemptsToday,
      maxAttempts: MAX_ATTEMPTS_PER_DAY,
    };
  }),

  /**
   * Verify a photographed passport / national ID against the vault record.
   *
   * ZERO-RETENTION GUARANTEE: the decoded image Buffer exists only in local
   * variables inside this procedure (and inside the in-memory OCR worker).
   * It is never written to disk, never inserted into any table, never logged,
   * and becomes eligible for garbage collection when the procedure returns.
   * The same applies to the OCR text and parsed MRZ data — the only durable
   * record is the audit row carrying the bare verdict.
   */
  submitDoc: authedQuery
    .input(
      z.object({
        imageBase64: z.string().max(14_000_000),
        docType: z.enum(["passport", "national_id", "drivers_license"]),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<SubmitDocResult> => {
      const customerRef = await resolveCustomerRef(ctx.user.id);

      const vaultRows = await getDb()
        .select({
          payload: identityVault.payload,
          status: identityVault.status,
        })
        .from(identityVault)
        .where(eq(identityVault.customerRef, customerRef))
        .limit(1);
      const vaultRow = vaultRows.at(0);
      if (!vaultRow) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Complete your Identity Vault details first — we verify your document against them",
        });
      }
      const attemptsBefore = await verificationAttemptsToday(customerRef);

      if (vaultRow.status === "verified") {
        return {
          verdict: "ALREADY_VERIFIED",
          attemptsToday: attemptsBefore,
          maxAttempts: MAX_ATTEMPTS_PER_DAY,
        };
      }
      if (attemptsBefore >= MAX_ATTEMPTS_PER_DAY) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Daily document verification limit reached (${MAX_ATTEMPTS_PER_DAY} attempts) — try again tomorrow`,
        });
      }
      if (input.docType === "drivers_license") {
        // US driver's licenses have no ICAO 9303 MRZ — nothing to verify.
        return {
          verdict: "UNSUPPORTED",
          reason:
            "Driver's licenses aren't verifiable yet — please use a passport or national ID card.",
          attemptsToday: attemptsBefore,
          maxAttempts: MAX_ATTEMPTS_PER_DAY,
        };
      }

      // --- Decode (strict base64, size-capped). The resulting Buffer is the
      // ONLY copy of the image and stays in memory until GC. ---
      const imageBuffer = decodeBase64Image(
        input.imageBase64,
        MAX_DECODED_BYTES,
        "imageBase64",
      );

      // --- OCR + MRZ extraction (all in memory). OCR/vault-decryption
      // failures are infrastructure problems → one generic client message. ---
      let ocrText: string;
      try {
        ocrText = await ocrMrzRegion(imageBuffer);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Document verification is temporarily unavailable — try again later",
        });
      }

      const mrzLines = extractMrzLines(ocrText);
      const parsed = mrzLines.length > 0 ? parseMrz(mrzLines) : null;
      if (!parsed || !parsed.ok) {
        const verdict: KycVerdict = "UNREADABLE";
        await audit(customerRef, "DOC_ATTEMPT", ctx.user.id, { verdict });
        return {
          verdict,
          reason:
            parsed && !parsed.ok
              ? parsed.reason
              : "No machine-readable zone (MRZ) found — retake the photo with the MRZ lines flat and fully visible",
          attemptsToday: attemptsBefore + 1,
          maxAttempts: MAX_ATTEMPTS_PER_DAY,
        };
      }
      const mrz = parsed.fields;

      let vaultPayload;
      try {
        vaultPayload = decryptVaultPayload(vaultRow.payload);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Document verification is temporarily unavailable — try again later",
        });
      }

      // Failed MRZ check digits mean the read can't be trusted — report a
      // document-integrity mismatch rather than a verification or unreadable.
      if (!mrz.allChecksValid) {
        const verdict: KycVerdict = "MISMATCH";
        await audit(customerRef, "DOC_ATTEMPT", ctx.user.id, { verdict });
        return {
          verdict,
          mismatches: ["document integrity"],
          attemptsToday: attemptsBefore + 1,
          maxAttempts: MAX_ATTEMPTS_PER_DAY,
        };
      }

      const check = crossCheck(mrz, vaultPayload);
      if (check.verdict === "MISMATCH") {
        const verdict: KycVerdict = "MISMATCH";
        await audit(customerRef, "DOC_ATTEMPT", ctx.user.id, { verdict });
        return {
          verdict,
          mismatches: check.mismatches,
          attemptsToday: attemptsBefore + 1,
          maxAttempts: MAX_ATTEMPTS_PER_DAY,
        };
      }

      // VERIFIED — seal the payload with the verified document metadata and
      // flip the vault status. Only docType/docNumber are added (document
      // identifiers the member already claims); nothing else from the MRZ is
      // persisted.
      const sealed = encryptVaultPayload({
        ...vaultPayload,
        docType: input.docType,
        docNumber: mrz.docNumber,
      });
      await audit(customerRef, "DOC_ATTEMPT", ctx.user.id, {
        verdict: "VERIFIED",
      });
      await getDb()
        .update(identityVault)
        .set({ payload: sealed, status: "verified", updatedAt: new Date() })
        .where(eq(identityVault.customerRef, customerRef));
      await audit(customerRef, "STATUS_CHANGE", ctx.user.id, {
        to: "verified",
        via: "doc_mrz",
      });
      return {
        verdict: "VERIFIED",
        attemptsToday: attemptsBefore + 1,
        maxAttempts: MAX_ATTEMPTS_PER_DAY,
      };
    }),

  /**
   * KYC Phase 2b: match the document portrait against a live multi-frame
   * selfie (YuNet detection + SFace embeddings + movement liveness).
   *
   * ZERO-RETENTION GUARANTEE: the decoded image Buffers (document + selfie
   * frames) exist only in local variables inside this procedure (and inside
   * the in-memory ONNX sessions). They are never written to disk, never
   * inserted into any table, never logged, and become eligible for garbage
   * collection when the procedure returns. The same applies to the derived
   * face embeddings — the only durable records are the faceVerifiedAt
   * timestamp on success and audit rows carrying the bare verdict/band.
   */
  submitFace: authedQuery
    .input(
      z.object({
        docImageBase64: z.string().min(100).max(14_000_000),
        selfieFrames: z
          .array(z.string().min(100).max(7_000_000))
          .min(2)
          .max(4),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<SubmitFaceResult> => {
      const customerRef = await resolveCustomerRef(ctx.user.id);

      const vaultRows = await getDb()
        .select({
          status: identityVault.status,
          faceVerifiedAt: identityVault.faceVerifiedAt,
        })
        .from(identityVault)
        .where(eq(identityVault.customerRef, customerRef))
        .limit(1);
      const vaultRow = vaultRows.at(0);
      if (!vaultRow) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Complete your Identity Vault first",
        });
      }
      if (vaultRow.status !== "verified") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Verify your document first",
        });
      }
      const attemptsBefore = await verificationAttemptsToday(customerRef);

      // Already face-verified: idempotent success that does NOT consume an
      // attempt.
      if (vaultRow.faceVerifiedAt != null) {
        return {
          verdict: "ALREADY_VERIFIED",
          attemptsToday: attemptsBefore,
          maxAttempts: MAX_ATTEMPTS_PER_DAY,
        };
      }
      if (attemptsBefore >= MAX_ATTEMPTS_PER_DAY) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Daily verification limit reached (${MAX_ATTEMPTS_PER_DAY} attempts) — try again tomorrow`,
        });
      }

      // --- Decode (strict base64, size-capped). The resulting Buffers are
      // the ONLY copies of the images and stay in memory until GC. ---
      const docBuffer = decodeBase64Image(
        input.docImageBase64,
        MAX_DECODED_BYTES,
        "docImageBase64",
      );
      const frameBuffers = input.selfieFrames.map((frame, i) =>
        decodeBase64Image(frame, MAX_FRAME_DECODED_BYTES, `selfieFrames[${i}]`),
      );

      // --- Detection + embedding + verdict (all in memory). Model/decode
      // failures are infrastructure problems → one generic client message. ---
      let result;
      try {
        result = await verifyFace(docBuffer, frameBuffers);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Face verification is temporarily unavailable — try again later",
        });
      }

      if (result.verdict === "FACE_VERIFIED") {
        // Persist ONLY the timestamp — never images or embeddings.
        await getDb()
          .update(identityVault)
          .set({ faceVerifiedAt: new Date() })
          .where(eq(identityVault.customerRef, customerRef));
        await audit(customerRef, "STATUS_CHANGE", ctx.user.id, {
          flow: "face",
          scoreBand: result.scoreBand,
        });
        return {
          verdict: result.verdict,
          scoreBand: result.scoreBand ?? undefined,
          attemptsToday: attemptsBefore,
          maxAttempts: MAX_ATTEMPTS_PER_DAY,
        };
      }

      await audit(customerRef, "FACE_ATTEMPT", ctx.user.id, {
        verdict: result.verdict,
      });
      return {
        verdict: result.verdict,
        scoreBand: result.scoreBand ?? undefined,
        reason: result.reason,
        attemptsToday: attemptsBefore + 1,
        maxAttempts: MAX_ATTEMPTS_PER_DAY,
      };
    }),
});
