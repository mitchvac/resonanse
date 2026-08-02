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
