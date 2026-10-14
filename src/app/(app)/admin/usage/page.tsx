'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/providers/AuthProvider';
import { AdminTabs } from '@/components/admin/AdminTabs';
import {
  OPENAI_PRICING_SOURCE_URL,
  PRICING_SOURCE_URL,
  PRICING_VERIFIED_DATE,
} from '@/config/pricing';

type AdminGate = 'checking' | 'allowed' | 'denied';

/** Mirrors the summable aggregate `/api/admin/usage` returns. */
interface Agg {
  estimatedCostUsd: number;
  geminiCostUsd: number;
  openaiCostUsd: number;
  openaiBackendCostUsd: number;
  unattributedCostUsd: number;
  sessions: number;
  geminiUsageSessions: number;
  openaiUsageSessions: number;
  inputAudioTokens: number;
  outputAudioTokens: number;
  liveSeconds: number;
  backendInputTokens: number;
  backendOutputTokens: number;
}

interface UserAgg extends Agg {
  uid: string;
  email: string | null;
}

interface DayAgg extends Agg {
  date: string;
}

interface UsageResponse {
  from: string;
  to: string;
  today: string;
  totals: Agg;
  todayCost: number;
  todaySessions: number;
  byUser: UserAgg[];
  byDay: DayAgg[];
}

/** Bar fills per cost bucket. The accent is a fill only, never text; its
 *  darker edge keeps it visible against the cream surface. */
const SEGMENTS = [
  { key: 'geminiCostUsd', label: 'Gemini', fill: 'bg-brand' },
  {
    key: 'openaiCostUsd',
    label: 'GPT-Live',
    fill: 'bg-accent shadow-[inset_0_0_0_1px_#d9a536]',
  },
  { key: 'unattributedCostUsd', label: 'Unattributed (before split)', fill: 'bg-rule' },
] as const;

function fmtMinutes(seconds: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(seconds / 60);
}

function fmtUsd(n: number): string {
  if (n < 0.01 && n > 0) return '<$0.01';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function shortDate(d: string): string {
  const [, m, day] = d.split('-');
  return `${parseInt(m, 10)}/${parseInt(day, 10)}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Current year/month in Pacific time, matching the API's date logic. */
function pacificYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  return { year, month };
}

/** "2026-06" → "June 2026" */
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

/** Months from January of the current year through the current month, newest first. */
function monthOptions(): string[] {
  const { year, month } = pacificYearMonth();
  const out: string[] = [];
  for (let m = month; m >= 1; m--) {
    out.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

/** Inclusive [from, to] date range covering a whole YYYY-MM month. */
function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map((s) => parseInt(s, 10));
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(lastDay).padStart(2, '0')}` };
}

