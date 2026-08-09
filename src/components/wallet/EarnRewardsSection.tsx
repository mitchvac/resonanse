import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarCheck, Check, Coins, Loader2, ShieldCheck } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';

/**
 * EarnRewardsSection — "EARN DATE-COIN" (V70)
 *
 * Members earn closed-loop Date-Coin for engagement (daily check-in, identity
 * verification). Earned DC is promotional issuance — never a sale, never
 * redeemable. The server is the source of truth: cooldowns are enforced
 * server-side (CONFLICT), the countdown below is display-only.
 *
 * Renders just the GlassCard (mirrors IdentityVerificationSection) — the
 * parent section owns the mt-4 px-5 spacing.
 */

/** Pull a human message out of a tRPC/network error without `any`. */
function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return fallback;
}

/** "7h 23m" / "42m" — display-only countdown (server adjudicates claims). */
function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function EarnRewardsSection({
  onToast,
  onError,
}: {
  onToast: (message: string, icon?: ReactNode) => void;
  onError: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const statusQuery = trpc.walletEarn.status.useQuery(undefined, { retry: 1 });
  const claim = trpc.walletEarn.claimDaily.useMutation();

  const data = statusQuery.data;
  const nextClaimAt = data?.nextClaimAt ? new Date(data.nextClaimAt) : null;

  /* Display-only countdown — re-render once a minute while cooling down. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!nextClaimAt) return;
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [nextClaimAt]);

  const remainingMs = nextClaimAt ? nextClaimAt.getTime() - nowMs : 0;
  // Cooldown from the server; if our clock says it has elapsed, let the
  // member tap and the server adjudicate (CONFLICT → refresh).
  const onCooldown =
    data?.canClaimDaily === false && nextClaimAt !== null && remainingMs > 0;

  const handleClaim = async () => {
    try {
      const result = await claim.mutateAsync();
      void utils.walletEarn.status.invalidate();
      onToast(
        `+${result.amount} Date-Coin earned`,
        <Coins size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />,
      );
    } catch (err) {
      // CONFLICT or otherwise — server is the source of truth, so refresh.
      void utils.walletEarn.status.invalidate();
      onError(errorMessage(err, "Couldn't complete your check-in — try again."));
    }
  };

  /* — Skeleton — */
  if (statusQuery.isLoading) {
    return (
      <div
        className="skeleton-shimmer h-44 rounded-[24px]"
        style={{ background: 'var(--field)' }}
        aria-label="Loading earn rewards"
      />
    );
  }

  /* — Error — */
  if (statusQuery.isError || !data) {
    return (
      <GlassCard className="flex items-center justify-between gap-3 p-5">
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          Couldn&rsquo;t load your rewards.
        </span>
        <button
          type="button"
          className="glass t-button inline-flex h-9 min-w-[44px] items-center justify-center rounded-full px-4 text-[var(--text)]"
          onClick={() => void statusQuery.refetch()}
        >
          Retry
        </button>
      </GlassCard>
    );
  }

  const dailyAmount = data.dailyAmount;
  const vaultBonusAmount = data.vaultBonusAmount;

  return (
    <GlassCard className="p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Coins
          size={18}
          className="shrink-0"
          style={{ color: 'var(--violet)' }}
          aria-hidden="true"
        />
        <p className="t-eyebrow min-w-0 flex-1">EARN DATE-COIN</p>
      </div>

      {/* Daily check-in */}
      <BtnPrimary
        className="mt-4 w-full"
        disabled={claim.isPending || onCooldown || !data.hasWallet}
        onClick={() => void handleClaim()}
      >
        {claim.isPending ? (
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          <CalendarCheck size={17} aria-hidden="true" />
        )}
        {onCooldown && nextClaimAt
          ? `Next check-in in ${formatRemaining(remainingMs)}`
          : `Check in · +${dailyAmount} DC`}
      </BtnPrimary>
      {!data.hasWallet && (
        <p className="t-micro mt-2" style={{ color: 'var(--text-secondary)' }}>
          Create your wallet above to start earning.
        </p>
      )}

      {/* Ways to earn */}
      <div className="mt-4 flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <CalendarCheck
            size={15}
            className="shrink-0"
            style={{ color: 'var(--violet)' }}
            aria-hidden="true"
          />
          <span className="t-caption min-w-0 flex-1" style={{ color: 'var(--text)' }}>
            Daily check-in — +{dailyAmount} DC
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <ShieldCheck
            size={15}
            className="shrink-0"
            style={{ color: 'var(--violet)' }}
            aria-hidden="true"
          />
          <span className="t-caption min-w-0 flex-1" style={{ color: 'var(--text)' }}>
            Verify your identity — +{vaultBonusAmount} DC (one time)
            {!data.vaultBonusAwarded && (
              <span
                className="t-micro mt-0.5 block"
                style={{ color: 'var(--text-secondary)' }}
              >
                Complete in Identity Vault below
              </span>
            )}
          </span>
          {data.vaultBonusAwarded && (
            <span
              className="t-micro inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-bold"
              style={{ background: 'var(--field)', color: 'var(--ok)' }}
            >
              <Check size={12} aria-hidden="true" />
              Earned
            </span>
          )}
        </div>
      </div>

      {/* Total earned */}
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          Total earned
        </span>
        <span className="t-title-sm" style={{ color: 'var(--text)' }}>
          {data.totalEarned.toLocaleString()}{' '}
          <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
            DC earned
          </span>
        </span>
      </div>

      {/* Honest caption — earned DC is a closed-loop in-app credit */}
      <p className="t-micro mt-3" style={{ color: 'var(--text-secondary)' }}>
        Earned Date-Coin is an in-app credit — it has no cash value, can&rsquo;t be
        converted to crypto or money, and can only be spent on Resonance features.
      </p>
    </GlassCard>
  );
}
