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
 * The `walletRouter` is built on a parallel backend branch against the exact
 * contract declared in `@/types/wallet-router`. On this branch `AppRouter`
 * has no `wallet` key yet, so we widen the shared `trpc` client once, here,
 * with minimal hook signatures matching @trpc/react-query v11 usage. When
 * the branches merge the real router types land on `trpc.wallet` and this
 * cast stays valid (it is a structural superset of the real hooks).
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

/** `trpc` + the wallet router (typed per contract; real types land at merge). */
export const walletTrpc = trpc as unknown as typeof trpc & { wallet: WalletApi };

/** Query utils with the wallet invalidators widened in (same story as above). */
export function useWalletUtils() {
  const utils = trpc.useUtils();
  return utils as unknown as typeof utils & {
    wallet: {
      state: { invalidate: () => Promise<unknown> };
      history: { invalidate: () => Promise<unknown> };
    };
  };
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
