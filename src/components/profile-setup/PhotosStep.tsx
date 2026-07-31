import { useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { Camera, GripVertical, ImagePlus, Plus, Sparkles, X } from 'lucide-react';
import GlassSheet from '@/components/GlassSheet';
import { Block, StaggerGroup } from '@/components/flow/controls';
import type { PhotoSlot, ProfileSetupDraft } from './draft';

/**
 * PhotosStep — profile-create.md §1
 * t-heading "Your 4–6 photos" + caption. 2×3 grid, 16px radius, 4px gaps.
 * Filled tiles: photo + drag handle (+ "MAIN" micro on slot 1); empty tiles:
 * dashed 1.5px --text 0.25 with a 20px +. Tap empty → action sheet (Camera /
 * Library); tap filled → edit sheet (Replace / Set as main / Remove). Drag to
 * reorder (tile lifts scale 1.04, others reflow). Quality-nudge chip slides
 * up 240ms after adding. Tiles stagger 50ms scale 0.92→1.
 */

const DEMO_POOL = ['/self-01.jpg', '/self-02.jpg', '/self-03.jpg', '/self-04.jpg'];

export default function PhotosStep({
  draft,
  update,
}: {
  draft: ProfileSetupDraft;
  update: (patch: Partial<ProfileSetupDraft>) => void;
}) {
  const [addSheet, setAddSheet] = useState<number | null>(null);
  const [editSheet, setEditSheet] = useState<number | null>(null);
  const [nudge, setNudge] = useState(false);

  const setPhotos = (photos: PhotoSlot[]) => update({ photos });

  const pickDemoPhoto = (exclude: (string | null)[]): string => {
    const unused = DEMO_POOL.filter((p) => !exclude.includes(p));
    if (unused.length > 0) return unused[0];
    return DEMO_POOL[Math.floor(Math.random() * DEMO_POOL.length)];
  };

  const addPhoto = (slot: number) => {
    const next = [...draft.photos];
    next[slot] = { ...next[slot], photo: pickDemoPhoto(next.map((s) => s.photo)) };
    setPhotos(next);
    setAddSheet(null);
    setNudge(true);
  };

  const replacePhoto = (slot: number) => {
    const next = [...draft.photos];
    next[slot] = {
      ...next[slot],
      photo: pickDemoPhoto(next.filter((_, i) => i !== slot).map((s) => s.photo)),
    };
    setPhotos(next);
    setEditSheet(null);
    setNudge(true);
  };

  const setAsMain = (slot: number) => {
    if (slot === 0) return setEditSheet(null);
    const next = [...draft.photos];
    const [entry] = next.splice(slot, 1);
    next.unshift(entry);
    setPhotos(next);
    setEditSheet(null);
  };

  const removePhoto = (slot: number) => {
    const next = [...draft.photos];
    next[slot] = { ...next[slot], photo: null };
    setPhotos(next);
    setEditSheet(null);
  };

  return (
    <div className="px-5 pt-6 pb-8">
      <Block>
        <h1 className="t-heading" style={{ color: 'var(--text-ink)' }}>
          Your 4–6 photos
        </h1>
        <p className="t-caption mt-2" style={{ color: 'var(--text-secondary)' }}>
          Lead with your face. Add one full-body, one doing something you love.
        </p>
      </Block>

      <StaggerGroup step={0.05} delay={0.08} className="mt-5">
        <Reorder.Group
          axis="y"
          values={draft.photos}
          onReorder={setPhotos}
          className="grid grid-cols-2 gap-1"
          as="div"
        >
          {draft.photos.map((slot, i) => (
            <Block key={slot.id} y={0}>
              <motion.div variants={{ hidden: { scale: 0.92 }, show: { scale: 1 } }}>
                <Reorder.Item
                  value={slot}
                  as="div"
                  whileDrag={{ scale: 1.04, zIndex: 20 }}
                  onTap={() => (slot.photo ? setEditSheet(i) : setAddSheet(i))}
                  className="relative aspect-[4/5] cursor-pointer overflow-hidden rounded-2xl select-none"
                >
                  {slot.photo ? (
                    <>
                      <img
                        src={slot.photo}
                        alt={i === 0 ? 'Main profile photo' : `Profile photo ${i + 1}`}
                        className="pointer-events-none h-full w-full object-cover"
                        draggable={false}
                      />
                      {i === 0 && (
                        <span className="t-micro absolute top-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-white">
                          MAIN
                        </span>
                      )}
                      <span
                        className="absolute right-2 bottom-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white"
                        aria-label="Drag to reorder"
                      >
                        <GripVertical size={14} aria-hidden="true" />
                      </span>
                    </>
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <span
                        className="absolute inset-0 rounded-2xl"
                        style={{ border: '1.5px dashed var(--text)', opacity: 0.25 }}
                        aria-hidden="true"
                      />
                      <Plus
                        size={20}
                        style={{ color: 'var(--text)', opacity: 0.5 }}
                        aria-hidden="true"
                      />
                    </span>
                  )}
                </Reorder.Item>
              </motion.div>
            </Block>
          ))}
        </Reorder.Group>
      </StaggerGroup>

      {/* AI quality nudge — dismissible glass chip, slides up 240ms */}
      <AnimatePresence>
        {nudge && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="glass mt-4 rounded-full"
          >
            <span className="glass-content flex items-center gap-2.5 py-2.5 pr-2 pl-4">
              <Sparkles size={16} style={{ color: 'var(--violet)', flexShrink: 0 }} aria-hidden="true" />
              <span className="t-caption flex-1" style={{ color: 'var(--text)' }}>
                Great light — this could be your main.
              </span>
              <button
                type="button"
                onClick={() => setNudge(false)}
                aria-label="Dismiss suggestion"
                className="flex h-8 w-8 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add photo action sheet */}
      <GlassSheet open={addSheet !== null} onClose={() => setAddSheet(null)} labelledBy="add-photo-title">
        <div className="px-6 pb-8 pt-2">
          <h2 id="add-photo-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            Add a photo
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            {[
              { icon: Camera, label: 'Camera', hint: 'Take one now' },
              { icon: ImagePlus, label: 'Library', hint: 'Pick from your photos' },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => addSheet !== null && addPhoto(addSheet)}
                className="flex min-h-[52px] items-center gap-3 rounded-2xl px-4 text-left transition-colors duration-fast"
                style={{ background: 'var(--field)' }}
              >
                <opt.icon size={20} style={{ color: 'var(--text)' }} aria-hidden="true" />
                <span>
                  <span className="t-button block" style={{ color: 'var(--text)' }}>
                    {opt.label}
                  </span>
                  <span className="t-caption block" style={{ color: 'var(--text-secondary)' }}>
                    {opt.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </GlassSheet>

      {/* Edit photo sheet */}
      <GlassSheet open={editSheet !== null} onClose={() => setEditSheet(null)} labelledBy="edit-photo-title">
        <div className="px-6 pb-8 pt-2">
          <h2 id="edit-photo-title" className="t-title-sm" style={{ color: 'var(--text)' }}>
            Photo options
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            {[
              { label: 'Replace', action: () => editSheet !== null && replacePhoto(editSheet) },
              { label: 'Set as main', action: () => editSheet !== null && setAsMain(editSheet) },
              { label: 'Remove', action: () => editSheet !== null && removePhoto(editSheet), danger: true },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={opt.action}
                className="flex min-h-[52px] items-center rounded-2xl px-4 text-left transition-colors duration-fast"
                style={{ background: 'var(--field)' }}
              >
                <span
                  className="t-button"
                  style={{ color: opt.danger ? 'var(--danger)' : 'var(--text)' }}
                >
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </GlassSheet>
    </div>
  );
}
