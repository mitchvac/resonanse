/**
 * Scam Shield detector (V93-P1) — deterministic, synchronous, regex/heuristics
 * only. No I/O, no network, no imports from db. Runs inside `chat.send` in
 * under 5 ms.
 *
 * CORE PRODUCT RULE (resonance-community-standards-v1.md §4.1):
 *   "Talking about crypto is always fine. No flags, no nudges, no scores.
 *    Ever. Our detector assigns crypto discussion a score of 0."
 * Crypto/finance TOPIC words (bitcoin, btc, crypto, ethereum, wallet,
 * blockchain, staking, investment talk WITHOUT an ask) contribute exactly 0 —
 * they are deliberately NOT matched anywhere below. Only extraction-ask
 * COMBINATIONS (P1-P5) score: an innocent teacher never asks you to send
 * crypto to a wallet they control; the scammer always does.
 *
 * The output is pattern CLASSES + a score — never message content substrings.
 */

export type ScamPattern = "P1" | "P2" | "P3" | "P4" | "P5";

export interface ScanContext {
  /** Patterns already signalled in this conversation (for P5). */
  priorPatterns: ScamPattern[];
  messageCountInConversation: number;
  offPlatformSuggestedEarlier: boolean;
  /** Injected, backed by the blocked_domains in-memory cache. */
  isDomainBlocked: (domain: string) => boolean;
}

