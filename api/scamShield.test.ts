/**
 * Scam Shield detector tests (V93-P1, SPEC §5).
 *
 * The core product rule (standards doc §4.1): talking about crypto is ALWAYS
 * score 0 — only extraction-ask combinations score. The five §4.2 allowed
 * examples are copied VERBATIM and must all score 0; the five §4.3 flagged
 * examples (verbatim) must score >= 40 with their annotated patterns (the
 * P5 example is exercised via ScanContext, not text alone).
 */
import { describe, expect, it } from "vitest";
import { scanMessage, type ScanContext } from "./lib/scamShield/detector";

const ctx = (over: Partial<ScanContext> = {}): ScanContext => ({
  priorPatterns: [],
  messageCountInConversation: 1,
  offPlatformSuggestedEarlier: false,
  isDomainBlocked: () => false,
  ...over,
});

// ── §4.2 ALLOWED — verbatim from resonance-community-standards-v1.md ────────
const ALLOWED: string[] = [
  "I work in fintech, so fair warning: I will talk your ear off about Bitcoin if you let me 😄 Happy to explain how self-custody works sometime — it's simpler than people think.",
  "You asked what I do on weekends — honestly, lately it's been a deep dive on how Ethereum staking works. Fascinating stuff. Want the 2-minute version over coffee?",
  "If you're curious about crypto, start with the basics: never share your recovery phrase, and learn what a hardware wallet is before you buy anything. There's a great free explainer on the Bitcoin wiki.",
  "Ha, no, I don't do trading tips — I just hold a little BTC and XRP and bore my friends about decentralization. What got you curious?",
  "Fun fact about me: this app actually has its own wallet called Date-Coin. I earned some watching the little demo. Crypto's going to be everywhere in a few years, might as well learn it somewhere safe.",
];

// ── §4.3 FLAGGED — verbatim ──────────────────────────────────────────────────
const FLAGGED_P1 =
  "I trade on a private platform, the returns are insane. Register here: `bitluxe-pro-trading.com/signup` and deposit just $250 to activate your account.";
const FLAGGED_P2_P3 =
  "If you want in, send whatever you're comfortable with to my wallet bc1q…f3t4 and I'll double it within a week, I promise.";
const FLAGGED_P3_P4 =
  "Our fund guarantees 15% weekly, zero risk. But this window closes Friday — after that the pool is full. Don't miss this, I want it for you.";
const FLAGGED_P2_P4 =
  "Scan this QR with your crypto app, it's how we split the profits — send 0.05 BTC to lock your spot.";
// §4.3 example 4 — the P5 sequence, day by day (verbatim).
const SEQ_DAY_1 = "I've never felt such a connection this fast.";
const SEQ_DAY_2 = "I hate it here, let's move to WhatsApp, it's easier.";
const SEQ_DAY_3 =
  "Since we're going to be together, let me show you how I make my money…";

describe("crypto education is always score 0 (§4.2, verbatim)", () => {
  it.each(ALLOWED.map((text, i) => [i + 1, text] as const))(
    "allowed example %i scores 0 with no patterns",
    (_n, text) => {
      const result = scanMessage(text, ctx());
      expect(result.score).toBe(0);
      expect(result.patterns).toEqual([]);
    },
  );
});

describe("extraction combinations score >= 40 (§4.3, verbatim)", () => {
  it("example 1: unknown exchange URL + deposit instruction → P1", () => {
    const result = scanMessage(FLAGGED_P1, ctx());
    expect(result.patterns).toContain("P1");
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it("example 2: wallet + ask + promised doubling → P2 and P3", () => {
    const result = scanMessage(FLAGGED_P2_P3, ctx());
    expect(result.patterns).toContain("P2");
    expect(result.patterns).toContain("P3");
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it("example 3: guaranteed % returns + urgency + money → P3 and P4", () => {
    const result = scanMessage(FLAGGED_P3_P4, ctx());
    expect(result.patterns).toContain("P3");
    expect(result.patterns).toContain("P4");
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it("example 4: the sequence — each single message is innocent", () => {
    // Day 1 and Day 2 alone score 0: no single step flags, the sequence does.
    expect(scanMessage(SEQ_DAY_1, ctx()).score).toBe(0);
    expect(scanMessage(SEQ_DAY_2, ctx()).score).toBe(0);
    // Day 3 via ScanContext: off-platform suggested earlier (Day 2) and two
    // distinct prior signal classes → P5 fires. SPEC §4 scores P5 at +30, so
    // on its own it sits below the warning threshold by design; in a live
    // thread P5 lands on top of the current pitch (see next test).
    const result = scanMessage(
      SEQ_DAY_3,
      ctx({
        offPlatformSuggestedEarlier: true,
        priorPatterns: ["P2", "P3"],
        messageCountInConversation: 3,
      }),
    );
    expect(result.patterns).toContain("P5");
    expect(result.score).toBeGreaterThanOrEqual(30);
  });

  it("example 4 (in combination): off-platform earlier + pitch now crosses 70", () => {
    const result = scanMessage(
      FLAGGED_P2_P3,
      ctx({ offPlatformSuggestedEarlier: true }),
    );
    expect(result.patterns).toContain("P5");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("example 5: QR handoff + crypto ask + urgency → P2 and P4", () => {
    const result = scanMessage(FLAGGED_P2_P4, ctx());
    expect(result.patterns).toContain("P2");
    expect(result.patterns).toContain("P4");
    expect(result.score).toBeGreaterThanOrEqual(40);
  });
});

describe("edge cases", () => {
  it("bare BTC address with no ask scores below the warning threshold", () => {
    const result = scanMessage(
      "Random fact: the very first Bitcoin address ever was 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa — history nerd stuff, I know.",
      ctx(),
    );
    expect(result.score).toBeLessThan(40);
    expect(result.patterns).toEqual([]);
  });

  it("EVM address + send verb → P2", () => {
    const result = scanMessage(
      "if you're up for it, send it to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e whenever",
      ctx(),
    );
    expect(result.patterns).toContain("P2");
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it("bare EVM address with no ask stays under the threshold", () => {
    const result = scanMessage(
      "my address is 0x742d35Cc6634C0532925a3b844Bc454e4438f44e, fun right?",
      ctx(),
    );
    expect(result.score).toBeLessThan(40);
  });

  it("https://coinbase.com (known-good exchange) scores 0", () => {
    const result = scanMessage(
      "I usually just buy a little on https://coinbase.com — boring but it works for me.",
      ctx(),
    );
    expect(result.score).toBe(0);
    expect(result.patterns).toEqual([]);
  });

  it("URLhaus-listed domain (blocked) → P1", () => {
    const result = scanMessage(
      "sign up at shady-exchange.io and deposit to activate your account",
      ctx({ isDomainBlocked: () => true }),
    );
    expect(result.patterns).toContain("P1");
    expect(result.score).toBeGreaterThanOrEqual(40);
  });
});

describe("determinism and perf", () => {
  const bigInput = `${FLAGGED_P2_P3} ${"just benign date chatter about coffee and dogs. ".repeat(80)}`.slice(
    0,
    4000,
  );

  it("same input + ctx → identical result", () => {
    const a = scanMessage(bigInput, ctx());
    const b = scanMessage(bigInput, ctx());
    expect(a).toEqual(b);
  });

  it("scans a 4000-char message in under 5ms", () => {
    const c = ctx();
    for (let i = 0; i < 5; i++) scanMessage(bigInput, c); // warm-up (JIT)
    let worst = 0;
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      scanMessage(bigInput, c);
      worst = Math.max(worst, performance.now() - t0);
    }
    expect(worst).toBeLessThan(5);
  });
});
