import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { env } from "../lib/env";
import { getSessionCookieOptions } from "../lib/cookies";
import {
  buildAuthUrl,
  exchangeCode,
  fetchProfile,
  type OAuthProviderConfig,
} from "../lib/oauth";
import { Session } from "@contracts/constants";
import { signSessionToken } from "../kimi/session";
import { upsertUser } from "../queries/users";

const STATE_COOKIE = "google_oauth_state";
const STATE_MAX_AGE_S = 10 * 60; // 10 minutes

function googleConfigured(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret);
}

function requestOrigin(c: Context): string {
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? url.host;
  return `${proto}://${host}`;
}

function baseUrl(c: Context): string {
  return (env.appUrl || requestOrigin(c)).replace(/\/$/, "");
}

function googleProvider(c: Context): OAuthProviderConfig {
  return {
    clientId: env.googleClientId,
    clientSecret: env.googleClientSecret,
    redirectUri:
      env.googleRedirectUri || `${baseUrl(c)}/api/auth/google/callback`,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
  };
}

/** GET /api/auth/google — bounce the user to Google's consent screen. */
export function createGoogleAuthStartHandler() {
  return async (c: Context) => {
    if (!googleConfigured()) {
      return c.redirect("/signin?error=google-not-configured", 302);
    }
    const state = randomBytes(32).toString("base64url");
    const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
    setCookie(c, STATE_COOKIE, state, {
      ...cookieOpts,
      // Top-level navigation back from Google — Lax is sufficient and safer.
      sameSite: "Lax",
      maxAge: STATE_MAX_AGE_S,
    });
    return c.redirect(buildAuthUrl(googleProvider(c), state), 302);
  };
}

/** GET /api/auth/google/callback — validate state, find-or-create user, mint session. */
export function createGoogleAuthCallbackHandler() {
  return async (c: Context) => {
    if (!googleConfigured()) {
      return c.redirect("/signin?error=google-not-configured", 302);
    }
    const fail = (reason: string) => {
      console.warn(`[google-oauth] ${reason}`);
      return c.redirect("/signin?error=google-auth-failed", 302);
    };

    const error = c.req.query("error");
    if (error) {
      return fail(`provider returned error=${error}`);
    }
    const code = c.req.query("code");
    const state = c.req.query("state");
    const cookieState = getCookie(c, STATE_COOKIE);
    // One-shot state: clear regardless of outcome.
    setCookie(c, STATE_COOKIE, "", { path: "/", maxAge: 0 });
    if (!code || !state || !cookieState || state !== cookieState) {
      return fail("state mismatch or missing code");
    }

    try {
      const provider = googleProvider(c);
      const accessToken = await exchangeCode(provider, code);
      const profile = await fetchProfile(provider, accessToken);

      const unionId = `google:${profile.id}`;
      await upsertUser({
        unionId,
        name: profile.name ?? profile.email ?? "Google user",
        email: profile.email,
        avatar: profile.avatar,
        lastSignInAt: new Date(),
      });

      // Issue the exact same session cookie the Kimi callback issues.
      const token = await signSessionToken({ unionId, clientId: env.appId });
      const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
      setCookie(c, Session.cookieName, token, {
        ...cookieOpts,
        maxAge: Session.maxAgeMs / 1000,
      });

      // Same post-login destination logic as the rest of the app:
      // RequireProfile routes to /onboarding when the profile is incomplete,
      // otherwise the user lands in the app.
      return c.redirect("/discover", 302);
    } catch (err) {
      console.error("[google-oauth] Callback failed", err);
      return fail("callback exchange failed");
    }
  };
}
