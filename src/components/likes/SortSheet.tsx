import GlassSheet from '@/components/GlassSheet';
import { Check } from 'lucide-react';

export const SORT_OPTIONS = ['Compatibility', 'Most recent', 'Nearby', 'Newest members'] as const;
export type SortMode = (typeof SORT_OPTIONS)[number];

/**
 * SortSheet — likes-you.md §3
 * GlassSheet radio list: Compatibility · Most recent · Nearby · Newest
 * members. Resonance+ only.
 */
export default function SortSheet({
  open,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  value: SortMode;
  onChange: (v: SortMode) => void;
  onClose: () => void;
}) {
  return (
    <GlassSheet open={open} onClose={onClose} labelledBy="sort-title">
      <div className="px-6 pb-8 pt-2">
        <h3 id="sort-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
          Sort likes
        </h3>
        <div className="mt-3 flex flex-col" role="radiogroup" aria-label="Sort order">
          {SORT_OPTIONS.map((option) => {
            const active = option === value;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  onChange(option);
                  onClose();
                }}
                className="flex min-h-[48px] items-center justify-between gap-3 border-b px-1 last:border-b-0"
                style={{ borderColor: 'var(--ring-stroke)' }}
              >
                <span
                  className="t-value"
                  style={{
                    color: 'var(--text)',
                    fontWeight: active ? 700 : 400,
                  }}
                >
                  {option}
                </span>
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full"
                  style={{
                    background: active ? 'var(--violet)' : 'var(--field)',
                  }}
                  aria-hidden="true"
                >
                  {active && <Check size={12} strokeWidth={3.2} color="#FFFFFF" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </GlassSheet>
  );
}