export default function AdminUsagePage() {
  const { user, loading: authLoading } = useAuthContext();
  const router = useRouter();
  const [gate, setGate] = useState<AdminGate>('checking');
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const months = useMemo(() => monthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => months[0]);
  const isCurrentMonth = selectedMonth === months[0];

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
    if (gate === 'denied') router.replace('/dashboard');
  }, [gate, router]);

  useEffect(() => {
    if (gate !== 'allowed') return;
    let cancelled = false;
    setData(null);
    setError(null);
    const { from, to } = monthRange(selectedMonth);
    fetch(`/api/admin/usage?from=${from}&to=${to}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as UsageResponse;
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load usage:', err);
        setError(err instanceof Error ? err.message : 'Failed to load usage.');
      });
    return () => {
      cancelled = true;
    };
  }, [gate, selectedMonth]);

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
      <AdminTabs current="usage" />
      <div className="mb-10 md:mb-14 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-mute mb-3">
            Admin
          </p>
          <h1
            className="text-ink font-extrabold tracking-[-0.04em] leading-[1.02]"
            style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)' }}
          >
            Usage
          </h1>
          <p className="mt-4 text-ink-soft text-lg max-w-xl">
            Estimated voice API spend: Gemini from per-session token counts, GPT-Live from audio
            minutes plus its backend model&apos;s tokens, each × published rates.
          </p>
        </div>
        <label className="shrink-0">
          <span className="block font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-mute mb-2">
            Viewing
          </span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-12 bg-white border border-control-border rounded-ui px-4 text-sm font-medium text-ink cursor-pointer hover:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand transition-colors"
          >
            {months.map((ym) => (
              <option key={ym} value={ym}>
                {monthLabel(ym)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="mb-6 rounded-ui bg-white border border-bad/40 border-l-4 border-l-bad px-4 py-3 text-sm text-ink">
          <span className="font-semibold text-bad">Couldn&apos;t load.</span>{' '}
          <span className="text-ink-soft">{error}</span>
        </div>
      )}

      {data === null && !error ? (
        <div className="flex items-center gap-3 py-20 justify-center text-mute">
          <span className="w-5 h-5 rounded-full border-2 border-rule border-t-brand animate-spin" />
          <span className="text-sm font-medium">Loading usage…</span>
        </div>
      ) : data ? (
        <>
          {/* Top tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
            <Tile
              label={
                isCurrentMonth
                  ? `Month-to-date (${shortDate(data.from)}–${shortDate(data.to)})`
                  : `${monthLabel(selectedMonth)} total`
              }
              value={fmtUsd(data.totals.estimatedCostUsd)}
            />
            {isCurrentMonth && (
              <Tile
                label={`Today (${shortDate(data.today)})`}
                value={fmtUsd(data.todayCost)}
                highlight
              />
            )}
            <Tile
              label={isCurrentMonth ? 'Sessions this month' : 'Sessions'}
              value={fmtInt(data.totals.sessions)}
            />
          </div>

          {/* Provider split */}
          <section className="mb-12">
            <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-mute mb-4">
              By provider
            </p>
            <div
              className={`grid grid-cols-1 gap-4 ${
                data.totals.unattributedCostUsd > 0 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
              }`}
            >
              <Tile
                label="Gemini"
                swatch={SEGMENTS[0].fill}
                value={fmtUsd(data.totals.geminiCostUsd)}
                sub={`${fmtInt(data.totals.geminiUsageSessions)} session${
                  data.totals.geminiUsageSessions === 1 ? '' : 's'
                } with usage · ${fmtInt(
                  data.totals.inputAudioTokens + data.totals.outputAudioTokens,
                )} audio tokens`}
              />
              <Tile
                label="GPT-Live"
                swatch={SEGMENTS[1].fill}
                value={fmtUsd(data.totals.openaiCostUsd)}
                sub={`${fmtInt(data.totals.openaiUsageSessions)} session${
                  data.totals.openaiUsageSessions === 1 ? '' : 's'
                } with usage · ${fmtMinutes(data.totals.liveSeconds)} min · backend ${fmtUsd(
                  data.totals.openaiBackendCostUsd,
                )}`}
              />
              {data.totals.unattributedCostUsd > 0 && (
                <Tile
                  label="Unattributed (before split)"
                  swatch={SEGMENTS[2].fill}
                  value={fmtUsd(data.totals.unattributedCostUsd)}
                  sub="Recorded before cost was tracked per provider"
                />
              )}
            </div>
          </section>

          {/* Daily breakdown */}
          <section className="mb-12">
            <div className="flex items-baseline justify-between gap-4 flex-wrap mb-4">
              <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-mute">
                Daily breakdown
              </p>
              <Legend showUnattributed={data.totals.unattributedCostUsd > 0} />
            </div>
            {data.byDay.length === 0 ? (
              <div className="bg-surface border border-rule rounded-ui p-6 text-sm text-ink-soft">
                No sessions logged in this date range.
              </div>
            ) : (
              <DailyBars days={data.byDay} />
            )}
          </section>

          {/* Top users */}
          <section className="mb-12">
            <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-mute mb-4">
              Top users · {monthLabel(selectedMonth)}
            </p>
            {data.byUser.length === 0 ? (
              <div className="bg-surface border border-rule rounded-ui p-6 text-sm text-ink-soft">
                No usage yet.
              </div>
            ) : (
              <div className="bg-surface border border-rule rounded-ui overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-rule text-left">
                      <th scope="col" className={thCls}>User</th>
                      <th scope="col" className={`${thCls} text-right`}>Sessions</th>
                      <th scope="col" className={`${thCls} text-right`}>Gemini</th>
                      <th scope="col" className={`${thCls} text-right`}>GPT-Live</th>
                      <th scope="col" className={`${thCls} text-right`}>GPT-Live min</th>
                      {data.totals.unattributedCostUsd > 0 && (
                        <th scope="col" className={`${thCls} text-right`}>Unattributed</th>
                      )}
                      <th scope="col" className={`${thCls} text-right`}>Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byUser.slice(0, 10).map((u) => (
                      <tr key={u.uid} className="border-b border-rule-soft last:border-b-0">
                        <td className="px-4 py-3 font-medium text-ink max-w-[16rem] truncate">
                          {u.email ?? <span className="text-mute font-mono text-[13px]">{u.uid}</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[13px] text-ink-soft">
                          {fmtInt(u.sessions)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[13px] text-ink-soft">
                          {fmtUsd(u.geminiCostUsd)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[13px] text-ink-soft">
                          {fmtUsd(u.openaiCostUsd)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[13px] text-ink-soft">
                          {fmtMinutes(u.liveSeconds)}
                        </td>
                        {data.totals.unattributedCostUsd > 0 && (
                          <td className="px-4 py-3 text-right font-mono text-[13px] text-ink-soft">
                            {fmtUsd(u.unattributedCostUsd)}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right font-mono text-[13px] font-semibold text-ink">
                          {fmtUsd(u.estimatedCostUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-xs text-mute mt-12">
            Rates from{' '}
            <a
              href={PRICING_SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-ink-soft hover:text-ink"
            >
              ai.google.dev/gemini-api/docs/pricing
            </a>{' '}
            and{' '}
            <a
              href={OPENAI_PRICING_SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-ink-soft hover:text-ink"
            >
              developers.openai.com/api/docs/pricing
            </a>
            , last verified <span className="font-mono">{PRICING_VERIFIED_DATE}</span>. Estimates exclude sessions ended via tab close
            or refresh (those don&apos;t reach the server-side counter).
          </p>
        </>
      ) : null}
    </div>
  );
}

const thCls =
  'px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-mute whitespace-nowrap';

function Swatch({ fill }: { fill: string }) {
  return <span aria-hidden className={`inline-block w-2.5 h-2.5 rounded-[2px] shrink-0 ${fill}`} />;
}

function Legend({ showUnattributed }: { showUnattributed: boolean }) {
  return (
    <ul className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-ink-soft">
      {SEGMENTS.filter((s) => showUnattributed || s.key !== 'unattributedCostUsd').map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <Swatch fill={s.fill} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function Tile({
  label,
  value,
  sub,
  swatch,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: string;
  swatch?: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface border border-rule rounded-ui p-5">
      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-mute mb-2 flex items-center gap-2">
        {swatch && <Swatch fill={swatch} />}
        {label}
      </p>
      <p
        className={`font-mono font-semibold tracking-[-0.02em] text-ink ${
          highlight ? 'inline-block bg-accent-soft px-1.5 -mx-1.5 rounded-[2px]' : ''
        }`}
        style={{ fontSize: 'clamp(1.6rem, 3vw, 2.25rem)' }}
      >
        {value}
      </p>
      {sub && <p className="mt-2 text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}

function DailyBars({ days }: { days: DayAgg[] }) {
  const max = Math.max(...days.map((d) => d.estimatedCostUsd), 0.01);
  return (
    <div className="bg-surface border border-rule rounded-ui p-5 overflow-x-auto scrollbar-thin">
      <div className="min-w-[480px]">
        <div className="flex items-end gap-2 h-40 mb-2 border-b border-rule">
          {days.map((d) => {
            const heightPct = (d.estimatedCostUsd / max) * 100;
            const parts = SEGMENTS.map((s) => ({ ...s, usd: d[s.key] })).filter((s) => s.usd > 0);
            const partsSum = parts.reduce((sum, p) => sum + p.usd, 0);
            const title = [
              `${d.date}: ${fmtUsd(d.estimatedCostUsd)} · ${d.sessions} session${d.sessions === 1 ? '' : 's'}`,
              ...parts.map((p) => `${p.label} ${fmtUsd(p.usd)}`),
              ...(d.liveSeconds > 0 ? [`GPT-Live ${fmtMinutes(d.liveSeconds)} min`] : []),
            ].join('\n');
            return (
              <div
                key={d.date}
                className="flex-1 h-full flex flex-col items-center justify-end min-w-0"
                title={title}
              >
                {/* Stacked bottom-up: Gemini, GPT-Live, then unattributed. */}
                <div
                  className="w-full flex flex-col-reverse rounded-t-[2px] overflow-hidden hover:opacity-85 transition-opacity"
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                >
                  {parts.length === 0 ? (
                    <div className="flex-1 bg-rule" />
                  ) : (
                    parts.map((p) => (
                      <div
                        key={p.key}
                        className={`shrink-0 ${p.fill}`}
                        style={{ height: `${(p.usd / partsSum) * 100}%` }}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 font-mono text-[10px] text-mute">
          {days.map((d) => (
            <div key={d.date} className="flex-1 text-center min-w-0 truncate">
              {shortDate(d.date)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
