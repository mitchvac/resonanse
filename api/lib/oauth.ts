/**
 * Provider-generic OAuth 2.0 / OIDC helpers. Adding a provider (Apple,
 * Facebook, …) is a matter of supplying a new OAuthProviderConfig — the
 * authorize/exchange/profile flow is identical.
 */

export type OAuthProviderConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
};

export type OAuthProfile = {
  /** Stable provider-scoped user id (OIDC `sub`). */
  id: string;
  name?: string;
  email?: string;
  avatar?: string;
};

export function buildAuthUrl(
  provider: OAuthProviderConfig,
  state: string,
): string {
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("redirect_uri", provider.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scope);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(
  provider: OAuthProviderConfig,
  code: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    redirect_uri: provider.redirectUri,
  });
  const resp = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OAuth token exchange failed (${resp.status}): ${text}`);
  }
  const json = (await resp.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("OAuth token exchange returned no access_token");
  }
  return json.access_token;
}

export async function fetchProfile(
  provider: OAuthProviderConfig,
  accessToken: string,
): Promise<OAuthProfile> {
  const resp = await fetch(provider.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OAuth profile fetch failed (${resp.status}): ${text}`);
  }
  const json = (await resp.json()) as {
    sub?: string;
    name?: string;
    email?: string;
    picture?: string;
  };
  if (!json.sub) {
    throw new Error("OAuth profile missing subject (sub)");
  }
  return { id: json.sub, name: json.name, email: json.email, avatar: json.picture };
}
