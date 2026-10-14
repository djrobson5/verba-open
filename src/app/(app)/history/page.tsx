'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { getUserConversationsRef } from '@/config/firestore';
import { useAuthContext } from '@/providers/AuthProvider';
import { getLanguage } from '@/config/languages';
import { fetchAllScenarios, type StoredScenario } from '@/lib/scenarios/store';
import { ScenarioIcon, resolveScenarioIconKey } from '@/config/scenarioIcons';
import { getSampleConversations } from './sample-data';

interface ConversationMessage {
  role: string;
  text: string;
  timestamp?: Timestamp;
}

interface ConversationRecord {
  id: string;
  scenarioId?: string;
  scenarioTitle: string;
  languageCode?: string;
  languageName: string;
  difficulty: string;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  messages: ConversationMessage[];
}

function formatRelative(ts?: Timestamp): string {
  if (!ts?.toDate) return '';
  const date = ts.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24 && date.getDate() === now.getDate()) {
    return `Today · ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.getDate() === yesterday.getDate() && diffDay < 2) {
    return `Yesterday · ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (diffDay < 7) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: diffDay > 365 ? 'numeric' : undefined });
}

function formatDuration(start?: Timestamp, end?: Timestamp): string | null {
  if (!start?.toDate || !end?.toDate) return null;
  const ms = end.toDate().getTime() - start.toDate().getTime();
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec.toString().padStart(2, '0')}s`;
}

function iconKeyFor(scenarioId: string | undefined, scenario: StoredScenario | undefined) {
  return resolveScenarioIconKey(scenario ?? { id: scenarioId });
}

function Spinner({ label, className = 'py-32' }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3 justify-center text-mute ${className}`}>
      <span className="w-5 h-5 rounded-full border-2 border-rule border-t-brand animate-spin" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const primaryButtonCls =
  'inline-flex items-center gap-2 h-12 bg-brand text-white rounded-ui px-6 font-semibold hover:bg-brand-deep transition-colors';

const eyebrowCls = 'font-mono text-[12px] uppercase tracking-[0.16em] text-mute';

