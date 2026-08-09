import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  HandCoins,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Vault,
  Wallet,
  X,
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { BtnGlass } from '@/components/ui/buttons';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

/**
 * BountyAdminSection — "ADMIN — BOUNTY PAYOUTS" (V71 referral bounty ops)
 *
 * Operations console for the referral-bounty lifecycle:
 *   pending → qualified (30-day vesting) → approved → paid, or void.
 * Readiness gates (wallet, ID vault, sanctions CLEAR) are computed server-side
 * and surfaced per row. Payouts are always executed by the owner wallet —
 * "Record payout" only logs the owner-executed transaction hash for the audit
 * trail; it never moves funds from the app.
 */

/* — Contract types (trpc.bounty lands with the backend; mirrored locally) — */
type ObligationStatus =
  | 'pending'
  | 'qualified'
  | 'approved'
  | 'paid'
  | 'void'
  | 'clawedback';

type SanctionsVerdict = 'CLEAR' | 'REVIEW' | 'MATCH' | null;

type QueueObligation = {
  id: number;
  userId: number;
  bountyType: string;
  amountUsdMicro: number;
  status: ObligationStatus;
  createdAt: string | Date;
  qualifiedAt: string | Date | null;
  paidAt: string | Date | null;
  hasWallet: boolean;
  hasVaultRecord: boolean;
  latestSanctionsVerdict: SanctionsVerdict;
  payoutReady: boolean;
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

/** 64 hex chars, optional 0x prefix stripped before validation. */
function normalizeTxHash(raw: string): string | null {
  const trimmed = raw.trim().replace(/^0x/i, '');
  return /^[0-9a-fA-F]{64}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

const txInputClass = cn(
  't-body h-11 w-full rounded-2xl px-4 font-mono outline-none transition-shadow duration-fast',
  'bg-field text-[var(--text)] placeholder:text-[var(--text-secondary)]',
  'focus-visible:ring-2 focus-visible:ring-violet/40',
);

const chipClass =
  't-micro inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-bold';

/* — Status chip: pending amber / qualified violet / approved green / others muted — */
function StatusChip({ status }: { status: ObligationStatus }) {
  const style =
    status === 'pending'
      ? { label: 'Pending', color: 'var(--warn)' }
      : status === 'qualified'
        ? { label: 'Qualified', color: 'var(--violet)' }
        : status === 'approved'
          ? { label: 'Approved', color: 'var(--ok)' }
          : status === 'paid'
            ? { label: 'Paid', color: 'var(--ok)' }
            : { label: status === 'clawedback' ? 'Clawed back' : 'Void', color: 'var(--text-secondary)' };
  return (
    <span className={chipClass} style={{ background: 'var(--field)', color: style.color }}>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: style.color }}
        aria-hidden="true"
      />
      {style.label}
    </span>
  );
}

/* — Sanctions chip: CLEAR green / REVIEW amber / MATCH red / — muted — */
function SanctionsChip({ verdict }: { verdict: SanctionsVerdict }) {
  const style =
    verdict === 'CLEAR'
      ? { label: 'CLEAR', color: 'var(--ok)' }
      : verdict === 'REVIEW'
        ? { label: 'REVIEW', color: 'var(--warn)' }
        : verdict === 'MATCH'
          ? { label: 'MATCH', color: 'var(--danger)' }
          : { label: '—', color: 'var(--text-secondary)' };
  return (
    <span className={chipClass} style={{ background: 'var(--field)', color: style.color }}>
      {style.label}
    </span>
  );
}

/* — Readiness icon: ✓ green / ✗ red — */
function ReadinessIcon({
  ok,
  label,
  icon,
}: {
  ok: boolean;
  label: string;
  icon: ReactNode;
}) {
  return (
    <span
      className="t-micro inline-flex items-center gap-1.5"
      style={{ color: 'var(--text-secondary)' }}
      role="img"
      aria-label={`${label}: ${ok ? 'ready' : 'missing'}`}
    >
      {icon}
      {label}
      {ok ? (
        <CircleCheck size={13} style={{ color: 'var(--ok)' }} aria-hidden="true" />
      ) : (
        <CircleX size={13} style={{ color: 'var(--danger)' }} aria-hidden="true" />
      )}
    </span>
  );
}

