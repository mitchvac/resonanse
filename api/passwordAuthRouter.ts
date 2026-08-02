import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import * as cookie from "cookie";
import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as schema from "@db/schema";
import { Session } from "@contracts/constants";
import { createRouter, publicQuery } from "./middleware";
import type { TrpcContext } from "./context";
import { getSessionCookieOptions } from "./lib/cookies";
import { EmailNotConfiguredError, sendPasswordResetEmail } from "./lib/email";
import { env } from "./lib/env";
import { signSessionToken } from "./kimi/session";
import { findUserByUnionId, upsertUser } from "./queries/users";
import { getDb } from "./queries/connection";

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, params, (err, derivedKey) =>
      err ? reject(err) : resolve(derivedKey),
    );
  });
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH, {
    ...SCRYPT_PARAMS,
  });
  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join(":");
}

async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (!N || !r || !p || salt.length === 0 || expected.length === 0) {
    return false;
  }
  const actual = await scrypt(password, salt, expected.length, {
    N,
    r,
    p,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Mint the exact same session cookie the Kimi OAuth callback issues.
async function mintSessionCookie(
  ctx: Pick<TrpcContext, "req" | "resHeaders">,
  unionId: string,
): Promise<void> {
  const token = await signSessionToken({ unionId, clientId: env.appId });
  const opts = getSessionCookieOptions(ctx.req.headers);
  ctx.resHeaders.append(
    "set-cookie",
    cookie.serialize(Session.cookieName, token, {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      maxAge: Session.maxAgeMs / 1000,
    }),
  );
}

const emailSchema = z.string().email().max(320);
// Single source of truth for the password policy — register and reset must match.
const passwordSchema = z.string().min(8).max(128);

// ── In-memory rate limiting (fixed window) ────────────────────────────
// Best-effort per-process throttle; move to a shared store if the server
// ever runs more than one replica.
const RATE_WINDOW_MS = 15 * 60 * 1000;
const rateBuckets = new Map<string, number[]>();

function rateLimitAllow(key: string, max: number): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= max) {
    rateBuckets.set(key, hits);
    return false;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (rateBuckets.size > 10_000) {
    for (const [k, v] of rateBuckets) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) rateBuckets.delete(k);
    }
  }
  return true;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}

function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

function appBaseUrl(req: Request): string {
  return (env.appUrl || requestOrigin(req)).replace(/\/$/, "");
}

const GENERIC_RESET_MESSAGE =
  "If an account exists for that email, a reset link is on its way.";
