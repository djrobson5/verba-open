import Link from 'next/link';
import { languages } from '@/config/languages';
import { SessionsRemaining } from '@/components/SessionsRemaining';

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-10 md:mb-14">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-mute mb-3">
          Choose a language
        </p>
        <h1
          className="text-ink font-extrabold tracking-[-0.04em] leading-[1.02]"
          style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)' }}
        >
          What do you want to practice today?
        </h1>
        <p className="mt-4 text-ink-soft text-lg max-w-xl">
          Pick a language and jump into a live conversation. You can switch any time.
        </p>
        <SessionsRemaining />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {languages.map((lang) => (
          <Link
            key={lang.code}
            href={`/language/${lang.code}`}
            prefetch
            className="group hover-lift bg-surface border border-rule rounded-ui p-5 flex items-center gap-5"
          >
            <div className="w-12 h-12 rounded-ui bg-surface-2 text-ink-soft flex items-center justify-center font-mono text-[13px] font-semibold tracking-[0.08em] shrink-0">
              {lang.flag}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[25px] font-extrabold tracking-[-0.03em] leading-tight text-ink">
                {lang.nativeName}
              </p>
              <p className="text-[15px] text-mute mt-0.5">{lang.name}</p>
            </div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="w-5 h-5 shrink-0 text-mute group-hover:text-brand group-hover:translate-x-0.5 transition-all"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-[15px] text-mute">
        More languages coming. Tell us which you&apos;d like next.
      </p>
    </div>
  );
}