/* — Inline "Record payout" form for approved rows — */
function RecordPayoutForm({
  obligationId,
  busy,
  onSubmit,
  onCancel,
}: {
  obligationId: number;
  busy: boolean;
  onSubmit: (txHash: string) => void;
  onCancel: () => void;
}) {
  const [rawHash, setRawHash] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = () => {
    const hash = normalizeTxHash(rawHash);
    if (!hash) {
      setFormError('Enter the 64-character hex transaction hash.');
      return;
    }
    setFormError(null);
    onSubmit(hash);
  };

  return (
    <div
      className="mt-2.5 rounded-[16px] px-3 py-3"
      style={{ background: 'var(--field)' }}
    >
      <label className="block">
        <span className="t-micro mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
          Owner-executed transaction hash (64 hex)
        </span>
        <input
          type="text"
          value={rawHash}
          onChange={(e) => setRawHash(e.target.value)}
          maxLength={66}
          placeholder="0x…"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          aria-label={`Transaction hash for obligation ${obligationId}`}
          className={txInputClass}
        />
      </label>
      <p className="t-micro mt-1.5" style={{ color: 'var(--text-secondary)' }}>
        Paid by: owner wallet — this only records the hash, it does not move funds.
      </p>
      {formError && (
        <p
          className="t-caption mt-1.5 flex items-center gap-1.5"
          style={{ color: 'var(--danger)' }}
          role="alert"
        >
          <CircleAlert size={14} aria-hidden="true" />
          {formError}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <BtnGlass
          className="h-9 px-4"
          disabled={busy || rawHash.trim().length === 0}
          onClick={handleSubmit}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Send size={15} aria-hidden="true" />
          )}
          Record payout
        </BtnGlass>
        <BtnGlass className="h-9 px-4" disabled={busy} onClick={onCancel}>
          Cancel
        </BtnGlass>
      </div>
    </div>
  );
}

