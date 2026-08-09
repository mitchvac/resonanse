/**
 * Date-Coin / Smart Custody constants.
 *
 * Faithful port of the locked reference spec
 * (smart-custody-wallet/src/core/constants.ts) to DB-backed integer
 * micro-USD units. Price/coin math is ALWAYS integer micro-units; decimals
 * are only ever produced at the API / chain boundary as strings.
 */

/** First 100,000 wallets receive the free airdrop. */
export const ORIGINAL_HUNDRED_K_LIMIT = 100_000;

/** Free airdrop amount (whole coins). */
export const AIRDROP_AMOUNT = 10_000;

/**
 * New paid subscribers (post-airdrop users) receive this many Date-Coin via
 * a PLATFORM sale (V69 closed loop: platform is the sole seller).
 */
export const SUBSCRIBER_ALLOCATION = 10_000;

/** Up-only price increment per sale, in micro-USD (0.005 USD). */
export const PRICE_INCREMENT_MICRO = 5_000;

/** Starting system price, in micro-USD (0.10 USD). */
export const INITIAL_PRICE_MICRO = 100_000;

/** Payment intents expire after this long. */
export const INTENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * USD prices (micro-USD) for each payment purpose. TOP_UP has no client
 * amount in the contract, so it is a fixed denomination pack.
 */
export const PURPOSE_USD_MICRO = {
  SUBSCRIPTION_PLUS: 9_990_000, // $9.99
  SUBSCRIPTION_X: 19_990_000, // $19.99
  TOP_UP: 10_000_000, // $10.00 top-up pack
} as const;

/**
 * Static watch-only asset reference rates (micro-USD per whole unit) used to
 * quote the expected on-chain amount. RLUSD is a USD stablecoin (~$1).
 * These are quoting references only — settlement is verified on-chain.
 */
export const ASSET_USD_MICRO = {
  XRP: 500_000, // $0.50 / XRP
  RLUSD: 1_000_000, // $1.00 / RLUSD
  XLM: 100_000, // $0.10 / XLM (quoting reference only — settlement is on-chain)
} as const;

/** The platform's own sale identity in dc_sales.sellerWalletId. */
export const PLATFORM_SELLER = "PLATFORM";
