import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Copy, Share2, X } from 'lucide-react';
import GlassCard from '@/components/GlassCard';

/**
 * ShareButton — landing-page share affordance.
 * Mobile: navigator.share() opens the native share sheet → every social app
 * (iMessage, WhatsApp, Instagram, X, TikTok DM…) works with zero per-app code.
 * Desktop (no Web Share API): fallback modal with one-tap share intents for
 * X / Facebook / WhatsApp / Telegram + copy link.
 * Pair with the og:/twitter: meta in index.html so the pasted link unfurls.
 */

export const SHARE_URL = 'https://resonanse.app';
const SHARE_TITLE = 'Resonance — Less swiping. More meeting.';
const SHARE_TEXT =
  'A daily queue of people chosen for mutual intent — photo-verified, built for real dates. Not another slot machine.';

const EASE_OUT = [0.22, 1, 0.36, 1] as [number, number, number, number];

const INTENTS: { name: string; href: string }[] = [
  {
    name: 'X / Twitter',
    href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SHARE_URL)}`,
  },
  {
    name: 'Facebook',
    href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}`,
  },
  {
    name: 'WhatsApp',
    href: `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${SHARE_URL}`)}`,
  },
  {
    name: 'Telegram',
    href: `https://t.me/share/url?url=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(SHARE_TEXT)}`,
  },
];

export default function ShareButton({
  className = '',
  label = 'Share Resonance',
}: {
  className?: string;
  label?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_URL);
    } catch {
      /* clipboard blocked — the URL is still visible to copy manually */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const onShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return; // user closed the sheet
      }
    }
    setModalOpen(true); // desktop / no Web Share API
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void onShare()}
        aria-label="Share Resonance"
        className={`t-button inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 py-3 transition-opacity duration-fast active:opacity-70 ${className}`}
        style={{ background: 'var(--field)', color: 'var(--text)' }}
      >
        <Share2 size={16} aria-hidden="true" />
        {label}
      </button>

      {/* Desktop fallback modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center px-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label="Share Resonance"
          >
            <button
              type="button"
              aria-label="Close share dialog"
              className="absolute inset-0 cursor-default"
              style={{ background: 'rgba(10, 12, 20, 0.45)', backdropFilter: 'blur(6px)' }}
              onClick={() => setModalOpen(false)}
            />
            <motion.div
              className="relative w-full max-w-sm"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
            >
              <GlassCard edge="none" className="rounded-[24px] p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="t-title-sm" style={{ color: 'var(--text)' }}>
                      Share Resonance
                    </h2>
                    <p className="t-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
                      Know someone still stuck on the slot-machine apps?
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setModalOpen(false)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>

                {/* copy link */}
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="t-value mt-5 flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl px-4 transition-opacity duration-fast active:opacity-70"
                  style={{ background: 'var(--field)', color: 'var(--text)' }}
                >
                  <span className="truncate">{SHARE_URL.replace('https://', '')}</span>
                  {copied ? (
                    <Check size={18} style={{ color: 'var(--ok)', flexShrink: 0 }} aria-hidden="true" />
                  ) : (
                    <Copy size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
                  )}
                </button>

                {/* social intents */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {INTENTS.map((intent) => (
                    <a
                      key={intent.name}
                      href={intent.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="t-value flex min-h-[48px] items-center justify-center rounded-2xl transition-opacity duration-fast active:opacity-70"
                      style={{ background: 'var(--field)', color: 'var(--text)' }}
                    >
                      {intent.name}
                    </a>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
