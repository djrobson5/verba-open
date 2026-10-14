import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTokens } from 'next-firebase-auth-edge/next/tokens';
import { getAdminFirestore, getAdminAuth } from '@/lib/firebase/admin';
import { authConfig } from '@/lib/firebase/auth-config';

export const runtime = 'nodejs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pacificToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function pacificMonthStart(): string {
  return pacificToday().slice(0, 7) + '-01';
}

interface UsageDoc {
  realSessions?: number;
  tokenIssuances?: number;
  inputAudioTokens?: number;
  outputAudioTokens?: number;
  inputTextTokens?: number;
  outputTextTokens?: number;
  liveSeconds?: number;
  backendInputTokens?: number;
  backendCachedInputTokens?: number;
  backendCacheWriteTokens?: number;
  backendOutputTokens?: number;
  estimatedCostUsd?: number;
  geminiCostUsd?: number;
  openaiCostUsd?: number;
  openaiBackendCostUsd?: number;
  geminiUsageSessions?: number;
  openaiUsageSessions?: number;
}

/** Summable fields shared by the totals, per-user and per-day aggregates. */
interface Agg {
  estimatedCostUsd: number;
  geminiCostUsd: number;
  openaiCostUsd: number;
  /** Subset of openaiCostUsd. */
  openaiBackendCostUsd: number;
  /** Cost recorded before the provider split existed:
   *  estimatedCostUsd − gemini − openai, clamped ≥ 0, summed per doc. */
  unattributedCostUsd: number;
  sessions: number;
  geminiUsageSessions: number;
  openaiUsageSessions: number;
  inputAudioTokens: number;
  outputAudioTokens: number;
  inputTextTokens: number;
  outputTextTokens: number;
  liveSeconds: number;
  backendInputTokens: number;
  backendCachedInputTokens: number;
  backendCacheWriteTokens: number;
  backendOutputTokens: number;
}

interface UserAgg extends Agg {
  uid: string;
  email: string | null;
}

interface DayAgg extends Agg {
  date: string;
}

function emptyAgg(): Agg {
  return {
    estimatedCostUsd: 0,
    geminiCostUsd: 0,
    openaiCostUsd: 0,
    openaiBackendCostUsd: 0,
    unattributedCostUsd: 0,
    sessions: 0,
    geminiUsageSessions: 0,
    openaiUsageSessions: 0,
    inputAudioTokens: 0,
    outputAudioTokens: 0,
    inputTextTokens: 0,
    outputTextTokens: 0,
    liveSeconds: 0,
    backendInputTokens: 0,
    backendCachedInputTokens: 0,
    backendCacheWriteTokens: 0,
    backendOutputTokens: 0,
  };
}

function addDoc(agg: Agg, data: UsageDoc): void {
  const total = data.estimatedCostUsd ?? 0;
  const gemini = data.geminiCostUsd ?? 0;
  const openai = data.openaiCostUsd ?? 0;
  agg.estimatedCostUsd += total;
  agg.geminiCostUsd += gemini;
  agg.openaiCostUsd += openai;
  agg.openaiBackendCostUsd += data.openaiBackendCostUsd ?? 0;
  // Per doc, so a pre-split day can't be offset by a post-split one. The
  // epsilon swallows float drift between the separately-summed increments.
  const rest = total - gemini - openai;
  agg.unattributedCostUsd += rest > 1e-9 ? rest : 0;
  agg.sessions += data.realSessions ?? 0;
  agg.geminiUsageSessions += data.geminiUsageSessions ?? 0;
  agg.openaiUsageSessions += data.openaiUsageSessions ?? 0;
  agg.inputAudioTokens += data.inputAudioTokens ?? 0;
  agg.outputAudioTokens += data.outputAudioTokens ?? 0;
  agg.inputTextTokens += data.inputTextTokens ?? 0;
  agg.outputTextTokens += data.outputTextTokens ?? 0;
  agg.liveSeconds += data.liveSeconds ?? 0;
  agg.backendInputTokens += data.backendInputTokens ?? 0;
  agg.backendCachedInputTokens += data.backendCachedInputTokens ?? 0;
  agg.backendCacheWriteTokens += data.backendCacheWriteTokens ?? 0;
  agg.backendOutputTokens += data.backendOutputTokens ?? 0;
}

export async function GET(req: NextRequest) {
  try {
    const tokens = await getTokens(await cookies(), authConfig());
    if (!tokens) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (tokens.decodedToken.admin !== true) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const from = fromParam && DATE_RE.test(fromParam) ? fromParam : pacificMonthStart();
    const to = toParam && DATE_RE.test(toParam) ? toParam : pacificToday();
    const today = pacificToday();

    const db = getAdminFirestore();
    const snap = await db.collectionGroup('usage').get();

    const byUserMap = new Map<string, UserAgg>();
    const byDayMap = new Map<string, DayAgg>();
    const totals = emptyAgg();
    const todayAgg = emptyAgg();

    for (const doc of snap.docs) {
      const date = doc.id;
      if (!DATE_RE.test(date)) continue;
      if (date < from || date > to) continue;

      // Path: users/{uid}/usage/{date}
      const uid = doc.ref.parent.parent?.id;
      if (!uid) continue;

      const data = doc.data() as UsageDoc;
      addDoc(totals, data);
      if (date === today) addDoc(todayAgg, data);

      const userAgg = byUserMap.get(uid) ?? { uid, email: null, ...emptyAgg() };
      addDoc(userAgg, data);
      byUserMap.set(uid, userAgg);

      const dayAgg = byDayMap.get(date) ?? { date, ...emptyAgg() };
      addDoc(dayAgg, data);
      byDayMap.set(date, dayAgg);
    }

    // Resolve uid → email in batches of 100 (Auth API limit).
    const auth = getAdminAuth();
    const uids = [...byUserMap.keys()];
    for (let i = 0; i < uids.length; i += 100) {
      const slice = uids.slice(i, i + 100);
      const result = await auth.getUsers(slice.map((uid) => ({ uid })));
      for (const user of result.users) {
        const agg = byUserMap.get(user.uid);
        if (agg) agg.email = user.email ?? null;
      }
    }

    const byUser = [...byUserMap.values()].sort(
      (a, b) => b.estimatedCostUsd - a.estimatedCostUsd,
    );
    const byDay = [...byDayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      from,
      to,
      today,
      totals,
      // Kept for existing readers; `todayTotals` has the provider split.
      todayCost: todayAgg.estimatedCostUsd,
      todaySessions: todayAgg.sessions,
      todayTotals: todayAgg,
      byUser,
      byDay,
    });
  } catch (error) {
    console.error('admin/usage error:', error);
    return NextResponse.json({ error: 'Failed to load usage' }, { status: 500 });
  }
}
