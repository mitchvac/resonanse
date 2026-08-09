import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Copy, Gift, Loader2, Ticket, Users } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { BtnPrimary } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

/**
 * ReferEarnSection — "REFER & EARN" (V71 referral bounty)
 *
 * A single-level referral thank-you: a member shares their code, a new member
 * applies it within the claim window, and when the new member joins Plus and
 * stays 30 days the REFERRER earns a fixed USD bounty — paid by Resonance,
 * one level only, capped per month. This is not a multi-level program.
 *
 * Renders just the GlassCard (mirrors EarnRewardsSection) — the parent
 * section owns the mt-4 px-5 spacing. The referred side is only ever shown
 * as "Member #<referredUserId>" — never any other PII.
 */

/* — Contract types (trpc.bounty lands with the backend; mirrored locally) — */
type MyCode = {
  code: string;
  claimWindowDays: number;
  bountyUsdText: string;
};

type Referral = {
  id: number;
  referredUserId: number;
  status: 'pending' | 'qualified' | 'void';
  createdAt: string | Date;
  qualifiedAt: string | Date | null;
};

type BountyTotals = {
  totalPendingUsdMicro: number;
  totalQualifiedUsdMicro: number;
  totalPaidUsdMicro: number;
  lifetimeUsdMicro: number;
};

/** Pull a human message out of a tRPC/network error without `any`. */
function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return fallback;
}

/** USD micro → display dollars. */
function formatUsd(micro: number): string {
  return (micro / 1_000_000).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

const inputClass = cn(
  't-body h-11 w-full rounded-2xl px-4 uppercase outline-none transition-shadow duration-fast',
  'bg-field font-mono text-[var(--text)] placeholder:normal-case placeholder:font-sans placeholder:text-[var(--text-secondary)]',
  'focus-visible:ring-2 focus-visible:ring-violet/40',
);

/**
 * Copy-to-clipboard with a legacy fallback: clipboard API first, then a
 * hidden textarea + select + execCommand('copy') for older webviews.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

/* — Referral status chip: pending = amber "vesting", qualified = green, void = muted — */
function ReferralChip({ status }: { status: Referral['status'] }) {
  const style =
    status === 'qualified'
      ? { label: 'Qualified', color: 'var(--ok)' }
      : status === 'void'
        ? { label: 'Void', color: 'var(--text-secondary)' }
        : { label: 'Vesting', color: 'var(--warn)' };
  return (
    <span
      className="t-micro inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-bold"
      style={{ background: 'var(--field)', color: style.color }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: style.color }}
        aria-hidden="true"
      />
      {style.label}
    </span>
  );
}

