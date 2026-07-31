import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import * as cookie from "cookie";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as schema from "@db/schema";
import { Session } from "@contracts/constants";
import { createRouter, publicQuery } from "./middleware";
import type { TrpcContext } from "./context";
import { getSessionCookieOptions } from "./lib/cookies";
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

export const passwordAuthRouter = createRouter({
  register: publicQuery
    .input(
      z.object({
        email: emailSchema,
        password: z.string().min(8).max(128),
        name: z.string().min(1).max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
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
});
