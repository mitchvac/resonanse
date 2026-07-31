import { motion } from 'framer-motion';
import { Bell, Check, Images, MapPin } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import { BtnGlass, BtnGhost } from '@/components/ui/buttons';
import { Block, StaggerGroup } from '@/components/flow/controls';
import type { OnboardingDraft } from './draft';

/**
 * PermissionsStep — onboarding.md §4
 * Three glass cards (edge:none): Location / Notifications / Photos & Media,
 * each with icon, t-title-sm, t-caption, right BtnGlass "Allow" that morphs
 * to an --ok check (label crossfade 160ms). Footer microcopy. Cards stagger
 * 80ms. "Not now" ghost skips; denied permission shows inline caption with
 * deep-link hint.
 */

type PermKey = keyof OnboardingDraft['permissions'];

const ROWS: { key: PermKey; icon: typeof MapPin; title: string; caption: string }[] = [
  {
    key: 'location',
    icon: MapPin,
    title: 'Location',
    caption: 'Powers your queue, Nearby feed, and events. Never shown exactly.',
  },
  {
    key: 'notifications',
    icon: Bell,
    title: 'Notifications',
    caption: 'New likes, matches, and your noon queue drop. Nothing spammy.',
  },
  {
    key: 'photos',
    icon: Images,
    title: 'Photos/Media',
    caption: 'So you can add your 4–6 photos next.',
  },
];

export default function PermissionsStep({
  draft,
  update,
  onSkip,
}: {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
  onSkip: () => void;
}) {
  const allow = async (key: PermKey) => {
    /* Best-effort real permission prompts; the demo flow marks allowed either
       way unless the browser actively denies. */
    try {
      if (key === 'location' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          () => undefined,
          () => update({ permissions: { ...draft.permissions, location: 'denied' } }),
          { timeout: 4000 },
        );
      } else if (
        key === 'notifications' &&
        typeof Notification !== 'undefined' &&
        Notification.requestPermission
      ) {
        const result = await Notification.requestPermission();
        if (result === 'denied') {
          update({ permissions: { ...draft.permissions, notifications: 'denied' } });
          return;
        }
      }
    } catch {
      /* fall through — mark allowed for the demo */
    }
    update({ permissions: { ...draft.permissions, [key]: 'allowed' } });
  };

  return (
    <div className="flex h-full flex-col px-5 pt-6 pb-8">
      <Block>
        <h1 className="t-heading" style={{ color: 'var(--text-ink)' }}>
          A few permissions
        </h1>
      </Block>

      <StaggerGroup step={0.08} delay={0.08} className="mt-6 flex flex-col gap-3">
        {ROWS.map((row) => {
          const state = draft.permissions[row.key];
          return (
            <Block key={row.key}>
              <GlassCard edge="none">
                <div className="flex items-center gap-4 px-5 py-4">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'var(--field)' }}
                  >
                    <row.icon size={20} style={{ color: 'var(--text)' }} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="t-title-sm" style={{ color: 'var(--text)' }}>
                      {row.title}
                    </p>
                    <p className="t-caption mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {row.caption}
                    </p>
                    {state === 'denied' && (
                      <p className="t-caption mt-1.5" style={{ color: 'var(--warn)' }}>
                        Permission off — enable it anytime from your browser&rsquo;s site
                        settings for Resonance.
                      </p>
                    )}
                  </div>
                  <BtnGlass
                    onClick={() => void allow(row.key)}
                    className="h-10 shrink-0 px-4"
                    ariaLabel={
                      state === 'allowed' ? `${row.title} allowed` : `Allow ${row.title}`
                    }
                  >
                    <span className="relative flex h-5 min-w-14 items-center justify-center">
                      <motion.span
                        key={state === 'allowed' ? 'check' : 'label'}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.16 }}
                        className="t-button flex items-center gap-1"
                        style={{ color: state === 'allowed' ? 'var(--ok)' : 'var(--text)' }}
                      >
                        {state === 'allowed' ? (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
                            className="flex"
                          >
                            <Check size={18} strokeWidth={2.5} aria-hidden="true" />
                          </motion.span>
                        ) : (
                          'Allow'
                        )}
                      </motion.span>
                    </span>
                  </BtnGlass>
                </div>
              </GlassCard>
            </Block>
          );
        })}
      </StaggerGroup>

      <Block className="mt-auto pt-8 text-center" y={16}>
        <p className="t-caption" style={{ color: 'var(--text-secondary)' }}>
          You can change all of this later in Settings → Privacy.
        </p>
        <BtnGhost onClick={onSkip} className="mt-2">
          Not now
        </BtnGhost>
      </Block>
    </div>
  );
}
