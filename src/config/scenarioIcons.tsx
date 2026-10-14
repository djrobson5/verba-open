import type { ReactNode } from 'react';

// Line icons for scenarios. Every icon is drawn on a 24x24 viewBox with
// stroke="currentColor", so the icon takes its color from the surrounding
// text color. Scenarios pick one through the optional `iconKey` field; the
// older `icon` emoji field stays on the docs but is no longer rendered.

const ICONS = {
  chat: (
    <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
  ),
  coffee: (
    <>
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z" />
      <path d="M16 11h2a2 2 0 0 1 0 4h-2" />
      <path d="M8 3v3M12 3v3" />
    </>
  ),
  dining: (
    <>
      <path d="M5 3v5a2 2 0 0 0 4 0V3M7 10v11" />
      <path d="M17 3c-2 2-2.5 6 0 8v10" />
    </>
  ),
  directions: (
    <>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  plans: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="1" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  academic: (
    <>
      <path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z" />
      <path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.2A5 5 0 0 1 21 19" />
    </>
  ),
  shopping: (
    <>
      <path d="M5 8h14l-1 12H6L5 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  travel: (
    <>
      <rect x="4" y="7" width="16" height="13" rx="1" />
      <path d="M9 7V4h6v3M4 12h16" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="1.5" />
      <path d="M11 18h2" />
    </>
  ),
  home: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 9.5V20h12V9.5M10 20v-5h4v5" />
    </>
  ),
  health: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  work: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="1" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type ScenarioIconKey = keyof typeof ICONS;

export const DEFAULT_SCENARIO_ICON_KEY: ScenarioIconKey = 'chat';

// Every valid key, in a stable order (for the admin editor's picker).
export const SCENARIO_ICON_KEYS = Object.keys(ICONS) as ScenarioIconKey[];

export function isScenarioIconKey(value: unknown): value is ScenarioIconKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ICONS, value);
}

// Defaults for the scenarios that predate iconKey, so they get the right icon
// without a Firestore write.
const ICON_KEY_BY_SCENARIO_ID: Record<string, ScenarioIconKey> = {
  'ordering-coffee': 'coffee',
  'restaurant-dining': 'dining',
  'asking-directions': 'directions',
  'inviting-friend': 'plans',
  'academic-interests': 'academic',
  'coffee-hour': 'people',
};

// Last-resort mapping from the legacy emoji field. Variation selectors
// (U+FE0F) are stripped before lookup, so "🗺️" and "🗺" both match.
const ICON_KEY_BY_EMOJI: Record<string, ScenarioIconKey> = {
  '☕': 'coffee',
  '🍵': 'coffee',
  '🍽': 'dining',
  '🍴': 'dining',
  '🍕': 'dining',
  '🗺': 'directions',
  '📍': 'directions',
  '🧭': 'directions',
  '🎉': 'plans',
  '📅': 'plans',
  '🗓': 'plans',
  '🎓': 'academic',
  '📚': 'academic',
  '📖': 'academic',
  '🌍': 'people',
  '🌎': 'people',
  '🌏': 'people',
  '👥': 'people',
  '🤝': 'people',
  '🛍': 'shopping',
  '🛒': 'shopping',
  '✈': 'travel',
  '🧳': 'travel',
  '🚆': 'travel',
  '📞': 'phone',
  '📱': 'phone',
  '🏠': 'home',
  '🏡': 'home',
  '🏥': 'health',
  '💊': 'health',
  '🩺': 'health',
  '💼': 'work',
  '💬': 'chat',
  '🗣': 'chat',
};

export function resolveScenarioIconKey(scenario: {
  id?: string;
  icon?: string;
  iconKey?: string;
}): ScenarioIconKey {
  if (isScenarioIconKey(scenario.iconKey)) return scenario.iconKey;
  if (scenario.id && ICON_KEY_BY_SCENARIO_ID[scenario.id]) {
    return ICON_KEY_BY_SCENARIO_ID[scenario.id];
  }
  if (scenario.icon) {
    const emoji = scenario.icon.replace(/️/g, '').trim();
    const byEmoji = ICON_KEY_BY_EMOJI[emoji];
    if (byEmoji) return byEmoji;
  }
  return DEFAULT_SCENARIO_ICON_KEY;
}

export function ScenarioIcon({
  iconKey,
  className,
}: {
  iconKey: string | undefined;
  className?: string;
}) {
  const key = isScenarioIconKey(iconKey) ? iconKey : DEFAULT_SCENARIO_ICON_KEY;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {ICONS[key]}
    </svg>
  );
}