function HistoryPageInner() {
  const { user, loading: authLoading } = useAuthContext();
  const searchParams = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [scenariosMap, setScenariosMap] = useState<Map<string, StoredScenario>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllScenarios({ includeArchived: true }).then((list) => {
      if (cancelled) return;
      setScenariosMap(new Map(list.map((s) => [s.id, s])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isPreview) {
      setConversations(getSampleConversations() as unknown as ConversationRecord[]);
      setLoading(false);
      return;
    }
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const ref = getUserConversationsRef(user!.uid);
        const q = query(ref, orderBy('startedAt', 'desc'));
        const snap = await getDocs(q);
        if (cancelled) return;
        setConversations(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ConversationRecord),
        );
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load history:', err);
        setLoadError(err instanceof Error ? err.message : 'Failed to load history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, isPreview]);

  if (loading) {
    return <Spinner label="Loading your history…" />;
  }

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-bad mb-3">
          Something went wrong
        </p>
        <h1
          className="text-ink font-extrabold tracking-[-0.04em] leading-[1.05] mb-3"
          style={{ fontSize: 'clamp(1.75rem, 3vw, 2.25rem)' }}
        >
          We couldn&apos;t load your history.
        </h1>
        <p className="text-ink-soft mb-6">{loadError}</p>
        <button onClick={() => window.location.reload()} className={primaryButtonCls}>
          Try again
        </button>
      </div>
    );
  }

  const selected = conversations.find((c) => c.id === selectedId);

  if (selected) {
    return (
      <ConversationDetail
        record={selected}
        scenariosMap={scenariosMap}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div>
      {isPreview && (
        <div className="mb-6 rounded-ui bg-accent-soft border border-rule px-4 py-3 text-sm flex items-center justify-between gap-4">
          <div>
            <span className="font-semibold text-ink">Preview mode.</span>{' '}
            <span className="text-ink-soft">
              Sample entries — nothing is being read from or written to Firestore.
            </span>
          </div>
          <Link
            href="/history"
            className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-brand hover:text-brand-deep transition-colors shrink-0"
          >
            Exit →
          </Link>
        </div>
      )}
      <div className="mb-10 md:mb-14">
        <p className={`${eyebrowCls} mb-3`}>History</p>
        <h1
          className="text-ink font-extrabold tracking-[-0.04em] leading-[1.02]"
          style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)' }}
        >
          Every conversation, saved.
        </h1>
        <p className="mt-4 text-ink-soft text-lg max-w-xl">
          Every practice session you complete is kept here. Tap one to revisit the transcript.
        </p>
      </div>

      {conversations.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => {
            const scenario = conv.scenarioId ? scenariosMap.get(conv.scenarioId) : undefined;
            const language = conv.languageCode ? getLanguage(conv.languageCode) : undefined;
            const userTurns = conv.messages.filter((m) => m.role === 'user').length;
            const duration = formatDuration(conv.startedAt, conv.endedAt);
            const when = formatRelative(conv.startedAt);
            return (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className="group hover-lift w-full text-left bg-surface border border-rule rounded-ui p-4 sm:p-5 flex items-center gap-4 sm:gap-5"
              >
                <div className="w-12 h-12 rounded-ui bg-surface-2 text-brand flex items-center justify-center shrink-0">
                  <ScenarioIcon iconKey={iconKeyFor(conv.scenarioId, scenario)} className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-ink tracking-[-0.01em] leading-tight truncate">
                    {conv.scenarioTitle}
                  </p>
                  <p className="text-sm text-ink-soft mt-0.5">
                    <span className="font-semibold text-ink">
                      {language?.nativeName ?? conv.languageName}
                    </span>
                    <span className="mx-1.5 text-mute">·</span>
                    {conv.difficulty}
                    {duration && (
                      <>
                        <span className="mx-1.5 text-mute">·</span>
                        <span className="font-mono text-[13px]">{duration}</span>
                      </>
                    )}
                    <span className="mx-1.5 text-mute">·</span>
                    <span className="font-mono text-[13px]">{userTurns}</span> exchange
                    {userTurns === 1 ? '' : 's'}
                  </p>
                  {when && (
                    <p className="sm:hidden mt-1 font-mono text-[12px] uppercase tracking-[0.12em] text-mute">
                      {when}
                    </p>
                  )}
                </div>
                <span className="hidden sm:block font-mono text-[12px] uppercase tracking-[0.12em] text-mute shrink-0">
                  {when}
                </span>
                <ArrowIcon className="w-5 h-5 shrink-0 text-mute group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<Spinner label="Loading your history…" />}>
      <HistoryPageInner />
    </Suspense>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-rule rounded-ui bg-surface py-20 px-6 text-center">
      <div className="w-14 h-14 mx-auto mb-5 rounded-ui bg-surface-2 text-brand flex items-center justify-center">
        <ScenarioIcon iconKey="academic" className="w-7 h-7" />
      </div>
      <h2
        className="text-ink font-extrabold tracking-[-0.03em] mb-2"
        style={{ fontSize: 'clamp(1.5rem, 2.5vw, 2rem)' }}
      >
        No conversations yet.
      </h2>
      <p className="text-ink-soft max-w-sm mx-auto mb-8">
        Your practice sessions will show up here once you finish one. Start your first
        conversation to see it saved.
      </p>
      <Link href="/dashboard" className={primaryButtonCls}>
        Start a conversation →
      </Link>
    </div>
  );
}

function ConversationDetail({
  record,
  scenariosMap,
  onBack,
}: {
  record: ConversationRecord;
  scenariosMap: Map<string, StoredScenario>;
  onBack: () => void;
}) {
  const scenario = record.scenarioId ? scenariosMap.get(record.scenarioId) : undefined;
  const language = record.languageCode ? getLanguage(record.languageCode) : undefined;
  const duration = formatDuration(record.startedAt, record.endedAt);
  const startDate = record.startedAt?.toDate?.();

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink transition-colors mb-8"
      >
        ← Back to history
      </button>

      {/* Detail header */}
      <div className="flex items-start gap-4 sm:gap-5 mb-10 pb-8 border-b border-rule">
        <div className="w-14 h-14 rounded-ui bg-surface-2 text-brand flex items-center justify-center shrink-0">
          <ScenarioIcon iconKey={iconKeyFor(record.scenarioId, scenario)} className="w-7 h-7" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`${eyebrowCls} mb-1`}>
            {startDate?.toLocaleDateString([], {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
            {startDate &&
              ` · ${startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
          </p>
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-[-0.03em] mb-2">
            {record.scenarioTitle}
          </h1>
          <p className="text-ink-soft">
            <span className="font-semibold text-ink">
              {language?.nativeName ?? record.languageName}
            </span>
            <span className="mx-2 text-mute">·</span>
            {record.difficulty.charAt(0).toUpperCase() + record.difficulty.slice(1)} pace
            {duration && (
              <>
                <span className="mx-2 text-mute">·</span>
                <span className="font-mono text-[14px]">{duration}</span>
              </>
            )}
            <span className="mx-2 text-mute">·</span>
            <span className="font-mono text-[14px]">{record.messages.length}</span> turns
          </p>
        </div>
      </div>

      {/* Transcript */}
      <div className="space-y-5 max-w-3xl mx-auto pb-12">
        {record.messages.map((msg, i) => {
          const isUser = msg.role === 'user';
          const prev = record.messages[i - 1];
          const showLabel = !prev || prev.role !== msg.role;
          return (
            <div
              key={i}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              {showLabel && (
                <p
                  className={`font-mono text-[11px] uppercase tracking-[0.16em] text-mute mb-1.5 ${
                    isUser ? 'pr-1' : 'pl-1'
                  }`}
                >
                  {isUser ? 'You' : 'Partner · Aoede'}
                </p>
              )}
              <div
                className={`max-w-[82%] px-4 py-3 text-[15px] leading-relaxed rounded-ui ${
                  isUser
                    ? 'bg-brand text-white'
                    : 'bg-surface border border-rule text-ink'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Practice again CTA */}
      {record.scenarioId && record.languageCode && (
        <div className="max-w-3xl mx-auto pt-8 border-t border-rule">
          <Link
            href={`/session/${record.scenarioId}?lang=${record.languageCode}&difficulty=${record.difficulty}`}
            className={primaryButtonCls}
          >
            Practice this again →
          </Link>
        </div>
      )}
    </div>
  );
}
