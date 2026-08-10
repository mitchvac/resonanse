import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';

/**
 * RoseSheet — sending a rose is a moment, not a tap. Opens a popup with the
 * realistic flowers and their gift card: ONE long-stem rose (daily gesture)
 * or A DOZEN roses (the grand gesture — one per day). Choosing sends
 * immediately; the sheet flips to a "on its way" state with the chosen
 * bouquet, then closes itself while the toast confirms.
 */
export type RoseVariant = 'single' | 'dozen';

export default function RoseSheet({
  open,
  name,
  flowersLeft,
  dozenLeft,
  pending = false,
  onSend,
  onClose,
}: {
  open: boolean;
  /** first name of the recipient */
  name: string;
  /** single roses left today (null = unknown, 99 = unlimited) */
  flowersLeft: number | null;
  /** dozen-roses sends left today */
  dozenLeft: number | null;
  pending?: boolean;
  onSend: (variant: RoseVariant) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('discover');
  const reduced = useReducedMotion();
  const [sent, setSent] = useState<RoseVariant | null>(null);

  // reset whenever the sheet re-opens
  useEffect(() => {
    if (open) setSent(null);
  }, [open]);

  // auto-close shortly after the "on its way" beat
  useEffect(() => {
    if (!sent) return;
    const t = window.setTimeout(onClose, reduced ? 700 : 1600);
    return () => window.clearTimeout(t);
  }, [sent, onClose, reduced]);

  const choose = (variant: RoseVariant) => {
    if (pending || sent) return;
    setSent(variant);
    onSend(variant);
  };

  const singleLeft = flowersLeft === 99 ? null : flowersLeft; // 99 = unlimited, hide count
  const dozenGone = dozenLeft === 0;
  const singleGone = flowersLeft === 0;

  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="rose-sheet-title">
      <div className="px-6 pb-8 pt-2">
        <AnimatePresence mode="wait" initial={false}>
          {sent ? (
            /* ——— the "it's on its way" beat ——— */
            <motion.div
              key="sent"
              className="flex flex-col items-center py-4 text-center"
              initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.img
                src={sent === 'dozen' ? '/gestures/roses-dozen.png' : '/gestures/rose-single.png'}
                alt=""
                className={sent === 'dozen' ? 'h-56 w-40 object-contain' : 'h-52 w-36 object-contain'}
                initial={{ y: reduced ? 0 : 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                draggable={false}
              />
              <span
                className="mt-3 flex h-9 w-9 items-center justify-center rounded-full"
                style={{ background: '#e35d7c' }}
              >
                <Check size={18} className="text-white" aria-hidden="true" />
              </span>
              <h3 className="t-title-sm mt-2" style={{ color: 'var(--text)' }}>
                {sent === 'dozen' ? t('roseSheet.sentDozenTitle') : t('roseSheet.sentSingleTitle')}
              </h3>
              <p className="t-body mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('roseSheet.sentBody', { name })}
              </p>
            </motion.div>
          ) : (
            /* ——— choose the gesture ——— */
            <motion.div
              key="choose"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: reduced ? 1 : 0.97 }}
              transition={{ duration: 0.22 }}
            >
              <p className="t-eyebrow">{t('roseSheet.eyebrow')}</p>
              <h3 id="rose-sheet-title" className="t-title-sm mt-1" style={{ color: 'var(--text)' }}>
                {t('roseSheet.title', { name })}
              </h3>
              <p className="t-body mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('roseSheet.subtitle')}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={pending || singleGone}
                  onClick={() => choose('single')}
                  aria-label={`${t('roseSheet.sendOneAria')}${singleLeft !== null ? ` — ${t('common.leftToday', { count: singleLeft })}` : ''}`}
                  className="flex flex-col items-center rounded-[20px] px-3 pb-4 pt-3 transition-transform duration-fast active:scale-[0.97] disabled:opacity-45"
                  style={{ background: 'var(--field)' }}
                >
                  <img
                    src="/gestures/rose-single.png"
                    alt={t('roseSheet.altOneRose')}
                    className="h-36 w-24 object-contain"
                    draggable={false}
                  />
                  <span className="t-caption mt-2 font-bold" style={{ color: 'var(--text)' }}>
                    {t('roseSheet.oneRose')}
                  </span>
                  <span className="t-micro mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {singleGone
                      ? t('roseSheet.noneLeft')
                      : singleLeft !== null
                        ? t('common.leftToday', { count: singleLeft })
                        : t('roseSheet.theClassic')}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={pending || dozenGone}
                  onClick={() => choose('dozen')}
                  aria-label={`${t('roseSheet.sendDozenAria')}${dozenLeft !== null ? ` — ${t('common.leftToday', { count: dozenLeft })}` : ''}`}
                  className="flex flex-col items-center rounded-[20px] px-3 pb-4 pt-3 transition-transform duration-fast active:scale-[0.97] disabled:opacity-45"
                  style={{ background: 'var(--field)' }}
                >
                  <img
                    src="/gestures/roses-dozen.png"
                    alt={t('roseSheet.altDozen')}
                    className="h-36 w-28 object-contain"
                    draggable={false}
                  />
                  <span className="t-caption mt-2 font-bold" style={{ color: 'var(--text)' }}>
                    {t('roseSheet.dozen')}
                  </span>
                  <span className="t-micro mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {dozenGone
                      ? t('roseSheet.backTomorrow')
                      : dozenLeft !== null
                        ? t('roseSheet.dozenPerDay', { count: dozenLeft })
                        : t('roseSheet.grandGesture')}
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassSheet>
  );
}
