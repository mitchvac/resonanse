import { env } from "./env";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("email service not configured");
    this.name = "EmailNotConfiguredError";
  }
}

type SendEmailOptions = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

async function sendEmail({ to, subject, text, html }: SendEmailOptions) {
  if (!env.resendApiKey || !env.emailFrom) {
    throw new EmailNotConfiguredError();
  }
  const resp = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.emailFrom, to: [to], subject, text, html }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Resend send failed (${resp.status}): ${body}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const safeUrl = escapeHtml(resetUrl);
  await sendEmail({
    to,
    subject: "Reset your Resonance password",
    text: [
      "We received a request to reset the password for your Resonance account.",
      "",
      `Reset your password: ${resetUrl}`,
      "",
      "This link expires in 30 minutes and can only be used once.",
      "If you didn't request this, you can ignore this email — your password won't change.",
    ].join("\n"),
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#2A2433">Reset your Resonance password</h2>
        <p>We received a request to reset the password for your Resonance account.</p>
        <p>
          <a href="${safeUrl}"
             style="display:inline-block;padding:12px 24px;border-radius:999px;background:#F59E0B;color:#2A2433;text-decoration:none;font-weight:600">
            Reset password
          </a>
        </p>
        <p style="color:#6b6475;font-size:14px">
          This link expires in 30 minutes and can only be used once.<br/>
          If you didn't request this, you can ignore this email — your password won't change.
        </p>
        <p style="color:#6b6475;font-size:12px;word-break:break-all">${safeUrl}</p>
      </div>`,
  });
}

/** Log + no-op when transactional email isn't configured (never blocks moderation). */
function emailUnavailable(kind: string): boolean {
  if (env.resendApiKey && env.emailFrom) return false;
  console.log(`[email] RESEND_API_KEY/EMAIL_FROM not configured — skipping ${kind}`);
  return true;
}

export type StrikeWarningEmailData = {
  /** 1 = educational (§8.2), 2 = final warning (§8.3), 3 = pending-review notice. */
  strikeNumber: number;
  /** The quoted rule text shown to the member. */
  ruleText: string;
  /** Plain-language description of what triggered the strike. */
  triggerDescription: string;
  /** One sentence on why the behavior worries people. */
  whyItWorries: string;
};

/**
 * Strike warning (community standards §8.2/§8.3 + the strike-3 pending-review
 * notice in the same voice). Warm, plain, on-your-side — teaches, never scolds.
 */
export async function sendStrikeWarningEmail(
  to: string,
  { strikeNumber, ruleText, triggerDescription, whyItWorries }: StrikeWarningEmailData,
): Promise<void> {
  if (emailUnavailable("strike warning email")) return;

  const rule = escapeHtml(ruleText);
  const trigger = escapeHtml(triggerDescription);
  const why = escapeHtml(whyItWorries);

  let subject: string;
  let heading: string;
  let bodyLines: string[];
  let bodyHtml: string;
  if (strikeNumber <= 1) {
    subject = "A quick heads-up from Resonance";
    heading = subject;
    bodyLines = [
      `Something in your recent activity matched this rule: "${ruleText}".`,
      "",
      `What we saw: ${triggerDescription}.`,
      "",
      `Why it worries people: ${whyItWorries}.`,
      "",
      "If this was innocent — it often is — no harm done. Just keep it in mind. This is strike 1 of 3; it expires in 90 days, and you can always see your standing in Settings. Questions or think we got it wrong? Reply to this message — a human reads every one.",
    ];
    bodyHtml = `
        <p>Something in your recent activity matched this rule: <em>"${rule}"</em>.</p>
        <p>What we saw: ${trigger}.</p>
        <p>Why it worries people: ${why}.</p>
        <p>If this was innocent — it often is — no harm done. Just keep it in mind. This is <strong>strike 1 of 3</strong>; it expires in 90 days, and you can always see your standing in Settings. Questions or think we got it wrong? Reply to this message — a human reads every one.</p>`;
  } else if (strikeNumber === 2) {
    subject = "Please read this one — it's important";
    heading = subject;
    bodyLines = [
      `This is your second strike for: "${ruleText}".`,
      "",
      `What happened: ${triggerDescription}.`,
      "",
      "We want to be completely straight with you: one more confirmed violation removes your account. A human reviews every removal, and there's always an appeal — but we'd much rather this be the last time we write to you.",
      "",
      "Both strikes expire in 90 days. Your full standing is in Settings, anytime.",
    ];
    bodyHtml = `
        <p>This is your second strike for: <em>"${rule}"</em>.</p>
        <p>What happened: ${trigger}.</p>
        <p>We want to be completely straight with you: <strong>one more confirmed violation removes your account.</strong> A human reviews every removal, and there's always an appeal — but we'd much rather this be the last time we write to you.</p>
        <p>Both strikes expire in 90 days. Your full standing is in Settings, anytime.</p>`;
  } else {
    subject = "Your Resonance account is under review";
    heading = subject;
    bodyLines = [
      `A third report matching this rule has come in: "${ruleText}".`,
      "",
      `What we saw: ${triggerDescription}.`,
      "",
      "Nothing has been decided yet. A member of our team — a human, not a bot — is reviewing everything before any action is taken, and you'll hear from us either way. If the review clears you, nothing changes. If it doesn't, we'll explain exactly why, and you'll be able to appeal.",
    ];
    bodyHtml = `
        <p>A third report matching this rule has come in: <em>"${rule}"</em>.</p>
        <p>What we saw: ${trigger}.</p>
        <p>Nothing has been decided yet. A member of our team — a human, not a bot — is reviewing everything before any action is taken, and you'll hear from us either way. If the review clears you, nothing changes. If it doesn't, we'll explain exactly why, and you'll be able to appeal.</p>`;
  }

  await sendEmail({
    to,
    subject,
    text: [heading, "", ...bodyLines].join("\n"),
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#2A2433">${heading}</h2>
        ${bodyHtml}
      </div>`,
  });
}

/** Strike-3 removal notice (community standards §8.4) — always offers the appeal path. */
export async function sendRemovalEmail(
  to: string,
  { ruleText }: { ruleText: string },
): Promise<void> {
  if (emailUnavailable("removal email")) return;

  const rule = escapeHtml(ruleText);
  const heading = "Your Resonance account has been removed";
  await sendEmail({
    to,
    subject: heading,
    text: [
      heading,
      "",
      `A member of our team — a human, not a bot — reviewed your account and confirmed a third violation of: "${ruleText}".`,
      "",
      'Your matches see only this: "This account is no longer on Resonance." Nothing more is said about you, to anyone.',
      "",
      "If you believe this is wrong, you can appeal from the app (Settings → Your standing). A different member of our team will review everything within 7 days (we reply within 72 hours). If your appeal succeeds, everything is restored — your profile, badges, and matches — exactly as it was.",
    ].join("\n"),
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#2A2433">${heading}</h2>
        <p>A member of our team — a human, not a bot — reviewed your account and confirmed a third violation of: <em>"${rule}"</em>.</p>
        <p>Your matches see only this: "This account is no longer on Resonance." Nothing more is said about you, to anyone.</p>
        <p><strong>If you believe this is wrong, you can appeal</strong> from the app (Settings &rarr; Your standing). A different member of our team will review everything within 7 days (we reply within 72 hours). If your appeal succeeds, everything is restored — your profile, badges, and matches — exactly as it was.</p>
      </div>`,
  });
}
