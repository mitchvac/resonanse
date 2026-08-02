import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Sparkles, X } from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import GlassSheet from '@/components/GlassSheet';
import { BtnGlass } from '@/components/ui/buttons';
import { Block, FlowTextArea, SegmentedControl, StaggerGroup } from '@/components/flow/controls';
import type { ProfileSetupDraft, PromptEntry } from './draft';

/**
 * PromptsStep — profile-create.md §2 — "Finish the sentence"
 * The mechanic: every starter is an unfinished sentence ("After a long day
 * I like to…"); the user writes the ending. Endings are what people comment
 * on. Chosen starters render as GlassCards (edge:none, rings only): starter
 * as eyebrow (t-caption 700 var(--text)), ending TextArea (t-value, 140-char
 * cap, live counter fades in only when typing). "+ Add a starter" opens the
 * picker sheet: search + mood segmented control (Playful / Honest / Spicy /
 * Deep). Sparkle per card → 3 example endings sliding up staggered 60ms.
 * Cards stagger 80ms.
 */

const EASE_SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];
const MAX_PROMPTS = 5;
const MAX_ANSWER = 140;

const PROMPT_BANK: { question: string; moods: string[] }[] = [
  { question: 'After a long day I like to…', moods: ['Playful', 'Honest'] },
  { question: 'Life is like…', moods: ['Playful', 'Deep'] },
  { question: 'My favorite color is…', moods: ['Playful'] },
  { question: "What I'm actually looking for…", moods: ['Honest', 'Deep'] },
  { question: 'A relationship feels right when…', moods: ['Deep', 'Honest'] },
  { question: 'The way I show love is…', moods: ['Deep'] },
  { question: 'The lesson my last relationship taught me…', moods: ['Honest', 'Deep'] },
  { question: "I'll know it's real when…", moods: ['Deep'] },
  { question: 'My non-negotiable is…', moods: ['Honest'] },
  { question: 'My life in five years looks like…', moods: ['Deep'] },
  { question: 'Green flags I look for…', moods: ['Honest'] },
  { question: 'The way to my heart is…', moods: ['Honest', 'Playful'] },
  { question: "We'll get along if…", moods: ['Honest', 'Spicy'] },
  { question: "A first date I'll actually say yes to…", moods: ['Playful', 'Spicy'] },
  { question: 'A perfect Sunday looks like…', moods: ['Playful', 'Deep'] },
  { question: 'Home feels like…', moods: ['Deep'] },
  { question: 'My simple pleasure is…', moods: ['Playful', 'Deep'] },
  { question: "I'm unreasonably good at…", moods: ['Playful'] },
  { question: 'Two truths and a lie:', moods: ['Playful'] },
];

const MOODS = ['Playful', 'Honest', 'Spicy', 'Deep'];

