/**
 * Smart Custody Wallet smoke test — runs against the live dev DB.
 *
 * Exercises: grant+airdrop numbering, switch skip, 2,000 floor, fallback
 * across suppliers, exact +5000 micro ratchet, PLATFORM top-up no-double
 * -credit (regression), burn on spend, and idempotent paymentStatus via a
 * pre-seeded fake chain verifier (no network).
 *
 * Usage: npx tsx scripts/smoke-wallet.mts
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../api/queries/connection";
import {
  burnDateCoin,
  confirmPayment,
  createPaymentIntent,
  getBuyQuote,
  getWalletState,
  grantAuthority,
  setSwitch,
} from "../api/lib/wallet/service";
import { fulfillMarketplace, platformTopUp } from "../api/lib/wallet/engine";
import {
  FakeChainVerifier,
  setChainVerifier,
} from "../api/lib/wallet/chainVerifier";
import {
  AIRDROP_AMOUNT,
  INITIAL_PRICE_MICRO,
  MINIMUM_DATE_COIN_BALANCE,
  PRICE_INCREMENT_MICRO,
  SUBSCRIBER_ALLOCATION,
} from "../api/lib/wallet/constants";

const db = getDb();
const RUN = randomUUID().slice(0, 8);
let passed = 0;

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}
function ok(name: string): void {
  passed++;
  console.log(`  PASS ${name}`);
}

async function createUser(tag: string): Promise<number> {
  const unionId = `smoke:${RUN}:${tag}`;
  const res = await db.insert(schema.users).values({
    unionId,
    name: `Smoke ${tag}`,
    email: `${unionId}@example.com`,
  });
  const header = Array.isArray(res) ? res[0] : res;
  return Number((header as { insertId: number }).insertId);
}

async function balanceOf(walletId: string): Promise<number> {
  const rows = await db
    .select()
    .from(schema.dcLedger)
    .where(eq(schema.dcLedger.walletId, walletId))
    .limit(1);
  return rows.at(0)?.balance ?? 0;
}

async function priceState() {
  const rows = await db
    .select()
    .from(schema.dcPriceState)
    .where(eq(schema.dcPriceState.id, 1))
    .limit(1);
  return rows.at(0);
}

async function setBalance(walletId: string, balance: number): Promise<void> {
  await db
    .update(schema.dcLedger)
    .set({ balance })
    .where(eq(schema.dcLedger.walletId, walletId));
}

/** Isolate a scenario: turn every existing wallet's switch OFF. */
async function disableAllSuppliers(): Promise<void> {
  await db.update(schema.dcWallets).set({ switchOn: false });
}

async function entitlementTier(userId: number): Promise<string | null> {
  const rows = await db
    .select()
    .from(schema.entitlements)
    .where(eq(schema.entitlements.userId, userId))
    .limit(1);
  return rows.at(0)?.tier ?? null;
}