const INVALID_TOKEN_MESSAGE = "This reset link is invalid or has expired.";
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const passwordAuthRouter = createRouter({
  register: publicQuery
    .input(
      z.object({
        email: emailSchema,
        password: passwordSchema,
        name: z.string().min(1).max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
      const ip = clientIp(ctx.req);
      if (
        !rateLimitAllow(`register:email:${email}`, 10) ||
        !rateLimitAllow(`register:ip:${ip}`, 30)
      ) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many attempts — try again in a few minutes",
        });
      }
      const existing = await getDb()
        .select({ id: schema.passwordCredentials.id })
        .from(schema.passwordCredentials)
        .where(eq(schema.passwordCredentials.email, email))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Account exists — sign in instead",
        });
      }

      const unionId = `pwd:${email}`;
      const passwordHash = await hashPassword(input.password);

      await upsertUser({
        unionId,
        name: input.name,
        email,
        lastSignInAt: new Date(),
      });
      const user = await findUserByUnionId(unionId);
      if (!user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create account",
        });
      }

      try {
        await getDb().insert(schema.passwordCredentials).values({
          userId: user.id,
          email,
          passwordHash,
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          (error as { code?: string }).code === "ER_DUP_ENTRY"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Account exists — sign in instead",
          });
        }
        throw error;
      }

      await mintSessionCookie(ctx, unionId);
      return { user };
    }),

  login: publicQuery
    .input(
      z.object({
        email: emailSchema,
        password: z.string().min(1).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
      const ip = clientIp(ctx.req);
      if (
        !rateLimitAllow(`login:email:${email}`, 10) ||
        !rateLimitAllow(`login:ip:${ip}`, 30)
      ) {
        // Burn scrypt time so throttled logins are timing-indistinguishable.
        await hashPassword(input.password);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many attempts — try again in a few minutes",
        });
      }
      const rows = await getDb()
        .select({
          credential: schema.passwordCredentials,
          user: schema.users,
        })
        .from(schema.passwordCredentials)
        .innerJoin(
          schema.users,
          eq(schema.users.id, schema.passwordCredentials.userId),
        )
        .where(eq(schema.passwordCredentials.email, email))
        .limit(1);
      const row = rows.at(0);

      if (!row) {
        // Burn equivalent scrypt time so unknown emails are indistinguishable.
        await hashPassword(input.password);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Wrong email or password",
        });
      }

      const valid = await verifyPassword(
        input.password,
        row.credential.passwordHash,
      );
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Wrong email or password",
        });
      }

      const lastSignInAt = new Date();
      await getDb()
        .update(schema.users)
        .set({ lastSignInAt })
        .where(eq(schema.users.id, row.user.id));

      await mintSessionCookie(ctx, row.user.unionId);
      return { user: { ...row.user, lastSignInAt } };
    }),

  requestPasswordReset: publicQuery
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
      const ip = clientIp(ctx.req);
      // Rate limits are enforced identically whether or not the account
      // exists, and the response never reveals which case we hit.
      if (
        !rateLimitAllow(`reset:email:${email}`, 3) ||
        !rateLimitAllow(`reset:ip:${ip}`, 10)
      ) {
        return { ok: true as const, message: GENERIC_RESET_MESSAGE };
      }

      const rows = await getDb()
        .select({
          credentialId: schema.passwordCredentials.id,
          userId: schema.passwordCredentials.userId,
        })
        .from(schema.passwordCredentials)
        .where(eq(schema.passwordCredentials.email, email))
        .limit(1);
      const row = rows.at(0);
      if (!row) {
        return { ok: true as const, message: GENERIC_RESET_MESSAGE };
      }

      const token = randomBytes(32).toString("base64url");
      await getDb()
        .insert(schema.passwordResetTokens)
        .values({
          userId: row.userId,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        });

      const resetUrl = `${appBaseUrl(ctx.req)}/reset-password?token=${token}`;
      try {
        await sendPasswordResetEmail(email, resetUrl);
      } catch (error) {
        if (!(error instanceof EmailNotConfiguredError)) {
          console.error("[password-reset] email send failed", error);
        } else {
          console.warn("[password-reset] email service not configured");
        }
        // Never leak config/delivery state to the client.
      }
      return { ok: true as const, message: GENERIC_RESET_MESSAGE };
    }),

  resetPassword: publicQuery
    .input(
      z.object({
        token: z.string().min(1).max(512),
        newPassword: passwordSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const tokenHash = sha256(input.token);
      const invalid = () =>
        new TRPCError({ code: "BAD_REQUEST", message: INVALID_TOKEN_MESSAGE });

      const rows = await getDb()
        .select()
        .from(schema.passwordResetTokens)
        .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
        .limit(1);
      const row = rows.at(0);
      if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
        throw invalid();
      }

      const passwordHash = await hashPassword(input.newPassword);
      const now = new Date();

      // Update the credential for this user (same scrypt format as register).
      const updated = await getDb()
        .update(schema.passwordCredentials)
        .set({ passwordHash })
        .where(eq(schema.passwordCredentials.userId, row.userId));
      if ((updated[0] as { affectedRows?: number }).affectedRows === 0) {
        throw invalid();
      }

      // Mark this token used and invalidate every other outstanding token
      // for the user.
      await getDb()
        .update(schema.passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(schema.passwordResetTokens.userId, row.userId),
            isNull(schema.passwordResetTokens.usedAt),
          ),
        );

      return { ok: true as const };
    }),
});
