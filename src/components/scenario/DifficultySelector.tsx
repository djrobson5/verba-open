'use client';

import { useRef, type KeyboardEvent } from 'react';
import type { Difficulty } from '@/config/scenarios';

const difficulties: {
  value: Difficulty;
  label: string;
  tag: string;
  description: string;
}[] = [
  {
    value: 'easy',
    label: 'Easy',
    tag: 'Slow · Gentle corrections',
    description: 'Simple vocabulary, patient pace. Great for your first few tries.',
  },
  {
    value: 'medium',
    label: 'Medium',
    tag: 'Natural pace',
    description: 'Everyday speech with common expressions. Partner models correct usage.',
  },
  {
    value: 'hard',
    label: 'Hard',
    tag: 'Native pace · Idioms',
    description: 'Fast, colloquial, with unexpected twists. No hand-holding.',
  },
];

export function DifficultySelector({
  selected,
  onChange,
}: {
  selected: Difficulty;
  onChange: (d: Difficulty) => void;
}) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // Every card stays in the Tab order (as before); arrow keys also move and
  // select within the group, as screen-reader users expect of a radiogroup.
  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = (index + 1) % difficulties.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = (index - 1 + difficulties.length) % difficulties.length;
    }
    if (next === null) return;
    e.preventDefault();
    onChange(difficulties[next].value);
    buttonsRef.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Difficulty" className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {difficulties.map((d, i) => {
        const active = selected === d.value;
        return (
          <button
            key={d.value}
            ref={(el) => {
              buttonsRef.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(d.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={`relative text-left rounded-ui border p-5 transition-colors duration-200 ${
              active
                ? 'bg-brand border-brand shadow-[0_10px_28px_-12px_rgba(55, 48, 163,0.5)]'
                : 'bg-surface border-control-border hover:border-brand'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <span
                className={`text-[22px] font-extrabold tracking-[-0.03em] leading-tight ${
                  active ? 'text-accent' : 'text-ink'
                }`}
              >
                {d.label}
              </span>
              {active && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="w-5 h-5 mt-1 shrink-0 text-accent"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </div>
            <p
              className={`font-mono text-[12px] uppercase tracking-[0.14em] mb-2 ${
                active ? 'text-[#e3efe7]' : 'text-mute'
              }`}
            >
              {d.tag}
            </p>
            <p
              className={`text-[15px] leading-relaxed ${
                active ? 'text-[#e3efe7]' : 'text-ink-soft'
              }`}
            >
              {d.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