async function pendingRewardCount(): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)` })
    .from(schema.dcRewards)
    .where(eq(schema.dcRewards.status, "pending"));
  return Number(rows.at(0)?.value ?? 0);
}

async function main() {
  console.log(`Smoke run ${RUN}`);

  // ── 1. grant + airdrop numbering ──────────────────────────────────
  console.log("\n[1] grant + airdrop");
  const u1 = await createUser("u1");
  const g1 = await grantAuthority(u1);
  assert(g1.created === true, "first grant creates wallet");
  assert(g1.wallet.isOriginalHundredK === true, "early wallet is original 100k");
  assert(g1.wallet.switchOn === true, "switch ON by default");
  assert(
    (await balanceOf(g1.wallet.walletId)) === AIRDROP_AMOUNT,
    `airdrop balance == ${AIRDROP_AMOUNT}`,
  );
  const g1again = await grantAuthority(u1);
  assert(g1again.created === false, "grant is idempotent (not recreated)");
  assert(
    g1again.wallet.walletId === g1.wallet.walletId,
    "idempotent grant returns same walletId",
  );
  assert(
    (await balanceOf(g1.wallet.walletId)) === AIRDROP_AMOUNT,
    "no double airdrop on re-grant",
  );
  ok("grant + airdrop + idempotency");

  // ── 2/3/4. switch skip + 2,000 floor + fallback in ONE fulfillment ──
  console.log("\n[2-4] switch skip + floor + fallback");
  await disableAllSuppliers(); // isolate from any pre-existing wallets
  const uC = await createUser("rich-off"); // rich but switch OFF
  const uA = await createUser("poor-on"); // switch ON, balance 2400 (floor)
  const uB = await createUser("able-on"); // switch ON, balance 10000
  const wC = (await grantAuthority(uC)).wallet;
  const wA = (await grantAuthority(uA)).wallet;
  const wB = (await grantAuthority(uB)).wallet;
  const buyer1 = await createUser("buyer1");
  const wBuyer1 = (await grantAuthority(buyer1)).wallet;

  // New wallets default to switch ON; arrange the exact eligibility layout.
  await setSwitch(uC, false); // rich, but must be skipped (switch OFF)
  await setBalance(wC.walletId, 1_000_000);
  await setBalance(wA.walletId, MINIMUM_DATE_COIN_BALANCE + 400); // 2400 → can supply only 400
  await setBalance(wB.walletId, AIRDROP_AMOUNT); // 10000
  await setSwitch(buyer1, false); // the buyer is not a supplier

  const buyerBefore = await balanceOf(wBuyer1.walletId);
  const ps0 = await priceState();
  const price0 = ps0?.currentPriceMicro ?? INITIAL_PRICE_MICRO;
  const sales0 = ps0?.totalSalesCount ?? 0;

  const AMOUNT = 500; // C skipped (switch), A blocked (floor: 2400-500<2000), B supplies
  const sale = await fulfillMarketplace({
    buyerWalletId: wBuyer1.walletId,
    amount: AMOUNT,
    paidWith: "XRP",
    totalPaidText: "1.000000",
    actor: "smoke",
  });

  assert(sale.sellerWalletId === wB.walletId, "fallback picks able supplier B");
  assert(sale.sellerWalletId !== wC.walletId, "OFF wallet C skipped");
  assert(sale.sellerWalletId !== wA.walletId, "below-floor wallet A skipped");
  assert(
    (await balanceOf(wB.walletId)) === AIRDROP_AMOUNT - AMOUNT,
    "supplier B debited exactly AMOUNT",
  );
  assert(
    (await balanceOf(wBuyer1.walletId)) === buyerBefore + AMOUNT,
    "buyer credited AMOUNT",
  );
  assert(
    (await balanceOf(wA.walletId)) === MINIMUM_DATE_COIN_BALANCE + 400,
    "wallet A untouched (floor respected)",
  );
  ok("switch skip + 2,000 floor + fallback");

  // ── 5. ratchet exactly +5000 micro ────────────────────────────────
  console.log("\n[5] ratchet +5000 micro");
  const ps1 = await priceState();
  assert(
    ps1?.currentPriceMicro === price0 + PRICE_INCREMENT_MICRO,
    `price ratcheted exactly +${PRICE_INCREMENT_MICRO}`,
  );
  assert(ps1?.totalSalesCount === sales0 + 1, "sales count +1");
  assert(
    sale.pricePerCoinMicro === price0,
    "sale recorded at pre-ratchet price",
  );
  ok("ratchet exactly +5000 micro");

  // ── 6. PLATFORM top-up no-double-credit (regression) ─────────────
  console.log("\n[6] PLATFORM top-up no-double-credit");
  const u2 = await createUser("topup");
  const w2 = (await grantAuthority(u2)).wallet;
  const before2 = await balanceOf(w2.walletId);
  const TOP = 1000;
  const psBefore = (await priceState())!;
  const topSale = await platformTopUp({
    buyerWalletId: w2.walletId,
    amount: TOP,
    paidWith: "BTC",
    totalPaidText: "0.00010000",
    actor: "smoke",
  });
  const after2 = await balanceOf(w2.walletId);
  assert(
    after2 - before2 === TOP,
    `buyer credited exactly ${TOP} (no double-credit)`,
  );
  assert(topSale.sellerWalletId === "PLATFORM", "seller is PLATFORM");
  const psAfter = (await priceState())!;
  assert(
    psAfter.currentPriceMicro ===
      psBefore.currentPriceMicro + PRICE_INCREMENT_MICRO,
    "top-up ratchets price too",
  );
  ok("PLATFORM top-up single credit + ratchet");

  // ── 7. burn on spend ──────────────────────────────────────────────
  console.log("\n[7] burn on spend");
  const before7 = await balanceOf(w2.walletId);
  await burnDateCoin(u2, 300);
  assert(
    (await balanceOf(w2.walletId)) === before7 - 300,
    "burn debits exactly 300",
  );
  let threw = false;
  try {
    await burnDateCoin(u2, 10_000_000);
  } catch {
    threw = true;
  }
  assert(threw, "burning more than balance fails closed");
  ok("burn on spend + fail closed");

  // ── 8. idempotent paymentStatus via fake verifier ─────────────────
  console.log("\n[8] paymentStatus (fake verifier, no network)");
  setChainVerifier(new FakeChainVerifier(() => ({ status: "confirmed", txHash: "0xsmoke" })));

  // 8a. SUBSCRIPTION_PLUS → entitlement + marketplace allocation
  await disableAllSuppliers(); // isolate: only the whale can supply
  const whale = await createUser("whale");
  const wWhale = (await grantAuthority(whale)).wallet;
  await setBalance(wWhale.walletId, 20_000); // must be >= allocation + floor
  const sub = await createUser("sub");
  const subWallet = (await grantAuthority(sub)).wallet;
  await setSwitch(sub, false); // the subscriber is not a supplier
  const subBefore = await balanceOf(subWallet.walletId);
  const rewardsBefore = await pendingRewardCount();
  const psSub0 = (await priceState())!;

  const intent1 = await createPaymentIntent(sub, "SUBSCRIPTION_PLUS", "XRP");
  assert(intent1.memoOrTag !== null, "XRP intent has a destination tag");
  const c1 = await confirmPayment(sub, intent1.intentId);
  assert(c1.status === "confirmed", "subscription payment confirmed");
  assert(
    (await entitlementTier(sub)) === "plus",
    "SUBSCRIPTION_PLUS grants plus tier",
  );
  assert(
    (await balanceOf(subWallet.walletId)) ===
      subBefore + SUBSCRIBER_ALLOCATION,
    `subscriber allocated ${SUBSCRIBER_ALLOCATION} coins`,
  );
  assert(
    (await pendingRewardCount()) === rewardsBefore + 1,
    "exactly one pending supplier reward obligation",
  );
  const psSub1 = (await priceState())!;
  assert(
    psSub1.currentPriceMicro ===
      psSub0.currentPriceMicro + PRICE_INCREMENT_MICRO,
    "subscription fulfillment ratchets +5000",
  );

  // Idempotent re-confirm: nothing changes.
  const balBeforeReconfirm = await balanceOf(subWallet.walletId);
  const c1b = await confirmPayment(sub, intent1.intentId);
  assert(c1b.status === "confirmed", "re-confirm still confirmed");
  assert(
    (await balanceOf(subWallet.walletId)) === balBeforeReconfirm,
    "idempotent: no double-credit on re-confirm",
  );
  assert(
    (await pendingRewardCount()) === rewardsBefore + 1,
    "idempotent: no duplicate reward on re-confirm",
  );
  const psSub2 = (await priceState())!;
  assert(
    psSub2.currentPriceMicro === psSub1.currentPriceMicro,
    "idempotent: no second ratchet on re-confirm",
  );
  ok("subscription confirm + idempotency");

  // 8b. TOP_UP → PLATFORM sale at current price, no double credit
  const psTop0 = (await priceState())!;
  const intent2 = await createPaymentIntent(sub, "TOP_UP", "BTC");
  assert(intent2.memoOrTag === null, "BTC intent has no memo (exact amount)");
  assert(
    typeof intent2.coins === "number" && intent2.coins > 0,
    "TOP_UP intent returns coins quote",
  );
  const topBefore = await balanceOf(subWallet.walletId);
  const c2 = await confirmPayment(sub, intent2.intentId);
  assert(c2.status === "confirmed", "top-up payment confirmed");
  const quotedCoins = intent2.coins!;
  assert(
    (await balanceOf(subWallet.walletId)) === topBefore + quotedCoins,
    "top-up credits exactly the quoted coins once",
  );
  const psTop1 = (await priceState())!;
  assert(
    psTop1.currentPriceMicro ===
      psTop0.currentPriceMicro + PRICE_INCREMENT_MICRO,
    "top-up confirm ratchets once",
  );
  // Idempotent top-up re-confirm.
  const c2b = await confirmPayment(sub, intent2.intentId);
  assert(c2b.status === "confirmed", "top-up re-confirm confirmed");
  assert(
    (await balanceOf(subWallet.walletId)) === topBefore + quotedCoins,
    "top-up idempotent: no double-credit",
  );
  ok("top-up confirm + no-double-credit idempotency");

  // ── 9. buyQuote sanity ────────────────────────────────────────────
  console.log("\n[9] buyQuote");
  const q = await getBuyQuote(1_000_000); // $1
  const curPrice = (await priceState())!.currentPriceMicro;
  assert(q.pricePerCoin === curPrice, "quote uses current price");
  assert(q.coins === Math.floor(1_000_000 / curPrice), "quote coins correct");
  assert(
    q.totalUsdMicro === q.coins * curPrice,
    "quote totalUsdMicro consistent",
  );
  ok("buyQuote");

  // ── 10. state snapshot ────────────────────────────────────────────
  console.log("\n[10] state");
  const st = await getWalletState(sub);
  assert(st.hasWallet === true, "state hasWallet");
  assert(st.price === curPrice, "state price matches");
  assert(typeof st.rewardsPendingText === "string", "rewardsPendingText set");
  const stNone = await getWalletState(await createUser("nowallet"));
  assert(stNone.hasWallet === false, "no-wallet state");
  ok("state");

  console.log(`\nALL ${passed} smoke groups PASSED`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nSMOKE FAILED:", err);
    process.exit(1);
  });
