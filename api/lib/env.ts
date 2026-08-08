import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  kimiAuthUrl: required("KIMI_AUTH_URL"),
  kimiOpenUrl: required("KIMI_OPEN_URL"),
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
  // Smart Custody Wallet — merchant deposit address (watch-only; we hold no keys).
  merchantXrpAddress: process.env.MERCHANT_XRP_ADDRESS ?? "",
  // Owner gate for the treasury admin view.
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  // Public base URL of the app (e.g. https://resonance.example.com). Used to
  // build absolute links in emails and OAuth redirect URIs. Falls back to the
  // request origin when unset.
  appUrl: process.env.APP_URL ?? "",
  // Transactional email (Resend). Empty = email service not configured.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  // Google social login. Empty = provider not configured.
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  // Self-hosted translation sidecars (see translate/docker-compose.yml).
  // Empty = service not configured; features degrade gracefully.
  libreTranslateUrl: process.env.LIBRETRANSLATE_URL ?? "",
  whisperUrl: process.env.WHISPER_URL ?? "",
  piperUrl: process.env.PIPER_URL ?? "",
};
