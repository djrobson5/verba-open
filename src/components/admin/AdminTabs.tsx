'use client';

import Link from 'next/link';

const TABS = [
  { id: 'scenarios', label: 'Scenarios', href: '/admin/scenarios' },
  { id: 'usage', label: 'Usage', href: '/admin/usage' },
] as const;

export type AdminTabId = (typeof TABS)[number]['id'];

export function AdminTabs({ current }: { current: AdminTabId }) {
  return (
    <nav
      aria-label="Admin sections"
      className="mb-8 inline-flex items-center gap-1 rounded-ui bg-surface border border-rule p-1"
    >
      {TABS.map((tab) => {
        const active = tab.id === current;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`px-4 py-1.5 text-sm font-semibold rounded-[2px] transition-colors ${
              active
                ? 'bg-brand text-accent'
                : 'text-ink-soft hover:text-ink hover:bg-surface-2'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
