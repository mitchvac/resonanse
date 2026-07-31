import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Mic,
  SendHorizontal,
  Image,
  AudioLines,
  MapPin,
  Video,
  CalendarHeart,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTIONS = [
  { key: 'photo', label: 'Photo', icon: Image },
  { key: 'voice', label: 'Voice', icon: AudioLines },
  { key: 'date', label: 'Date idea', icon: CalendarHeart },
  { key: 'video', label: 'Video check', icon: Video },
  { key: 'location', label: 'Location', icon: MapPin },
] as const;

/**
 * Composer — chat.md §7
 * Glass bar: `+` actions grid, TextField (grows to 4 lines), mic icon,
 * send button (violet disc, arrow) — disabled until text. Focus ring 1px
 * violet. §5: composer header toggle (timer icon) "Vanish after 24h".
 * §3 coaching: long-press send → "Check tone" popover.
 */
export default function Composer({
  peerName,
  value,
  onChange,
  onSend,
  sending,
  ephemeral,
  onToggleEphemeral,
  onDateIdea,
  onVideoCheck,
  onActionToast,
}: {
  peerName: string;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  ephemeral: boolean;
  onToggleEphemeral: () => void;
  onDateIdea: () => void;
  onVideoCheck: () => void;
  onActionToast: (text: string) => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  /* Auto-grow to 4 lines (§7) */
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 21 * 4 + 24)}px`;
  }, [value]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (!value.trim() || sending) return;
    onSend();
  };

  const startPress = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setCoachOpen(true);
      setTimeout(() => setCoachOpen(false), 3400);
    }, 550);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const pickAction = (key: (typeof ACTIONS)[number]['key']) => {
    setActionsOpen(false);
    if (key === 'date') onDateIdea();
    else if (key === 'video') onVideoCheck();
    else onActionToast('Available after your first date — keep it in-app for now.');
  };

  return (
    <div className="relative px-3 pb-3">
      {/* Action grid */}
      <AnimatePresence>
        {actionsOpen && (
          <motion.div
            className="mb-2 grid grid-cols-5 gap-2 rounded-[24px] px-3 py-3"
            style={{
              background: 'var(--glass-a)',
              border: 'var(--glass-quiet-border)',
              boxShadow: 'var(--glass-hi), var(--glass-lo), var(--glass-shadow)',
            }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => pickAction(a.key)}
                className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-2xl py-1.5"
                style={{ background: 'var(--field)', color: 'var(--text)' }}
              >
                <a.icon size={18} style={{ color: a.key === 'date' ? 'var(--violet)' : 'var(--text)' }} aria-hidden="true" />
                <span className="t-micro">{a.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tone-check popover (Resonance+ coaching, long-press send) */}
      <AnimatePresence>
        {coachOpen && (
          <motion.div
            className="absolute -top-12 right-4 z-20 rounded-2xl px-4 py-2.5"
            style={{
              background: 'var(--glass-a)',
              border: 'var(--glass-quiet-border)',
              boxShadow: 'var(--glass-hi), var(--glass-lo), var(--glass-shadow)',
              color: 'var(--text)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="status"
          >
            <p className="t-caption">
              <span className="font-bold">Check tone: </span>
              Warm + specific. Maybe add a time?
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={submit}
        className="glass rounded-[28px] px-2.5 py-2"
        aria-label="Message composer"
      >
        <div className="glass-content">
          {/* Composer header — ephemeral toggle (§5) */}
          <div className="flex items-center justify-between px-1.5 pb-1.5">
            <button
              type="button"
              onClick={onToggleEphemeral}
              className={cn('t-caption flex min-h-[32px] items-center gap-1.5 rounded-full px-2.5 py-1', ephemeral && 'font-bold')}
              style={{
                background: 'var(--field)',
                color: ephemeral ? 'var(--warn)' : 'var(--text-secondary)',
                boxShadow: ephemeral ? 'inset 0 0 0 1.5px var(--warn)' : 'none',
              }}
              aria-pressed={ephemeral}
            >
              <Timer size={13} aria-hidden="true" />
              Vanish after 24h
            </button>
          </div>

          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={() => setActionsOpen((o) => !o)}
              className="flex h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--field)', color: 'var(--text)' }}
              aria-label="Open actions"
              aria-expanded={actionsOpen}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
            <textarea
              ref={areaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={`Message ${peerName}…`}
              className="t-value max-h-[108px] flex-1 resize-none rounded-2xl px-3.5 py-2.5 outline-none focus:ring-1 focus:ring-[var(--violet)]"
              style={{ background: 'var(--field)', color: 'var(--text)' }}
              aria-label={`Message ${peerName}`}
            />
            {!value.trim() && (
              <button
                type="button"
                onClick={() => onActionToast('Hold to record a voice note.')}
                className="flex h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Record a voice note"
              >
                <Mic size={18} aria-hidden="true" />
              </button>
            )}
            <motion.button
              type="submit"
              disabled={!value.trim() || sending}
              onPointerDown={startPress}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              className={cn(
                'flex h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-white',
                (!value.trim() || sending) && 'opacity-50',
              )}
              style={{ background: 'var(--violet)', boxShadow: 'var(--violet-glow)' }}
              whileTap={{ scale: 0.96 }}
              aria-label="Send message (long-press to check tone)"
            >
              <SendHorizontal size={17} aria-hidden="true" />
            </motion.button>
          </div>
        </div>
      </form>
    </div>
  );
}
