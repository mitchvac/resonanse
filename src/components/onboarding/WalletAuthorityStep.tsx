import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CircleAlert, Coins, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { BtnGhost, BtnGlass, BtnPrimary } from '@/components/ui/buttons';
import { FlowToast } from '@/components/flow/feedback';
import { Block, StaggerGroup } from '@/components/flow/controls';
import { useAuth } from '@/hooks/useAuth';
import { useWalletUtils, walletTrpc } from '@/lib/walletTrpc';

/**
 * WalletAuthorityStep — Smart Custody Wallet agreement (locked flowchart).
 *
 * Shown during onboarding when `wallet.state.hasWallet === false`, before
 * the flow can finish. The user must check "I understand and agree…" and
 * grant authority — declining cannot complete signup, so the decline path
 * shows the honest "The wallet is required to use Resonance" state with a
 * Log out option. After granting, first-100k members see the celebratory
 * "You received 10,000 Date-Coin — early member airdrop" state.
 */

const TERMS = [
  'The platform creates a wallet for you.',
  'While your switch is ON, your wallet may automatically supply Date-Coin tokens to new users.',
  'You receive rewards only in XRP.',
  'The system never takes your balance below 2,000 Date-Coin.',
  'You can turn the switch OFF at any time.',
];

type Phase = 'terms' | 'declined' | 'airdrop';

export default function WalletAuthorityStep({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const { logout, isAuthenticated } = useAuth();
  const walletUtils = useWalletUtils();

  const [phase, setPhase] = useState<Phase>('terms');
  const [agreed, setAgreed] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const stateQuery = walletTrpc.wallet.state.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: 1,
  });

  const grant = walletTrpc.wallet.grantAuthority.useMutation({
    onSuccess: (data) => {
      void walletUtils.wallet.state.invalidate();
      if (data?.isOriginalHundredK) {
        setPhase('airdrop');
      } else {
        onDone();
      }
    },
    onError: () =>
      setToast({
        id: Date.now(),
        message: "Couldn't create the wallet — check your connection and try again.",
      }),
  });

  /* Defensive: if the wallet already exists, skip straight through. */
  useEffect(() => {
    if (stateQuery.data?.hasWallet) onDone();
  }, [stateQuery.data, onDone]);

  return (
    <div className="flex h-full flex-col px-5 pt-6 pb-8">
      {phase === 'terms' && (
        <>
          <Block>
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: 'var(--field)' }}
            >
              <ShieldCheck size={24} style={{ color: 'var(--ember-text)' }} aria-hidden="true" />
            </span>
            <h1 className="t-heading mt-4" style={{ color: 'var(--text-ink)' }}>
              Smart Custody Wallet
            </h1>
          </Block>

          <StaggerGroup step={0.08} delay={0.1} className="mt-6">
            {stateQuery.isLoading && (
              <Block>
                <div className="glass skeleton-shimmer h-56 rounded-[24px]" aria-label="Loading" />
              </Block>
            )}

            {stateQuery.isError && (
              <Block>
                <GlassCard edge="none" className="p-5">
                  <p className="t-caption flex items-center gap-2" style={{ color: 'var(--danger)' }}>
                    <CircleAlert size={14} aria-hidden="true" />
                    We couldn&rsquo;t load the wallet terms.
                  </p>
                  <BtnGlass className="mt-4 w-full" onClick={() => void stateQuery.refetch()}>
                    Retry
                  </BtnGlass>
                </GlassCard>
              </Block>
            )}

            {stateQuery.isSuccess && stateQuery.data && !stateQuery.data.hasWallet && (
              <Block>
                <GlassCard edge="none" className="p-5">
                  <ul className="t-caption flex flex-col gap-2.5" style={{ color: 'var(--text-secondary)' }}>
                    {TERMS.map((term) => (
                      <li key={term} className="flex gap-2">
                        <span aria-hidden="true">·</span>
                        <span>{term}</span>
                      </li>
                    ))}
                  </ul>
                  <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="h-5 w-5 shrink-0 accent-[#7B49F5]"
                    />
                    <span className="t-caption" style={{ color: 'var(--text)' }}>
                      I understand and agree to the Smart Custody Wallet terms.
                    </span>
                  </label>
                  <BtnPrimary
                    className="mt-4 w-full"
                    disabled={!agreed || grant.isPending}
                    onClick={() => grant.mutate()}
                  >
                    {grant.isPending ? (
                      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                    ) : (
                      'Agree and create my wallet'
                    )}
                  </BtnPrimary>
                </GlassCard>
              </Block>
            )}
          </StaggerGroup>

          <Block className="mt-auto pt-8 text-center" y={16}>
            <BtnGhost onClick={() => setPhase('declined')} className="t-caption">
              I don&rsquo;t agree
            </BtnGhost>
          </Block>
        </>
      )}

      {phase === 'declined' && (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <CircleAlert size={40} style={{ color: 'var(--warn)' }} aria-hidden="true" />
          <h1 className="t-title mt-4" style={{ color: 'var(--text-ink)' }}>
            The wallet is required to use Resonance.
          </h1>
          <p className="t-value mt-3 max-w-[300px]" style={{ color: 'var(--text-secondary)' }}>
            Every member gets a Smart Custody Wallet — it&rsquo;s how Date-Coin works here.
            Without it, signup can&rsquo;t be completed.
          </p>
          <div className="mt-8 flex w-full flex-col gap-2">
            <BtnPrimary className="w-full" onClick={() => setPhase('terms')}>
              Review the terms again
            </BtnPrimary>
            <BtnGhost className="w-full" onClick={logout}>
              <LogOut size={15} aria-hidden="true" />
              Log out
            </BtnGhost>
          </div>
        </div>
      )}

      {phase === 'airdrop' && (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <div className="relative">
            <span
              className="flex h-20 w-20 items-center justify-center rounded-full"
              style={{ background: 'var(--field)' }}
            >
              <Coins size={36} style={{ color: 'var(--ember-text)' }} aria-hidden="true" />
            </span>
            {!reduced && (
              <motion.span
                className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
                style={{ width: 104, height: 104, x: '-50%', y: '-50%', border: '1.5px solid var(--violet)' }}
                initial={{ scale: 0.7, opacity: 0.9 }}
                animate={{ scale: 1.25, opacity: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden="true"
              />
            )}
          </div>
          <motion.h1
            className="t-heading mt-6"
            style={{ color: 'var(--text-ink)' }}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            You received 10,000 Date-Coin
          </motion.h1>
          <motion.p
            className="t-value mt-3 max-w-[300px]"
            style={{ color: 'var(--text-secondary)' }}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            Early member airdrop — you&rsquo;re one of the first 100,000. It&rsquo;s already in
            your wallet.
          </motion.p>
          <motion.div
            className="mt-10 w-full"
            initial={reduced ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.44, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <BtnPrimary className="w-full" onClick={onDone}>
              Continue
            </BtnPrimary>
          </motion.div>
        </div>
      )}

      <FlowToast
        toast={
          toast
            ? { ...toast, icon: <CircleAlert size={14} style={{ color: 'var(--danger)' }} /> }
            : null
        }
        onDismiss={() => setToast(null)}
      />
    </div>
  );
}
