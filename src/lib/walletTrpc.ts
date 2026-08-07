import { trpc } from '@/providers/trpc';
import type {
  BuyQuote,
  CreatePaymentInput,
  PaymentIntent,
  PaymentStatus,
  WalletHistoryPage,
  WalletState,
} from '@/types/wallet-router';

/**
 * Wallet tRPC facade.
 *
 * `AppRouter` includes the real `walletRouter`, so `trpc.wallet` is fully
 * typed against the server procedures. The `WalletApi` type below documents
 * the contract declared in `@/types/wallet-router` for reference; the facade
 * itself needs no casts.
 */

type QueryError = { message: string };

type QueryOpts<TOut = unknown> = {
  enabled?: boolean;
  refetchInterval?:
    | number
    | false
    | ((query: { state: { data?: TOut } }) => number | false | undefined);
  retry?: boolean | number;
  staleTime?: number;
};

type QueryResult<TOut> = {
  data: TOut | undefined;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: QueryError | null;
  refetch: () => Promise<unknown>;
};

type MutationOpts<TVars, TOut> = {
  onSuccess?: (data: TOut, vars: TVars) => void;
  onError?: (error: QueryError, vars: TVars) => void;
};

type MutationResult<TVars, TOut> = {
  mutate: TVars extends void ? (vars?: TVars) => void : (vars: TVars) => void;
  mutateAsync: TVars extends void ? (vars?: TVars) => Promise<TOut> : (vars: TVars) => Promise<TOut>;
  isPending: boolean;
};

export type WalletApi = {
  state: {
    useQuery: (input?: undefined, opts?: QueryOpts<WalletState>) => QueryResult<WalletState>;
  };
  history: {
    useQuery: (
      input: { cursor?: string },
      opts?: QueryOpts<WalletHistoryPage>,
    ) => QueryResult<WalletHistoryPage>;
  };
  buyQuote: {
    useQuery: (input: { usdMicro: number }, opts?: QueryOpts<BuyQuote>) => QueryResult<BuyQuote>;
  };
  paymentStatus: {
    useQuery: (
      input: { intentId: string },
      opts?: QueryOpts<PaymentStatus>,
    ) => QueryResult<PaymentStatus>;
  };
  grantAuthority: {
    useMutation: (opts?: MutationOpts<void, WalletState>) => MutationResult<void, WalletState>;
  };
  setSwitch: {
    useMutation: (
      opts?: MutationOpts<{ on: boolean }, WalletState>,
    ) => MutationResult<{ on: boolean }, WalletState>;
  };
  createPayment: {
    useMutation: (
      opts?: MutationOpts<CreatePaymentInput, PaymentIntent>,
    ) => MutationResult<CreatePaymentInput, PaymentIntent>;
  };
};

/**
 * `trpc` already carries the real `wallet` router types on `AppRouter` (the
 * branches merged), so no widening cast is needed — the hooks typecheck
 * directly against the server procedures.
 */
export const walletTrpc = trpc;

/** Query utils — `wallet` invalidators are part of the real AppRouter types. */
export function useWalletUtils() {
  return trpc.useUtils();
}

/** Format a coin amount (number or numeric string) with grouping. */
export function formatCoins(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === '') return '0';
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n)) return n.toLocaleString('en-US');
  return String(value);
}

/** micro-USD → "$25.00" */
export function formatUsdMicro(micro: number | undefined | null): string {
  if (micro === undefined || micro === null || !Number.isFinite(micro)) return '$0.00';
  return `$${(micro / 1_000_000).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** micro-USD per-coin price → "$0.105" (3 decimals — the +0.005 ratchet must be visible) */
export function formatPriceMicro(micro: number | undefined | null): string {
  if (micro === undefined || micro === null || !Number.isFinite(micro)) return '$0.100';
  return `$${(micro / 1_000_000).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })}`;
}
