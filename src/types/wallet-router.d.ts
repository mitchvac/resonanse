/**
 * Wallet router contract types — mirrors the tRPC `walletRouter` being built
 * by the backend graft against the locked contract:
 *
 *   state          → WalletState
 *   grantAuthority → WalletState
 *   setSwitch {on} → WalletState
 *   history {cursor?} → WalletHistoryPage
 *   buyQuote {usdMicro} → BuyQuote
 *   createPayment {purpose, asset} → PaymentIntent
 *   paymentStatus {intentId} → PaymentStatus
 *
 * The real router types land on AppRouter when the wallet branches merge;
 * until then `src/lib/walletTrpc.ts` casts the shared `trpc` client against
 * these declarations so the frontend compiles standalone.
 */

export type WalletAsset = 'XRP' | 'RLUSD' | 'BTC';

export type WalletPurpose = 'SUBSCRIPTION_PLUS' | 'SUBSCRIPTION_X' | 'TOP_UP';

export type WalletState = {
  hasWallet: boolean;
  walletId?: string;
  /** Date-Coin balance (whole coins) */
  balance?: number | string;
  /** Smart Custody switch */
  switchOn?: boolean;
  /** First 100k users — early member airdrop cohort */
  isOriginalHundredK?: boolean;
  /** Live system price per Date-Coin — only ever increases */
  price: number | string;
  totalSalesCount: number;
  /** Human-readable pending XRP rewards, e.g. "0.42 XRP pending" */
  rewardsPendingText: string;
};

export type WalletSale = {
  id: string;
  /** BOUGHT = this wallet bought coins; SUPPLIED = custody switch supplied new members */
  kind: 'BOUGHT' | 'SUPPLIED';
  coins: number | string;
  /** price per coin at the moment of sale */
  pricePerCoin?: number | string;
  totalUsdMicro?: number;
  asset?: WalletAsset | string;
  at: string | Date;
};

export type WalletHistoryPage = {
  items: WalletSale[];
  nextCursor?: string | null;
};

export type BuyQuote = {
  pricePerCoin: number | string;
  coins: number | string;
  totalUsdMicro: number;
};

export type CreatePaymentInput = {
  purpose: WalletPurpose;
  asset: WalletAsset;
  /** TOP_UP only: chosen USD amount in micro-USD (ignored by strict backends) */
  usdMicro?: number;
};

export type PaymentIntent = {
  intentId: string;
  address: string;
  /** destination tag (XRP/RLUSD) or memo; empty when not required */
  memoOrTag?: string;
  expectedAmountText: string;
  asset: WalletAsset;
  expiresAt: string | Date;
  pricePerCoin?: number | string;
  coins?: number | string;
};

export type PaymentStatusKind = 'pending' | 'confirmed' | 'underpaid' | 'expired';

export type PaymentStatus = {
  status: PaymentStatusKind;
  receivedAmountText?: string;
  expectedAmountText?: string;
  expiresAt?: string | Date;
} & Record<string, unknown>;