export default function BountyAdminSection({
  onToast,
  onError,
}: {
  onToast: (message: string, icon?: ReactNode) => void;
  onError: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const queueQuery = trpc.bounty.adminQueue.useQuery(undefined, { retry: 1 });
  const adminQualify = trpc.bounty.adminQualify.useMutation();
  const adminApprove = trpc.bounty.adminApprove.useMutation();
  const adminVoid = trpc.bounty.adminVoid.useMutation();
  const adminMarkPaid = trpc.bounty.adminMarkPaid.useMutation();

  /* Which approved row has the inline payout form open. */
  const [payoutFor, setPayoutFor] = useState<number | null>(null);

  const queue = queueQuery.data as QueueObligation[] | undefined;
  const rowBusy =
    adminApprove.isPending || adminVoid.isPending || adminMarkPaid.isPending;

  const handleQualify = async () => {
    try {
      const result = await adminQualify.mutateAsync();
      void utils.bounty.adminQueue.invalidate();
      onToast(
        `${result.qualified} bounties qualified`,
        <ShieldCheck size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />,
      );
    } catch (err) {
      onError(errorMessage(err, "Couldn't run the vesting check — try again."));
    }
  };

  const handleApprove = async (obligationId: number) => {
    try {
      await adminApprove.mutateAsync({ obligationId });
      void utils.bounty.adminQueue.invalidate();
      onToast(
        `Obligation #${obligationId} approved`,
        <Check size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />,
      );
    } catch (err) {
      onError(errorMessage(err, "Couldn't approve — try again."));
    }
  };

  const handleVoid = async (obligationId: number) => {
    try {
      await adminVoid.mutateAsync({ obligationId });
      if (payoutFor === obligationId) setPayoutFor(null);
      void utils.bounty.adminQueue.invalidate();
      onToast(
        `Obligation #${obligationId} voided`,
        <X size={14} style={{ color: 'var(--warn)' }} aria-hidden="true" />,
      );
    } catch (err) {
      onError(errorMessage(err, "Couldn't void — try again."));
    }
  };

  const handleMarkPaid = async (obligationId: number, txHash: string) => {
    try {
      await adminMarkPaid.mutateAsync({ obligationId, txHash });
      setPayoutFor(null);
      void utils.bounty.adminQueue.invalidate();
      onToast(
        `Payout recorded for obligation #${obligationId}`,
        <HandCoins size={14} style={{ color: 'var(--ok)' }} aria-hidden="true" />,
      );
    } catch (err) {
      onError(errorMessage(err, "Couldn't record the payout — try again."));
    }
  };

  /* — Skeleton — */
  if (queueQuery.isLoading) {
    return (
      <div
        className="skeleton-shimmer h-44 rounded-[24px]"
        style={{ background: 'var(--field)' }}
        aria-label="Loading bounty payout queue"
      />
    );
  }

  /* — Error — */
  if (queueQuery.isError || !queue) {
    return (
      <GlassCard className="flex items-center justify-between gap-3 p-5">
        <span className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          Couldn&rsquo;t load the bounty queue.
        </span>
        <button
          type="button"
          className="glass t-button inline-flex h-9 min-w-[44px] items-center justify-center rounded-full px-4 text-[var(--text)]"
          onClick={() => void queueQuery.refetch()}
        >
          Retry
        </button>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <HandCoins
          size={18}
          className="shrink-0"
          style={{ color: 'var(--violet)' }}
          aria-hidden="true"
        />
        <p className="t-eyebrow min-w-0 flex-1">ADMIN — BOUNTY PAYOUTS</p>
      </div>
      <p className="t-caption mt-2" style={{ color: 'var(--text-secondary)' }}>
        Review vesting bounties, approve payouts, then record the on-chain
        payment. Payouts are always executed by the owner wallet — never by the
        app.
      </p>

      {/* Toolbar */}
      <div className="mt-4 flex flex-wrap gap-2">
        <BtnGlass
          className="h-9 px-4"
          disabled={adminQualify.isPending || rowBusy}
          onClick={() => void handleQualify()}
        >
          {adminQualify.isPending ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck size={15} aria-hidden="true" />
          )}
          Run vesting check
        </BtnGlass>
        <BtnGlass
          className="h-9 px-4"
          disabled={queueQuery.isFetching || rowBusy}
          onClick={() => void queueQuery.refetch()}
          ariaLabel="Refresh the bounty queue"
        >
          {queueQuery.isFetching ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={15} aria-hidden="true" />
          )}
          Refresh
        </BtnGlass>
      </div>

      {/* Queue */}
      {queue.length === 0 ? (
        <p className="t-caption mt-4" style={{ color: 'var(--text-secondary)' }}>
          No bounties in the queue.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {queue.map((obligation) => {
            const canApprove = obligation.status === 'qualified';
            // Readiness gates for approval: wallet + ID vault + CLEAR sanctions.
            // (Server-side payoutReady additionally requires status 'approved',
            // so it can't gate the approve action itself.)
            const readinessComplete =
              obligation.hasWallet &&
              obligation.hasVaultRecord &&
              obligation.latestSanctionsVerdict === 'CLEAR';
            const approveBlocked = canApprove && !readinessComplete;
            const canVoid =
              obligation.status === 'pending' || obligation.status === 'qualified';
            const canRecord =
              obligation.status === 'approved' && payoutFor !== obligation.id;
            return (
              <li
                key={obligation.id}
                className="rounded-[16px] px-3 py-2.5"
                style={{ background: 'var(--field)' }}
              >
                {/* Row head: id + member + amount + status */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span
                    className="t-caption font-mono font-bold"
                    style={{ color: 'var(--text)' }}
                  >
                    #{obligation.id}
                  </span>
                  <span className="t-caption" style={{ color: 'var(--text)' }}>
                    Member #{obligation.userId}
                  </span>
                  <span
                    className="t-caption font-bold"
                    style={{ color: 'var(--text)' }}
                  >
                    {formatUsd(obligation.amountUsdMicro)}
                  </span>
                  <span className="min-w-0 flex-1" />
                  <StatusChip status={obligation.status} />
                </div>

                {/* Readiness */}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <ReadinessIcon
                    ok={obligation.hasWallet}
                    label="Wallet"
                    icon={<Wallet size={13} aria-hidden="true" />}
                  />
                  <ReadinessIcon
                    ok={obligation.hasVaultRecord}
                    label="ID vault"
                    icon={<Vault size={13} aria-hidden="true" />}
                  />
                  <SanctionsChip verdict={obligation.latestSanctionsVerdict} />
                  {obligation.payoutReady && (
                    <span
                      className={chipClass}
                      style={{ background: 'var(--field)', color: 'var(--ok)' }}
                    >
                      <Check size={12} aria-hidden="true" />
                      Payout ready
                    </span>
                  )}
                </div>

                {/* Approve blocked explanation */}
                {approveBlocked && (
                  <p
                    className="t-micro mt-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Approve unlocks once the member has a wallet, an identity vault record, and a CLEAR sanctions verdict."
                  >
                    Approve unlocks once wallet, ID vault and a CLEAR sanctions
                    verdict are all in place.
                  </p>
                )}

                {/* Row actions */}
                {(canApprove || canVoid || canRecord) && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {canApprove && (
                      <BtnGlass
                        className="h-9 px-4"
                        disabled={rowBusy || approveBlocked}
                        ariaLabel={
                          approveBlocked
                            ? `Approve obligation ${obligation.id} — readiness incomplete`
                            : `Approve obligation ${obligation.id}`
                        }
                        onClick={() => void handleApprove(obligation.id)}
                      >
                        <Check size={15} aria-hidden="true" />
                        Approve
                      </BtnGlass>
                    )}
                    {canVoid && (
                      <BtnGlass
                        className="h-9 px-4"
                        disabled={rowBusy}
                        ariaLabel={`Void obligation ${obligation.id}`}
                        onClick={() => void handleVoid(obligation.id)}
                      >
                        <X size={15} style={{ color: 'var(--danger)' }} aria-hidden="true" />
                        <span style={{ color: 'var(--danger)' }}>Void</span>
                      </BtnGlass>
                    )}
                    {canRecord && (
                      <BtnGlass
                        className="h-9 px-4"
                        disabled={rowBusy}
                        ariaLabel={`Record payout for obligation ${obligation.id}`}
                        onClick={() => setPayoutFor(obligation.id)}
                      >
                        <HandCoins size={15} aria-hidden="true" />
                        Record payout
                      </BtnGlass>
                    )}
                  </div>
                )}

                {/* Inline payout form for the open approved row */}
                {obligation.status === 'approved' && payoutFor === obligation.id && (
                  <RecordPayoutForm
                    obligationId={obligation.id}
                    busy={adminMarkPaid.isPending}
                    onSubmit={(txHash) => void handleMarkPaid(obligation.id, txHash)}
                    onCancel={() => setPayoutFor(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Honest ops caption */}
      <p className="t-micro mt-4" style={{ color: 'var(--text-secondary)' }}>
        Never pay an obligation that fails identity or sanctions readiness.
        Recording a payout does not move funds — it logs the owner-executed
        transaction hash for the audit trail.
      </p>
    </GlassCard>
  );
}
