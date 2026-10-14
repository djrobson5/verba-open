import Link from 'next/link';
import { notFound } from 'next/navigation';
import { languages, getLanguage } from '@/config/languages';
import { ScenarioList } from '@/components/scenario/ScenarioList';

export function generateStaticParams() {
  return languages.map((lang) => ({ langCode: lang.code }));
}

export default async function LanguagePage({
  params,
}: {
  params: Promise<{ langCode: string }>;
}) {
  const { langCode } = await params;
  const language = getLanguage(langCode);
  if (!language) notFound();

  return (
    <div>
      <Link
        href="/dashboard"
        prefetch
        className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-deep transition-colors mb-8"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
        >
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Back to languages
      </Link>

      <div className="mb-12 md:mb-14">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-mute mb-3">
          {language.flag} · {language.name}
        </p>
        <h1
          className="text-ink font-extrabold leading-[0.95] tracking-[-0.045em]"
          style={{ fontSize: 'clamp(64px, 9vw, 112px)' }}
        >
          {language.nativeName}
        </h1>
        <div aria-hidden className="mt-6 w-[72px] h-[6px] bg-accent" />
        <p className="mt-6 text-lg text-ink-soft max-w-xl">
          Pick a scenario and a difficulty. Your partner speaks only in {language.name}.
        </p>
      </div>

      <ScenarioList langCode={langCode} />
    </div>
  );
}