const SUGGESTIONS: Record<string, string[]> = {
  'After a long day I like to…': [
    'Cook something real, music on, phone face-down in the kitchen.',
    'A long walk with no destination — I always come back with a better mood.',
    'Gym first, then a show I pretend I will only watch one episode of.',
  ],
  'Life is like…': [
    'A road trip — the detours end up being the story you tell.',
    'Cooking without a recipe: trust your taste, adjust as you go.',
    'A playlist on shuffle — you get what you get, so dance anyway.',
  ],
  'My favorite color is…': [
    'Sunset orange — the ten minutes where the whole day forgives you.',
    'Deep green. Forests, not traffic lights.',
    'Black coffee counts as a color and I will die on this hill.',
  ],
  "What I'm actually looking for…": [
    'A partner, not a project. Someone building a life, not escaping one.',
    'Slow on purpose: real conversation, then a real date, then we see.',
    'One person, honest effort, and a reason to delete this app.',
  ],
  'A relationship feels right when…': [
    'Silence is comfortable and hard talks end with us closer, not scorekeeping.',
    'We both leave the argument liking each other more, not less.',
    'I never have to translate myself. It just lands.',
  ],
  'The way I show love is…': [
    'Acts of service — I notice what you need before you ask.',
    'Words. You will always know exactly where you stand with me.',
    'Time. My calendar is the honestest thing I own.',
  ],
  'The lesson my last relationship taught me…': [
    'Chemistry is common. Compatibility is work. I want both.',
    'Say the hard thing early — it only gets more expensive.',
    'How someone fights tells you more than how they flirts.',
  ],
  "I'll know it's real when…": [
    'I stop performing. When the unfiltered version of me gets to stay.',
    'Bad days bring us closer instead of giving us an exit.',
    'Planning a year ahead feels easy, not scary.',
  ],
  'My non-negotiable is…': [
    'Honesty when it costs something. Everything else is negotiable.',
    'Kindness to strangers — how you treat waiters is who you are.',
    'You have your own life. I want a partner, not a dependent.',
  ],
  'My life in five years looks like…': [
    'A home with people I chose in it. Location flexible, people not.',
    'Building something — a family, a business, a garden. Probably all three.',
    'Slower mornings, bigger table, same person across from me.',
  ],
  'Green flags I look for…': [
    'You ask follow-up questions. You tip well. You mean what you say.',
    'Curiosity over judgement, every single time.',
    'You introduce me to your friends like you mean it.',
  ],
  'The way to my heart is…': [
    'Cooking something ambitious and laughing when it flops.',
    'Long walks that accidentally become 12km.',
    'Remembering the small stuff I mentioned once.',
  ],
  "We'll get along if…": [
    "You can disagree without making it a courtroom.",
    'You laugh at yourself first and often.',
    'You actually want to meet in person within the week.',
  ],
  "A first date I'll actually say yes to…": [
    'Coffee that turns into a walk that turns into dinner on accident.',
    'Something with an out: one drink, great conversation, no pressure.',
    'Cooking something together — teamwork with snacks.',
  ],
  'A perfect Sunday looks like…': [
    'Slow morning, long brunch, nowhere to be until Monday.',
    'Trail in the morning, takeout and a movie by eight.',
    'Farmers market, cooking together, phones in a drawer.',
  ],
  'Home feels like…': [
    'The smell of something cooking and someone glad I walked in.',
    'Where I can be fully quiet without it being weird.',
    'A place I want to bring people, not escape from.',
  ],
  'My simple pleasure is…': [
    'First coffee of the day, outside, no phone.',
    'The produce section of a good market on a Saturday.',
    'Fresh sheets, open window, nowhere to be.',
  ],
  "I'm unreasonably good at…": [
    'Remembering what you said three weeks ago.',
    'Finding the best thing on any menu in under a minute.',
    'Making friends with every dog at the party.',
  ],
  'Two truths and a lie:': [
    "I've swum with bioluminescence. I hate cilantro. I met my best friend on a plane.",
    'I make pottery badly but proudly. I once lived on a boat. I can name every capital.',
    'I ran a marathon on a dare. I speak three languages. I have a pet snail.',
  ],
};

function suggestionsFor(question: string): string[] {
  return (
    SUGGESTIONS[question] ?? [
      'Something specific from last weekend, not a cliché.',
      'The honest version — people comment on real.',
      'Start with the detail, skip the preamble.',
    ]
  );
}

