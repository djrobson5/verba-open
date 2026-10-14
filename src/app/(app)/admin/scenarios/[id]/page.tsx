'use client';

import { use, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuthContext } from '@/providers/AuthProvider';
import { fetchScenario, type StoredScenario } from '@/lib/scenarios/store';
import {
  DEFAULT_SCENARIO_ICON_KEY,
  SCENARIO_ICON_KEYS,
  ScenarioIcon,
  resolveScenarioIconKey,
  type ScenarioIconKey,
} from '@/config/scenarioIcons';

// The legacy `icon` emoji is required to be a string by the Firestore parser
// (isStoredScenario in src/lib/scenarios/store.ts), so a doc without one is
// skipped entirely. New docs get this neutral placeholder; existing docs keep
// whatever emoji they already have.
const LEGACY_ICON_PLACEHOLDER = '💬';

type AdminGate = 'checking' | 'allowed' | 'denied';

interface FormState {
  title: string;
  description: string;
  // Legacy emoji, carried from the loaded scenario but no longer edited.
  icon: string;
  iconKey: ScenarioIconKey;
  order: number;
  archived: boolean;
  prompts: { easy: string; medium: string; hard: string };
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  icon: '',
  iconKey: DEFAULT_SCENARIO_ICON_KEY,
  order: 100,
  archived: false,
  prompts: { easy: '', medium: '', hard: '' },
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function AdminScenarioEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const isNew = id === 'new';
  const { user, loading: authLoading } = useAuthContext();
  const router = useRouter();
  const [gate, setGate] = useState<AdminGate>('checking');
  const [form, setForm] = useState<FormState | null>(isNew ? EMPTY_FORM : null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iconButtonRefs = useRef<Partial<Record<ScenarioIconKey, HTMLButtonElement | null>>>({});

  // Arrow keys move the selection within the icon radiogroup (roving tabindex).
  function handleIconKeyDown(e: KeyboardEvent<HTMLButtonElement>, current: ScenarioIconKey) {
    if (!form) return;
    const idx = SCENARIO_ICON_KEYS.indexOf(current);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % SCENARIO_ICON_KEYS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (idx - 1 + SCENARIO_ICON_KEYS.length) % SCENARIO_ICON_KEYS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = SCENARIO_ICON_KEYS.length - 1;
    if (next === -1) return;
    e.preventDefault();
    const key = SCENARIO_ICON_KEYS[next];
    setForm({ ...form, iconKey: key });
    iconButtonRefs.current[key]?.focus();
  }

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
    if (gate !== 'allowed' || isNew) return;
    let cancelled = false;
    fetchScenario(id).then((s: StoredScenario | undefined) => {
      if (cancelled) return;
      if (!s) {
        setNotFound(true);
        return;
      }
      setForm({
        title: s.title,
        description: s.description,
        icon: s.icon,
        // Legacy docs without an iconKey start from the resolved key
        // (by scenario id, then by emoji), which is what users already see.
        iconKey: resolveScenarioIconKey(s),
        order: s.order,
        archived: s.archived,
        prompts: { ...s.prompts },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [gate, isNew, id]);

  async function handleSave() {
    if (!form || !user) return;
    setError(null);

    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (
      !form.prompts.easy.trim() ||
      !form.prompts.medium.trim() ||
      !form.prompts.hard.trim()
    ) {
      setError('All three difficulty prompts are required.');
      return;
    }

    setSaving(true);
    try {
      let docId = id;
      if (isNew) {
        docId = slugify(form.title);
        if (!docId) {
          setError('Title must contain at least one alphanumeric character.');
          setSaving(false);
          return;
        }
        const collision = await getDoc(doc(db, 'scenarios', docId));
        if (collision.exists()) {
          setError(`A scenario with id "${docId}" already exists. Choose a different title.`);
          setSaving(false);
          return;
        }
      }

      const ref = doc(db, 'scenarios', docId);

      // Only the fields this form edits. Saving an existing scenario merges,
      // so every field not listed here (createdAt, createdBy, the legacy
      // `icon` emoji, anything added later) is left untouched in Firestore.
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),
        iconKey: form.iconKey,
        order: form.order,
        archived: form.archived,
        prompts: {
          easy: form.prompts.easy.trim(),
          medium: form.prompts.medium.trim(),
          hard: form.prompts.hard.trim(),
        },
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };

      if (isNew) {
        payload.icon = LEGACY_ICON_PLACEHOLDER;
        payload.createdAt = serverTimestamp();
        payload.createdBy = user.uid;
      } else {
        // The editor can load a scenario from the TS fallback module when no
        // Firestore doc exists yet; this save then creates the doc. The parser
        // drops docs whose `icon` isn't a string, so supply one in that case
        // only. An existing doc's `icon` is never overwritten.
        const existing = await getDoc(ref);
        if (!existing.exists() || typeof existing.data().icon !== 'string') {
          payload.icon = form.icon.trim() || LEGACY_ICON_PLACEHOLDER;
        }
      }

      await setDoc(ref, payload, { merge: !isNew });

      router.push('/admin/scenarios');
    } catch (err) {
      console.error('Failed to save scenario:', err);
      setError(err instanceof Error ? err.message : 'Failed to save.');
      setSaving(false);
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

  if (notFound) {
    return (
      <div className="py-24 text-center">
        <p className="text-ink-soft">Scenario not found.</p>
        <Link
          href="/admin/scenarios"
          className="inline-block mt-3 text-brand hover:text-brand-deep hover:underline"
        >
          ← Back to scenarios
        </Link>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex items-center gap-3 py-32 justify-center text-mute">
        <span className="w-5 h-5 rounded-full border-2 border-rule border-t-brand animate-spin" />
        <span className="text-sm font-medium">Loading scenario…</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/scenarios"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink transition-colors mb-6"
      >
        ← Back to scenarios
      </Link>

      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-mute mb-3">
        {isNew ? 'New scenario' : `Editing · ${id}`}
      </p>
      <h1
        className="text-ink font-extrabold tracking-[-0.04em] leading-[1.02] mb-10"
        style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}
      >
        {isNew ? 'Create a scenario' : form.title || 'Untitled'}
      </h1>

      {error && (
        <div className="mb-6 rounded-ui bg-white border border-bad/40 border-l-4 border-l-bad px-4 py-3 text-sm text-ink">
          <span className="font-semibold text-bad">Couldn&apos;t save.</span>{' '}
          <span className="text-ink-soft">{error}</span>
        </div>
      )}

      <div className="space-y-6">
        <Field label="Title" htmlFor="scenario-title">
          <input
            id="scenario-title"
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={inputCls}
            placeholder="Ordering a Coffee"
          />
          {isNew && form.title && (
            <p className="text-xs text-mute mt-1.5 font-mono">
              ID will be: <span className="text-ink-soft">{slugify(form.title) || '(empty)'}</span>
            </p>
          )}
        </Field>

        <Field label="Description" htmlFor="scenario-description">
          <input
            id="scenario-description"
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={inputCls}
            placeholder="One-line preview shown on the scenario picker."
          />
        </Field>

        <div>
          <p id="scenario-icon-label" className={labelCls}>
            Icon
          </p>
          <div
            role="radiogroup"
            aria-labelledby="scenario-icon-label"
            className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-[repeat(13,minmax(0,1fr))] gap-2"
          >
            {SCENARIO_ICON_KEYS.map((key) => {
              const selected = form.iconKey === key;
              return (
                <button
                  key={key}
                  ref={(el) => {
                    iconButtonRefs.current[key] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={key}
                  title={key}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setForm({ ...form, iconKey: key })}
                  onKeyDown={(e) => handleIconKeyDown(e, key)}
                  className={`aspect-square rounded-ui border flex items-center justify-center transition-colors ${
                    selected
                      ? 'bg-brand border-brand text-accent'
                      : 'bg-surface border-rule text-ink-soft hover:border-brand hover:text-brand'
                  }`}
                >
                  <ScenarioIcon iconKey={key} className="w-6 h-6" />
                </button>
              );
            })}
          </div>
          <p className="text-xs text-mute mt-1.5">
            Selected: <span className="font-mono text-ink-soft">{form.iconKey}</span>
          </p>
        </div>

        <Field label="Order" htmlFor="scenario-order">
          <input
            id="scenario-order"
            type="number"
            value={form.order}
            onChange={(e) =>
              setForm({ ...form, order: Number.parseInt(e.target.value, 10) || 0 })
            }
            className={`${inputCls} font-mono max-w-[12rem]`}
          />
          <p className="text-xs text-mute mt-1.5">
            Lower numbers show first in the picker. Originals are 10/20/30/40.
          </p>
        </Field>

        <PromptField
          id="prompt-easy"
          label="Easy prompt"
          value={form.prompts.easy}
          onChange={(v) => setForm({ ...form, prompts: { ...form.prompts, easy: v } })}
        />
        <PromptField
          id="prompt-medium"
          label="Medium prompt"
          value={form.prompts.medium}
          onChange={(v) => setForm({ ...form, prompts: { ...form.prompts, medium: v } })}
        />
        <PromptField
          id="prompt-hard"
          label="Hard prompt"
          value={form.prompts.hard}
          onChange={(v) => setForm({ ...form, prompts: { ...form.prompts, hard: v } })}
        />

        <label className="flex items-center gap-3 bg-surface border border-rule rounded-ui px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.archived}
            onChange={(e) => setForm({ ...form, archived: e.target.checked })}
            className="w-4 h-4 accent-brand"
          />
          <div>
            <span className="text-sm text-ink font-semibold">Archived</span>
            <p className="text-xs text-ink-soft">
              Hidden from the picker but still resolves in history.
            </p>
          </div>
        </label>

        <div className="flex items-center gap-3 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 h-12 bg-brand text-white rounded-ui px-6 font-semibold hover:bg-brand-deep transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {saving ? 'Saving…' : isNew ? 'Create scenario' : 'Save changes'}
          </button>
          <Link
            href="/admin/scenarios"
            className="text-sm text-ink-soft hover:text-ink px-3 py-2 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}

const labelCls =
  'block font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-mute mb-2';

const inputCls =
  'w-full h-12 bg-white border border-control-border rounded-ui px-4 text-ink placeholder:text-mute focus:outline-2 focus:outline-offset-0 focus:outline-brand transition-colors';

const textareaCls =
  'w-full bg-white border border-control-border rounded-ui px-4 py-3 text-sm text-ink placeholder:text-mute focus:outline-2 focus:outline-offset-0 focus:outline-brand transition-colors min-h-[160px] resize-y leading-relaxed';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelCls}>
        {label}
      </label>
      {children}
    </div>
  );
}

function PromptField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={textareaCls}
      />
      <p className="text-xs text-mute mt-1.5">
        Use{' '}
        <code className="font-mono bg-surface-2 px-1 py-0.5 rounded-[2px] text-ink-soft">{'{{LANGUAGE}}'}</code>{' '}
        where the target language name should appear.
      </p>
    </Field>
  );
}
