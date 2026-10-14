import Link from 'next/link';
import type { ReactNode } from 'react';
import { languages } from '@/config/languages';
import { Wordmark } from '@/components/layout/Wordmark';

// Shared two-panel layout for /login and /signup: a brand-color panel on the
// left, the form on a white panel on the right. The panels stack on a phone,
// with the brand panel shortened to a header band.
export function AuthSplit({
  headline,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  headline: ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-page grid grid-cols-1 lg:grid-cols-2">
      <section className="bg-brand text-white flex flex-col px-6 py-8 sm:px-10 lg:px-14 lg:py-12">
        <Link href="/login" className="self-start rounded-ui" aria-label="Verba">
          <Wordmark tone="light" size="lg" />
        </Link>

        <div className="mt-10 lg:mt-0 lg:my-auto max-w-xl">
          <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-accent mb-4">
            Speaking practice
          </p>
          <h1
            className="font-extrabold tracking-[-0.045em] leading-[0.98] text-white"
            style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.25rem)' }}
          >
            {headline}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-[#e4e3f7] max-w-md">
            Have a live conversation in the language you&apos;re learning. Your partner listens,
            answers, and keeps it going.
          </p>
        </div>

        <p className="hidden sm:block mt-10 lg:mt-0 font-mono text-[12px] uppercase tracking-[0.18em] text-[#c3c0ea]">
          <span aria-hidden>{languages.map((l) => l.flag).join(' · ')}</span>
          <span className="sr-only">
            Languages: {languages.map((l) => l.name).join(', ')}
          </span>
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-14">
        <div className="w-full max-w-md">
          <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-mute mb-3">
            {eyebrow}
          </p>
          <h2 className="text-[34px] font-extrabold tracking-[-0.035em] leading-[1.05] text-ink">
            {title}
          </h2>
          <p className="mt-2 mb-8 text-ink-soft text-lg">{subtitle}</p>

          {children}

          {footer && (
            <p className="mt-8 text-[15px] text-ink-soft text-center">{footer}</p>
          )}
        </div>
      </section>
    </div>
  );
}