export default function PromptsStep({
  draft,
  update,
}: {
  draft: ProfileSetupDraft;
  update: (patch: Partial<ProfileSetupDraft>) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mood, setMood] = useState('Playful');
  const [query, setQuery] = useState('');
  const [assistOpen, setAssistOpen] = useState<number | null>(null);

  const setPrompts = (prompts: PromptEntry[]) => update({ prompts });

  const available = useMemo(() => {
    const chosen = new Set(draft.prompts.map((p) => p.question));
    return PROMPT_BANK.filter(
      (p) =>
        !chosen.has(p.question) &&
        p.moods.includes(mood) &&
        (query.trim() === '' || p.question.toLowerCase().includes(query.trim().toLowerCase())),
    );
  }, [draft.prompts, mood, query]);

  const addPrompt = (question: string) => {
    setPrompts([...draft.prompts, { question, answer: '' }]);
    setPickerOpen(false);
    setQuery('');
  };

  return (
    <div className="px-5 pt-6 pb-8">
      <Block>
        <h1 className="t-heading" style={{ color: 'var(--text-ink)' }}>
          Finish the sentence
        </h1>
        <p className="t-body mt-2" style={{ color: 'var(--text-secondary)' }}>
          Pick 3–5 starters and finish them your way. Your endings are what people comment on — specific beats clever.
        </p>
      </Block>

      <StaggerGroup step={0.08} delay={0.08} className="mt-6 flex flex-col gap-3">
        {draft.prompts.map((prompt, i) => (
          <Block key={prompt.question}>
            <GlassCard edge="none">
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="t-caption font-bold" style={{ color: 'var(--text)' }}>
                    {prompt.question}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setAssistOpen(assistOpen === i ? null : i)}
                      aria-label={`AI suggestions for “${prompt.question}”`}
                      className="flex h-9 w-9 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
                      style={{ color: 'var(--violet)' }}
                    >
                      <Sparkles size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrompts(draft.prompts.filter((_, j) => j !== i))}
                      aria-label={`Remove starter “${prompt.question}”`}
                      className="flex h-9 w-9 items-center justify-center rounded-full transition-opacity duration-fast active:opacity-70"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <FlowTextArea
                    value={prompt.answer}
                    onChange={(e) =>
                      setPrompts(
                        draft.prompts.map((p, j) =>
                          j === i ? { ...p, answer: e.target.value } : p,
                        ),
                      )
                    }
                    placeholder="Finish it — make it specific."
                    rows={3}
                    maxLength={MAX_ANSWER}
                    aria-label={`Your ending for “${prompt.question}”`}
                  />
                </div>

                {/* AI assist: 3 suggestion chips, slide up staggered 60ms */}
                <AnimatePresence initial={false}>
                  {assistOpen === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col gap-2 pt-3">
                        {suggestionsFor(prompt.question).map((suggestion, k) => (
                          <motion.button
                            key={suggestion}
                            type="button"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: k * 0.06, duration: 0.24, ease: EASE_SPRING }}
                            onClick={() => {
                              setPrompts(
                                draft.prompts.map((p, j) =>
                                  j === i ? { ...p, answer: suggestion.slice(0, MAX_ANSWER) } : p,
                                ),
                              );
                              setAssistOpen(null);
                            }}
                            className="t-caption rounded-2xl px-3.5 py-2.5 text-left transition-opacity duration-fast active:opacity-70"
                            style={{ background: 'var(--field)', color: 'var(--text)' }}
                          >
                            {suggestion}
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </GlassCard>
          </Block>
        ))}

        {draft.prompts.length < MAX_PROMPTS && (
          <Block>
            <BtnGlass onClick={() => setPickerOpen(true)} className="w-full">
              <Plus size={18} aria-hidden="true" />
              Add a starter
            </BtnGlass>
          </Block>
        )}
      </StaggerGroup>

      {/* Starter picker sheet — search + mood segmented control */}
      <GlassSheet open={pickerOpen} onClose={() => setPickerOpen(false)} labelledBy="picker-title">
        <div className="px-5 pb-8 pt-2">
          <h2 id="picker-title" className="t-title-sm px-1" style={{ color: 'var(--text)' }}>
            Pick a starter
          </h2>
          <div className="mt-3">
            <SegmentedControl options={MOODS} value={mood} onChange={setMood} ariaLabel="Starter mood" />
          </div>
          <div
            className="mt-3 flex items-center gap-2 rounded-2xl px-3.5"
            style={{ background: 'var(--field)' }}
          >
            <Search size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search starters"
              aria-label="Search starters"
              className="t-value h-11 w-full bg-transparent outline-none"
              style={{ color: 'var(--text)' }}
            />
          </div>
          <div className="mt-3 flex max-h-[320px] flex-col gap-2 overflow-y-auto no-scrollbar">
            {available.length === 0 && (
              <p className="t-caption px-1 py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
                No starters here — try another mood.
              </p>
            )}
            {available.map((p) => (
              <button
                key={p.question}
                type="button"
                onClick={() => addPrompt(p.question)}
                className="t-value min-h-[52px] rounded-2xl px-4 py-3 text-left transition-opacity duration-fast active:opacity-70"
                style={{ background: 'var(--field)', color: 'var(--text)' }}
              >
                {p.question}
              </button>
            ))}
          </div>
        </div>
      </GlassSheet>
    </div>
  );
}
