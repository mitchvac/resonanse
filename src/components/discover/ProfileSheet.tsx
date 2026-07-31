import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, Heart, Share2, Sparkle, X } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import GlassCard from '@/components/GlassCard';
import VerifiedBadge from '@/components/discover/VerifiedBadge';
import Chip from '@/components/discover/Chip';
import CompatibilityArc from '@/components/discover/CompatibilityArc';
import type { QueueProfile } from '@/components/discover/types';

/**
 * ProfileSheet — discover.md §3
 * Full-height GlassSheet: photo pager (dots, crossfade 240ms), name+age+
 * VerifiedBadge, intent/status chips, prompt GlassCards (stagger 70ms),
 * lifestyle/values chips, distance + "Active today" (--ok dot).
 * Sticky footer: Pass ghost · Like (violet) · Pulse (glass w/ violet spark).
 * Safety row: share profile, report/block.
 */
export default function ProfileSheet({
  open,
  profile,
  compatibility,
  distance,
  pending,
  onPass,
  onLike,
  onPulse,
  onClose,
}: {
  open: boolean;
  profile: QueueProfile | null;
  compatibility: number;
  distance?: string;
  pending?: boolean;
  onPass: () => void;
  onLike: () => void;
  onPulse: () => void;
  onClose: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = profile?.photos?.length ? profile.photos : ['/avatar-01.jpg'];

  if (!profile) return <GlassSheet open={open} onClose={onClose}>{null}</GlassSheet>;

  const lifestyle = Object.values(profile.lifestyle ?? {}).filter(Boolean) as string[];
  const chips = [
    profile.relationshipGoal,
    profile.relationshipStatus,
    ...(profile.desires ?? []),
  ].filter(Boolean) as string[];

  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="profile-sheet-name">
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {/* photo pager */}
          <div className="relative mt-2 aspect-[4/5] overflow-hidden rounded-[16px]">
            <AnimatePresence mode="wait">
              <motion.img
                key={photoIndex}
                src={photos[photoIndex % photos.length]}
                alt={`Photo ${photoIndex + 1} of ${profile.displayName}`}
                className="absolute inset-0 h-full w-full object-cover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.24 }}
              />
            </AnimatePresence>
            {photos.length > 1 && (
              <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Photo ${i + 1}`}
                    onClick={() => setPhotoIndex(i)}
                    className="h-1.5 rounded-full transition-all duration-fast"
                    style={{
                      width: i === photoIndex ? 20 : 8,
                      background: i === photoIndex ? 'var(--violet)' : 'rgba(255,255,255,0.6)',
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* identity */}
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 id="profile-sheet-name" className="t-title" style={{ color: 'var(--text)' }}>
                  {profile.displayName}, {profile.age}
                </h2>
                {profile.verified && <VerifiedBadge size={18} />}
              </div>
              <p className="t-caption mt-1 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                {[distance, profile.city].filter(Boolean).join(' · ')}
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--ok)' }}
                  aria-hidden="true"
                />
                <span style={{ color: 'var(--ok)' }}>Active today</span>
              </p>
            </div>
            <CompatibilityArc value={compatibility} size={48} animateKey={profile.id} />
          </div>

          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <Chip key={c}>{c}</Chip>
              ))}
            </div>
          )}

          {profile.bio && (
            <p className="t-body mt-4" style={{ color: 'var(--text)' }}>
              {profile.bio}
            </p>
          )}

          {/* prompts as stacked GlassCards */}
          {(profile.prompts ?? []).map((prompt, i) => (
            <motion.div
              key={prompt.question}
              className="mt-3"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.07 * i, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <GlassCard edge="none" className="rounded-[20px] p-4">
                <p className="t-micro" style={{ color: 'var(--text-secondary)' }}>
                  {prompt.question}
                </p>
                <p className="t-value mt-1.5" style={{ color: 'var(--text)' }}>
                  {prompt.answer}
                </p>
              </GlassCard>
            </motion.div>
          ))}

          {lifestyle.length > 0 && (
            <>
              <p className="t-eyebrow mt-5">Lifestyle</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {lifestyle.map((l) => (
                  <Chip key={l}>{l}</Chip>
                ))}
              </div>
            </>
          )}

          {/* safety row */}
          <div className="mt-5 flex items-center justify-center gap-6 pb-2">
            <button
              type="button"
              className="t-caption flex items-center gap-1.5"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Share profile"
            >
              <Share2 size={14} aria-hidden="true" /> Share
            </button>
            <button
              type="button"
              className="t-caption flex items-center gap-1.5"
              style={{ color: 'var(--danger)' }}
              aria-label="Report or block"
            >
              <Flag size={14} aria-hidden="true" /> Report / block
            </button>
          </div>
        </div>

        {/* sticky footer */}
        <div
          className="flex items-center gap-3 border-t px-5 py-4"
          style={{ borderColor: 'var(--ring-stroke)' }}
        >
          <button
            type="button"
            disabled={pending}
            onClick={onPass}
            className="t-button flex items-center gap-1.5 px-3 transition-opacity duration-fast active:opacity-70 disabled:opacity-50"
            style={{ color: 'var(--text)' }}
          >
            <X size={16} aria-hidden="true" /> Pass
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onLike}
            className="shadow-violet-glow t-button flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-violet text-white transition-transform duration-fast active:scale-[0.97] disabled:opacity-50"
          >
            <Heart size={18} fill="currentColor" strokeWidth={0} aria-hidden="true" /> Like
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onPulse}
            aria-label="Send Pulse"
            className="glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
          >
            <span className="glass-content flex items-center justify-center">
              <Sparkle size={20} style={{ color: 'var(--violet)', fill: 'var(--violet)' }} aria-hidden="true" />
            </span>
          </button>
        </div>
      </div>
    </GlassSheet>
  );
}