// ── P1 deposit link ─────────────────────────────────────────────────────────
// URL whose domain is blocked OR matches unknown-trading-platform heuristics
// (hyphenated trading/invest/profit words in the domain) + deposit/signup
// verbs nearby.
const URL_RE =
  /(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+)(?:\/[^\s'")\]>`]*)?/gi;
const SUSPECT_PLATFORM_WORD_RE =
  /(trad|invest|profit|fx|gain|earn|wealth|capital|exchange|market|fund|crypto|coin|asset)/i;
const SIGNUP_OR_DEPOSIT_RE =
  /\b(register|sign\s?up|sign\s?in to (claim|start)|deposit|activate|join|fund your|create (an|your) account|open (an|your) account|get started|top up)\b/i;

// ── P2 wallet + ask ─────────────────────────────────────────────────────────
// A wallet address (or QR handoff) COMBINED WITH an ask to move funds.
const EVM_ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/;
const BTC_BASE58_RE = /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/;
const BTC_BECH32_RE = /\bbc1[a-z0-9]{8,59}\b/i;
// Partially-quoted bech32 (e.g. "bc1q…f3t4") — scammers quote shorthand too.
const BTC_BECH32_MASKED_RE = /\bbc1[a-z0-9]{1,20}…[a-z0-9]{2,}\b/i;
const QR_HANDOFF_RE = /\b(qr(\s?code)?|scan this)\b/i;
const CRYPTO_CONTEXT_RE = /\b(crypto|bitcoin|btc|ethereum|eth|wallet|usdt|usdc|xrp|xlm)\b/i;
const ASK_VERB_RE = /\b(send|sending|receive|transfer|deposit|gift|pay|payment|donate)\b/i;
const AMOUNT_RE =
  /(\$\s?\d[\d,]*(\.\d+)?|\b\d+(\.\d+)?\s?(btc|eth|xrp|xlm|usdt|usdc|eur|usd|dollars?|euros?)\b)/i;

// ── P3 guaranteed returns + invitation CTA ──────────────────────────────────
const GUARANTEED_RETURNS_RE =
  /(\bguarantee[ds]?\b|\brisk[- ]?free\b|\bzero risk\b|\bno risk\b|\bdouble (your|it|the|my)\b|\btriple (your|it|the)\b|\bfixed returns?\b|\bsteady returns?\b|\b\d{1,3}\s?%\s?(daily|weekly|monthly|per (day|week|month)|a (day|week|month))\b)/i;
const INVITATION_CTA_RE =
  /\b(want in|get in on|join|sign\s?up|register|hop in|come aboard|invest with|count you in|don'?t miss|i want it for you|get started|interested\?|let me show you)\b/i;

// ── P4 urgency + money ──────────────────────────────────────────────────────
const URGENCY_RE =
  /(\bwindow closes?\b|\bcloses? (on )?(friday|monday|tuesday|wednesday|thursday|saturday|sunday|tonight|tomorrow|soon)\b|\bclosing soon\b|\bexpires?\b|\blimited spots?\b|\bspots? left\b|\blast chance\b|\btoday only\b|\bact now\b|\bdon'?t miss\b|\bpool is full\b|\bfills? up fast\b|\bbefore it'?s gone\b|\block your spot\b|\bonly \d+ (spots?|seats?|slots?)\b)/i;
const MONEY_RE =
  /(\b(money|cash|invest|investment|investing|deposit|fund|profit|profits|returns?|payment|stake|staking|pool|portfolio)\b|\$|\b\d+(\.\d+)?\s?(btc|eth|xrp|xlm|usdt|usdc|eur|usd)\b|\b(btc|bitcoin|eth|ethereum|crypto)\b)/i;

const P1_BONUS = 50;
const P2_BONUS = 45;
const P2_BARE_ADDRESS_MAX = 5;
const P3_BONUS = 35;
const P4_BONUS = 25;
const P4_COMBINED_BONUS = 40; // with P1/P3
const P5_BONUS = 30;

function extractDomains(text: string): string[] {
  const domains: string[] = [];
  for (const match of text.matchAll(URL_RE)) {
    const domain = match[1]?.toLowerCase();
    // Skip decimal fragments like "2.0" and TLD-less tokens.
    if (domain && /[a-z]/.test(domain) && domain.includes(".")) {
      domains.push(domain);
    }
  }
  return domains;
}

/**
 * Score a single message. Deterministic: same (text, ctx) → same result.
 * Returns the matched pattern classes (deduped, P1→P5 order) and the total
 * score. Disposition thresholds (>=70 queued_review, >=40 recipient_warning)
 * are applied by the caller (chat.send hook), not here.
 */
export function scanMessage(
  text: string,
  ctx: ScanContext,
): { score: number; patterns: ScamPattern[] } {
  const patterns = new Set<ScamPattern>();
  let score = 0;

  // ── P1 deposit_link ──
  const domains = extractDomains(text);
  if (domains.length > 0) {
    const hasSignupVerb = SIGNUP_OR_DEPOSIT_RE.test(text);
    for (const domain of domains) {
      if (ctx.isDomainBlocked(domain)) {
        // Blocklist hit: the domain itself is the extraction infrastructure.
        patterns.add("P1");
        break;
      }
      if (
        hasSignupVerb &&
        domain.includes("-") &&
        SUSPECT_PLATFORM_WORD_RE.test(domain)
      ) {
        patterns.add("P1");
        break;
      }
    }
    if (patterns.has("P1")) score += P1_BONUS;
  }

  // ── P2 wallet_ask ──
  const hasAddress =
    EVM_ADDRESS_RE.test(text) ||
    BTC_BASE58_RE.test(text) ||
    BTC_BECH32_RE.test(text) ||
    BTC_BECH32_MASKED_RE.test(text);
  const hasAsk = ASK_VERB_RE.test(text) || AMOUNT_RE.test(text);
  if (hasAddress && hasAsk) {
    patterns.add("P2");
    score += P2_BONUS;
  } else if (hasAddress) {
    // A bare address is never a violation on its own (two people on their
    // third date can legitimately share one) — tiny metadata signal only.
    score += P2_BARE_ADDRESS_MAX;
  } else if (QR_HANDOFF_RE.test(text) && CRYPTO_CONTEXT_RE.test(text) && hasAsk) {
    // QR handoff to a crypto app + a send/amount ask — the address is in the image.
    patterns.add("P2");
    score += P2_BONUS;
  }

  // ── P3 guaranteed_returns + CTA ──
  if (GUARANTEED_RETURNS_RE.test(text) && INVITATION_CTA_RE.test(text)) {
    patterns.add("P3");
    score += P3_BONUS;
  }

  // ── P4 urgency_money ──
  if (URGENCY_RE.test(text) && MONEY_RE.test(text)) {
    patterns.add("P4");
    score += patterns.has("P1") || patterns.has("P3") ? P4_COMBINED_BONUS : P4_BONUS;
  }

  // ── P5 sequence ──
  const priorDistinct = new Set(ctx.priorPatterns.filter((p) => p !== "P5"));
  const hasCurrentPitch =
    patterns.has("P1") || patterns.has("P2") || patterns.has("P3");
  if (
    (ctx.offPlatformSuggestedEarlier && hasCurrentPitch) ||
    priorDistinct.size >= 2
  ) {
    patterns.add("P5");
    score += P5_BONUS;
  }

  const ordered = (["P1", "P2", "P3", "P4", "P5"] as const).filter((p) =>
    patterns.has(p),
  );
  return { score, patterns: ordered };
}
