'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type Difficulty } from '@/config/scenarios';
import { DifficultySelector } from '@/components/scenario/DifficultySelector';
import { fetchAllScenarios, type StoredScenario } from '@/lib/scenarios/store';
import { ScenarioIcon, resolveScenarioIconKey } from '@/config/scenarioIcons';

const EYEBROW = 'font-mono text-[12px] uppercase tracking-[0.16em] text-mute mb-4';

export function ScenarioList({ langCode }: { langCode: string }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [scenarioList, setScenarioList] = useState<StoredScenario[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetchAllScenarios().then((list) => {
      if (!cancelled) setScenarioList(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleScenarioClick(scenarioId: string) {
    router.push(`/session/${scenarioId}?lang=${langCode}&difficulty=${difficulty}`);
  }

  return (
    <div>
      <section className="mb-12">
        <p className={EYEBROW}>Difficulty</p>
        <DifficultySelector selected={difficulty} onChange={setDifficulty} />
      </section>

      <section>
        <p className={EYEBROW}>Scenario</p>
        {scenarioList === null ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-ui bg-surface-2 p-6 md:p-7 animate-pulse h-[200px]"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scenarioList.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                onClick={() => handleScenarioClick(scenario.id)}
                className="group hover-lift bg-surface border border-rule rounded-ui p-6 md:p-7 text-left flex flex-col"
              >
                <div className="w-12 h-12 rounded-ui bg-surface-2 text-ink flex items-center justify-center mb-6 shrink-0">
                  <ScenarioIcon
                    iconKey={resolveScenarioIconKey(scenario)}
                    className="w-6 h-6"
                  />
                </div>
                <h3 className="text-[24px] font-bold text-ink mb-1.5 tracking-[-0.02em] leading-tight">
                  {scenario.title}
                </h3>
                <p className="text-[15px] text-ink-soft leading-relaxed">{scenario.description}</p>
                <div className="mt-auto pt-5">
                  <div className="pt-4 border-t border-rule-soft flex items-center justify-between gap-3 font-mono text-[12px] uppercase tracking-[0.14em]">
                    <span className="inline-flex items-center gap-1.5 text-brand font-semibold">
                      Start
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                        className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                      >
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                    <span className="text-mute">{difficulty} pace</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
