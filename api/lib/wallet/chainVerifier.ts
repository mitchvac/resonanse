/**
 * Watch-only on-chain payment verification.
 *
 * The platform NEVER custodies real crypto and holds no keys — it only reads
 * public ledgers to confirm an inbound payment to a merchant address. The
 * server NEVER trusts the client; `paymentStatus` always verifies here.
 *
 * The verifier sits behind the `ChainVerifier` interface so tests can inject
 * a fake (no network). Default is the live implementation.
 */
import { decimalStringToSubUnits } from "./util";

export type VerifyOutcome = {
  status: "confirmed" | "underpaid" | "pending";
  txHash?: string | null;
};

export type PaymentIntentLike = {
  asset: "XRP" | "RLUSD" | "BTC";
  address: string;
  memoOrTag: string | null;
  expectedAmountText: string;
};

export interface ChainVerifier {
  verify(intent: PaymentIntentLike): Promise<VerifyOutcome>;
}

const XRPL_RPC_URL = "https://s1.ripple.com:51234";
const BLOCKSTREAM_BASE = "https://blockstream.info/api";
const FETCH_TIMEOUT_MS = 12_000;

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Decode a 40-char XRPL hex currency code to ASCII (e.g. RLUSD). */
function decodeXrplCurrency(code: string): string {
  if (/^[A-Za-z0-9]{3}$/.test(code)) return code;
  if (/^[0-9A-Fa-f]{40}$/.test(code)) {
    return Buffer.from(code, "hex").toString("ascii").replace(/\0/g, "");
  }
  return code;
}

type XrplTxEntry = {
  validated?: boolean;
  hash?: string;
  tx?: Record<string, unknown>;
  tx_json?: Record<string, unknown>;
  meta?: { delivered_amount?: unknown } | string;
};

async function verifyXrpl(
  intent: PaymentIntentLike,
  isRlusd: boolean,
): Promise<VerifyOutcome> {
  const body = {
    method: "account_tx",
    params: [
      {
        account: intent.address,
        ledger_index_min: -1,
        ledger_index_max: -1,
        binary: false,
        forward: false,
        limit: 50,
      },
    ],
  };
  const json = (await fetchJson(XRPL_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })) as { result?: { transactions?: XrplTxEntry[] } };

  const txs = json.result?.transactions ?? [];
  const wantedTag = intent.memoOrTag ? Number(intent.memoOrTag) : null;
  const expectedDrops = decimalStringToSubUnits(intent.expectedAmountText, 6);

  let sawUnderpaid = false;
  for (const entry of txs) {
    if (entry.validated !== true) continue;
    const tx = (entry.tx_json ?? entry.tx ?? {}) as Record<string, unknown>;
    if (tx.TransactionType !== "Payment") continue;
    if (tx.Destination !== intent.address) continue;
    if (wantedTag !== null && Number(tx.DestinationTag) !== wantedTag) continue;

    const meta = typeof entry.meta === "object" ? entry.meta : undefined;
    const delivered = meta?.delivered_amount ?? tx.Amount;
    const hash = (tx.hash as string) ?? entry.hash ?? null;

    if (isRlusd) {
      if (typeof delivered === "object" && delivered !== null) {
        const d = delivered as { currency?: string; value?: string };
        if (decodeXrplCurrency(d.currency ?? "") !== "RLUSD") continue;
        const value = Number(d.value ?? "0");
        if (value >= Number(intent.expectedAmountText)) {
          return { status: "confirmed", txHash: hash };
        }
        sawUnderpaid = true;
      }
      continue;
    }

    // Native XRP: delivered is a drops integer string.
    if (typeof delivered === "string") {
      const drops = Number(delivered);
      if (drops >= expectedDrops) {
        return { status: "confirmed", txHash: hash };
      }
      sawUnderpaid = true;
    }
  }
  return { status: sawUnderpaid ? "underpaid" : "pending" };
}

type BlockstreamTx = {
  txid: string;
  vout?: Array<{ scriptpubkey_address?: string; value?: number }>;
  status?: { confirmed?: boolean };
};

async function verifyBtc(intent: PaymentIntentLike): Promise<VerifyOutcome> {
  const expectedSats = decimalStringToSubUnits(intent.expectedAmountText, 8);
  const txs = (await fetchJson(
    `${BLOCKSTREAM_BASE}/address/${intent.address}/txs`,
  )) as BlockstreamTx[];

  let sawUnderpaid = false;
  for (const tx of txs ?? []) {
    const received = (tx.vout ?? [])
      .filter((o) => o.scriptpubkey_address === intent.address)
      .reduce((sum, o) => sum + (o.value ?? 0), 0);
    if (received === 0) continue;
    if (received === expectedSats) {
      // Require at least one confirmation.
      if (tx.status?.confirmed) {
        return { status: "confirmed", txHash: tx.txid };
      }
      return { status: "pending" };
    }
    if (received < expectedSats) sawUnderpaid = true;
  }
  return { status: sawUnderpaid ? "underpaid" : "pending" };
}

export class LiveChainVerifier implements ChainVerifier {
  async verify(intent: PaymentIntentLike): Promise<VerifyOutcome> {
    try {
      if (intent.asset === "BTC") return await verifyBtc(intent);
      return await verifyXrpl(intent, intent.asset === "RLUSD");
    } catch {
      // Network / parse failures fail closed toward "not yet confirmed".
      return { status: "pending" };
    }
  }
}

/** Test double — returns scripted outcomes without touching the network. */
export class FakeChainVerifier implements ChainVerifier {
  private handler: (intent: PaymentIntentLike) => VerifyOutcome;

  constructor(handler: (intent: PaymentIntentLike) => VerifyOutcome) {
    this.handler = handler;
  }

  async verify(intent: PaymentIntentLike): Promise<VerifyOutcome> {
    return this.handler(intent);
  }
}

let current: ChainVerifier = new LiveChainVerifier();

export function getChainVerifier(): ChainVerifier {
  return current;
}

/** Swap the verifier (used by tests). Returns the previous instance. */
export function setChainVerifier(v: ChainVerifier): ChainVerifier {
  const prev = current;
  current = v;
  return prev;
}