export default function ReferEarnSection({
  onToast,
  onError,
}: {
  onToast: (message: string, icon?: ReactNode) => void;
  onError: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const codeQuery = trpc.bounty.myCode.useQuery(undefined, { retry: 1 });
  const bountiesQuery = trpc.bounty.myBounties.useQuery(undefined, { retry: 1 });
  const claimCode = trpc.bounty.claimCode.useMutation();

  const [friendCode, setFriendCode] = useState('');
  const [copied, setCopied] = useState(false);

  const codeData = codeQuery.data as MyCode | undefined;
  const bountiesData = bountiesQuery.data as
    | { obligations: unknown[]; referrals: Referral[]; totals: BountyTotals }
    | undefined;

  const handleCopy = async (text: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onToast(
        'Code copied',
        <Check size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />,
      );
    } else {
      onError("Couldn't copy — long-press the code to copy it.");
    }
  };

  const handleClaim = async () => {
    const code = friendCode.trim().toUpperCase();
    if (!code) return;
    try {
      await claimCode.mutateAsync({ code });
      setFriendCode('');
      void utils.bounty.myBounties.invalidate();
      void utils.bounty.myCode.invalidate();
      onToast(
        'Code applied — welcome aboard!',
        <Gift size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />,
      );
    } catch (err) {
      onError(errorMessage(err, "Couldn't apply that code — try again."));
    }
  };

  /* — Skeleton — */
  if (codeQuery.isLoading || bountiesQuery.isLoading) {
    return (
      <div
        className="skeleton-shimmer h-44 rounded-[24px]"
        style={{ background: 'var(--field)' }}
        aria-label="Loading refer and earn"
      />
    );
  }

  /* — Error — */
  if (codeQuery.isError || bountiesQuery.isError || !codeData || !bountiesData) {
    return (
      <GlassCard className="flex items-center justify-between gap-3 p-5">
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          Couldn&rsquo;t load your referral code.
        </span>
        <button
          type="button"
          className="glass t-button inline-flex h-9 min-w-[44px] items-center justify-center rounded-full px-4 text-[var(--text)]"
          onClick={() => {
            void codeQuery.refetch();
            void bountiesQuery.refetch();
          }}
        >
          Retry
        </button>
      </GlassCard>
    );
  }

  const { totals, referrals } = bountiesData;

  const STATS: { label: string; value: number }[] = [
    { label: 'Pending vesting', value: totals.totalPendingUsdMicro },
    { label: 'Qualified', value: totals.totalQualifiedUsdMicro },
    { label: 'Paid', value: totals.totalPaidUsdMicro },
  ];

  return (
    <GlassCard className="p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Gift
          size={18}
          className="shrink-0"
          style={{ color: 'var(--violet)' }}
          aria-hidden="true"
        />
        <p className="t-eyebrow min-w-0 flex-1">REFER &amp; EARN</p>
      </div>
      <h2 className="t-title-sm mt-1" style={{ color: 'var(--text)' }}>
        Give friends a head start
      </h2>
      <p className="t-caption mt-2" style={{ color: 'var(--text-secondary)' }}>
        Share your code with new members. When they join the Plus plan and stay
        30 days, you earn a {codeData.bountyUsdText} thank-you bounty — paid by
        Resonance, one level only, capped 25 per month.
      </p>

      {/* Your code */}
      <div
        className="mt-4 flex items-center gap-1 rounded-[16px] py-1 pl-4 pr-1"
        style={{ background: 'var(--field)' }}
      >
        <span className="min-w-0 flex-1">
          <span className="t-micro block" style={{ color: 'var(--text-secondary)' }}>
            YOUR CODE
          </span>
          <span
            className="t-caption block break-all font-mono font-bold"
            style={{ color: 'var(--text)' }}
          >
            {codeData.code}
          </span>
        </span>
        <button
          type="button"
          aria-label="Copy your referral code"
          onClick={() => void handleCopy(codeData.code)}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
          style={{ color: copied ? 'var(--ok)' : 'var(--text-secondary)' }}
        >
          {copied ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          )}
        </button>
      </div>
      <p className="t-micro mt-2" style={{ color: 'var(--text-secondary)' }}>
        New members can apply your code within {codeData.claimWindowDays} days of
        joining.
      </p>

      {/* Have a friend's code? */}
      <div className="mt-4">
        <div className="flex items-center gap-2.5">
          <Ticket
            size={15}
            className="shrink-0"
            style={{ color: 'var(--violet)' }}
            aria-hidden="true"
          />
          <span className="t-caption min-w-0 flex-1 font-bold" style={{ color: 'var(--text)' }}>
            Have a friend&rsquo;s code?
          </span>
        </div>
        <div className="mt-2.5 flex flex-col gap-2.5">
          <input
            type="text"
            value={friendCode}
            onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
            maxLength={32}
            placeholder="RS-0000X1-A3F9"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={claimCode.isPending}
            aria-label="Friend's referral code"
            className={inputClass}
          />
          <BtnPrimary
            className="w-full"
            disabled={claimCode.isPending || friendCode.trim().length === 0}
            onClick={() => void handleClaim()}
          >
            {claimCode.isPending ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              'Apply code'
            )}
          </BtnPrimary>
        </div>
      </div>

      {/* Your bounties — summary strip */}
      <div className="mt-5 flex items-center gap-2.5">
        <Users
          size={15}
          className="shrink-0"
          style={{ color: 'var(--violet)' }}
          aria-hidden="true"
        />
        <span className="t-caption min-w-0 flex-1 font-bold" style={{ color: 'var(--text)' }}>
          Your bounties
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[16px] px-3 py-2.5"
            style={{ background: 'var(--field)' }}
          >
            <span className="t-title-sm block" style={{ color: 'var(--text)' }}>
              {formatUsd(stat.value)}
            </span>
            <span
              className="t-micro mt-0.5 block"
              style={{ color: 'var(--text-secondary)' }}
            >
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Referrals — referred side shown as Member # only, never other PII */}
      {referrals.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {referrals.map((referral) => (
            <li
              key={referral.id}
              className="flex items-center gap-2.5 rounded-[16px] px-3 py-2"
              style={{ background: 'var(--field)' }}
            >
              <span className="min-w-0 flex-1">
                <span className="t-caption block font-bold" style={{ color: 'var(--text)' }}>
                  Member #{referral.referredUserId}
                </span>
                <span
                  className="t-micro mt-0.5 block"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Joined{' '}
                  {new Date(referral.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </span>
              <ReferralChip status={referral.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-micro mt-3" style={{ color: 'var(--text-secondary)' }}>
          No referrals yet — share your code to get started.
        </p>
      )}

      {/* Honest caption — one level, USD, vesting + identity check */}
      <p className="t-micro mt-4" style={{ color: 'var(--text-secondary)' }}>
        Bounties are paid in USD by Resonance after a 30-day vesting period and
        a quick identity check. One level only — this is not a multi-level
        program.
      </p>
    </GlassCard>
  );
}
