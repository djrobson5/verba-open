'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuthContext } from '@/providers/AuthProvider';
import { fetchAllScenarios, type StoredScenario } from '@/lib/scenarios/store';
import { AdminTabs } from '@/components/admin/AdminTabs';
import { ScenarioIcon, resolveScenarioIconKey } from '@/config/scenarioIcons';

type AdminGate = 'checking' | 'allowed' | 'denied';

export default function AdminScenariosPage() {
  const { user, loading: authLoading } = useAuthContext();
  const router = useRouter();
  const [gate, setGate] = useState<AdminGate>('checking');
  const [scenarios, setScenarios] = useState<StoredScenario[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setGate('denied');
      return;
    }
    user.getIdTokenResult().then((res) => {
      setGate(res.claims.admin === true ? 'allowed' : 'denied');
    });
  }, [user, authLoading]);

  useEffect(() => {
    if (gate === 'denied') {
      router.replace('/dashboard');
    }
  }, [gate, router]);

  useEffect(() => {
    if (gate !== 'allowed') return;
    let cancelled = false;
    fetchAllScenarios({ includeArchived: true }).then((list) => {
      if (!cancelled) setScenarios(list);
    });
    return () => {
      cancelled = true;
    };
  }, [gate]);

  async function toggleArchive(scenario: StoredScenario) {
    if (!user) return;
    setSavingId(scenario.id);
    setError(null);
    try {
      await updateDoc(doc(db, 'scenarios', scenario.id), {
        archived: !scenario.archived,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      setScenarios((prev) =>
        prev
          ? prev.map((s) =>
              s.id === scenario.id ? { ...s, archived: !s.archived } : s,
            )
          : prev,
      );
    } catch (err) {
      console.error('Failed to toggle archive:', err);
      setError(err instanceof Error ? err.message : 'Failed to update.');
    } finally {
      setSavingId(null);
    }
  }

  if (gate !== 'allowed') {
    return (
      <div className="flex items-center gap-3 py-32 justify-center text-mute">
        <span className="w-5 h-5 rounded-full border-2 border-rule border-t-brand animate-spin" />
        <span className="text-sm font-medium">Checking permissions…</span>
      </div>
    );
  }

  return (
    <div>
      <AdminTabs current="scenarios" />
      <div className="mb-10 md:mb-14 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-mute mb-3">
            Admin
          </p>
          <h1
            className="text-ink font-extrabold tracking-[-0.04em] leading-[1.02]"
            style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)' }}
          >
            Scenarios
          </h1>
          <p className="mt-4 text-ink-soft text-lg max-w-xl">
            Edit prompts, change order, archive, or add new practice scenarios.
            Changes apply to new sessions immediately.
          </p>
        </div>
        <Link
          href="/admin/scenarios/new"
          className="inline-flex items-center gap-2 h-12 bg-brand text-white rounded-ui px-5 font-semibold hover:bg-brand-deep transition-colors text-sm shrink-0"
        >
          + New scenario
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-ui bg-white border border-bad/40 border-l-4 border-l-bad px-4 py-3 text-sm text-ink">
          <span className="font-semibold text-bad">Couldn&apos;t save.</span>{' '}
          <span className="text-ink-soft">{error}</span>
        </div>
      )}

      {scenarios === null ? (
        <div className="flex items-center gap-3 py-20 justify-center text-mute">
          <span className="w-5 h-5 rounded-full border-2 border-rule border-t-brand animate-spin" />
          <span className="text-sm font-medium">Loading scenarios…</span>
        </div>
      ) : (
        <div className="space-y-3">
          {scenarios.map((scenario) => (
            <div
              key={scenario.id}
              className={`bg-surface border border-rule rounded-ui p-5 flex items-center gap-5 ${
                scenario.archived ? 'opacity-70' : ''
              }`}
            >
              <div className="w-12 h-12 rounded-ui bg-surface-2 text-brand flex items-center justify-center shrink-0">
                <ScenarioIcon
                  iconKey={resolveScenarioIconKey(scenario)}
                  className="w-6 h-6"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-ink leading-tight">
                    {scenario.title}
                  </p>
                  {scenario.archived && (
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft bg-surface-2 px-2 py-0.5 rounded-full">
                      Archived
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink-soft mt-0.5 truncate">
                  {scenario.description}
                </p>
                <p className="text-xs text-mute mt-1 font-mono">
                  {scenario.id} · order {scenario.order}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleArchive(scenario)}
                  disabled={savingId === scenario.id}
                  className="text-sm text-ink-soft hover:text-ink px-3 py-2 transition-colors disabled:opacity-50"
                >
                  {scenario.archived ? 'Unarchive' : 'Archive'}
                </button>
                <Link
                  href={`/admin/scenarios/${scenario.id}`}
                  className="text-sm bg-white border border-control-border hover:border-brand hover:text-brand rounded-ui px-4 py-2 font-semibold text-ink transition-colors"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
