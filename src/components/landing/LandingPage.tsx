// Stashed marketing landing page. Not routed during the prototype phase (/ redirects to /login).
// To restore it, render <LandingPage /> from src/app/page.tsx again in place of the redirect.

import Link from 'next/link';

const scenarios = [
  {
    id: 'ordering-coffee',
    title: 'Ordering a coffee',
    blurb: '"Un café con leche, por favor."',
    icon: '☕',
    bg: 'bg-marigold-soft',
    accent: 'text-marigold',
  },
  {
    id: 'restaurant-dining',
    title: 'Dining out',
    blurb: '"¿Qué me recomienda hoy?"',
    icon: '🍽️',
    bg: 'bg-coral-soft',
    accent: 'text-coral',
  },
  {
    id: 'asking-directions',
    title: 'Asking directions',
    blurb: '"¿Dónde está la estación?"',
    icon: '🗺️',
    bg: 'bg-sage-soft',
    accent: 'text-sage',
  },
  {
    id: 'inviting-friend',
    title: 'Making plans',
    blurb: '"¿Qué hacemos el sábado?"',
    icon: '🎉',
    bg: 'bg-plum-soft',
    accent: 'text-plum',
  },
];

const languages = [
  { code: 'ES', native: 'Español', color: 'text-coral' },
  { code: 'FR', native: 'Français', color: 'text-sky' },
  { code: 'JA', native: '日本語', color: 'text-plum' },
  { code: 'ZH', native: '中文', color: 'text-coral' },
  { code: 'DE', native: 'Deutsch', color: 'text-sage' },
  { code: 'IT', native: 'Italiano', color: 'text-marigold' },
  { code: 'KO', native: '한국어', color: 'text-sky' },
  { code: 'PT', native: 'Português', color: 'text-coral' },
  { code: 'HI', native: 'हिन्दी', color: 'text-marigold' },
  { code: 'AR', native: 'العربية', color: 'text-plum' },
  { code: 'TR', native: 'Türkçe', color: 'text-sage' },
  { code: 'EN', native: 'English', color: 'text-ink' },
];

const italicStyle = { fontFamily: 'var(--font-italic)', fontStyle: 'italic', fontWeight: 400 };

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-cream/75 border-b border-ink/10">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-ink tracking-tight group">
            <svg
              viewBox="0 0 140 130"
              className="w-7 h-7 text-ink group-hover:text-coral transition-colors"
              fill="currentColor"
              aria-hidden
            >
              <path d="M34.16,194.87l31,43.06,31.2-43.06h8.57L69.08,245.14V313H61.19V244.92l-35.71-50Z" transform="translate(-11.9 -189.42)" />
              <path d="M11.9,285.9v-51h7.89v44.05H97.34v7Z" transform="translate(-11.9 -189.42)" />
              <path d="M94.66,279.3a38.09,38.09,0,0,1,2.26-12.77,35.56,35.56,0,0,1,6.56-11.38A33.55,33.55,0,0,1,114.1,247a31.66,31.66,0,0,1,14.33-3.16,29.7,29.7,0,0,1,16.28,4.31,26.32,26.32,0,0,1,10,11.22l-5.52,3.41a21,21,0,0,0-4.15-5.91,23.25,23.25,0,0,0-5.26-3.91,22.18,22.18,0,0,0-5.81-2.15,27.59,27.59,0,0,0-5.91-.66,23.73,23.73,0,0,0-11.32,2.61,26.14,26.14,0,0,0-8.27,6.81,29.6,29.6,0,0,0-5.06,9.47,34.3,34.3,0,0,0-1.7,10.67,31.62,31.62,0,0,0,2,11.32,32.09,32.09,0,0,0,5.61,9.57,26.91,26.91,0,0,0,8.42,6.61,23.06,23.06,0,0,0,10.57,2.46,26.65,26.65,0,0,0,6.16-.75,24.21,24.21,0,0,0,6.11-2.41,25.56,25.56,0,0,0,5.46-4.11,21.21,21.21,0,0,0,4.21-6l5.81,3a21.87,21.87,0,0,1-4.81,7.06,31.61,31.61,0,0,1-6.91,5.16,34.86,34.86,0,0,1-8.07,3.21,33.55,33.55,0,0,1-8.37,1.1,28.41,28.41,0,0,1-13.42-3.21A35.14,35.14,0,0,1,104,304.4a38.64,38.64,0,0,1-6.86-11.73A37.78,37.78,0,0,1,94.66,279.3Z" transform="translate(-11.9 -189.42)" />
            </svg>
            <span className="flex items-baseline gap-1.5 text-2xl font-semibold">
              Verba
              <span className="w-2 h-2 rounded-full bg-coral translate-y-[-2px]" />
            </span>
          </Link>
          <nav className="flex items-center gap-1 md:gap-3 text-sm">
            <Link href="#educators" className="hidden md:inline text-ink-soft hover:text-ink px-3 py-2 transition-colors">
              For educators
            </Link>
            <Link href="/login" className="text-ink-soft hover:text-ink px-3 py-2 transition-colors">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="bg-ink text-cream rounded-full px-4 md:px-5 py-2 font-medium hover:bg-coral transition-colors"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-[1280px] mx-auto px-6 md:px-10 pt-12 md:pt-20 pb-16 md:pb-24">
        <div className="grid grid-cols-12 gap-6 md:gap-12 items-center">
          <div className="col-span-12 md:col-span-7">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-coral-soft text-coral text-xs font-semibold tracking-wide mb-6">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-coral animate-ping opacity-75" />
                <span className="relative w-1.5 h-1.5 rounded-full bg-coral" />
              </span>
              REAL-TIME VOICE · NO TYPING
            </div>
            <h1 className="text-ink tracking-[-0.035em] leading-[0.95] font-semibold" style={{ fontSize: 'clamp(2.75rem, 6.2vw, 5.5rem)' }}>
              <span className="text-coral" style={italicStyle}>Speak</span> Spanish
              <br />
              <span className="text-ink-soft/90 font-normal" style={{ fontSize: '0.68em' }}>
                (or any of 11 others)
              </span>
              <br />
              like you mean it.
            </h1>
            <p className="mt-7 text-ink-soft leading-relaxed max-w-xl text-lg md:text-xl">
              Hold real conversations with an AI partner. Practice ordering coffee, asking
              directions, making plans — all out loud, in real time.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 bg-coral text-cream rounded-full px-6 py-3.5 font-medium hover:bg-ink transition-colors shadow-[0_8px_24px_-8px_rgba(238,93,58,0.6)]"
              >
                Try a conversation
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <Link href="/login" className="text-ink hover:text-coral text-sm font-medium transition-colors">
                Sign in →
              </Link>
            </div>
            <p className="mt-6 text-sm text-ink-muted">
              Built by language educators
            </p>
          </div>

          {/* Hero visual */}
          <div className="col-span-12 md:col-span-5 relative mt-8 md:mt-0">
            <div className="relative bg-paper rounded-3xl border border-ink/10 shadow-[0_24px_60px_-24px_rgba(31,23,18,0.35)] p-6 md:p-7">
              <div className="flex items-center gap-3 pb-4 border-b border-ink/10">
                <div className="w-10 h-10 rounded-xl bg-marigold-soft text-marigold flex items-center justify-center text-xl">
                  ☕
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-ink-muted">Ordering a coffee · Spanish</p>
                  <p className="text-sm text-ink font-medium">Medium pace</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5 text-xs text-sage font-medium">
                  <span className="relative flex w-2 h-2">
                    <span className="absolute inset-0 rounded-full bg-sage animate-ping opacity-75" />
                    <span className="relative w-2 h-2 rounded-full bg-sage" />
                  </span>
                  Live
                </div>
              </div>

              <div className="space-y-3.5 py-5">
                <div className="flex justify-end">
                  <div className="bg-coral-soft text-ink rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%]">
                    <p className="text-sm">Hola, un café con leche, por favor.</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-ink-muted mb-1.5 ml-1 uppercase tracking-wider font-medium">
                    AI · Aoede
                  </p>
                  <div className="bg-cream-deep text-ink rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[90%]">
                    <p className="text-sm">¡Claro! ¿Grande o pequeño? ¿Le pongo azúcar?</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="bg-coral-soft text-ink rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%]">
                    <p className="text-sm">Grande, sin azúcar. Gracias.</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-ink/10 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-coral text-cream flex items-center justify-center shrink-0 shadow-[0_6px_18px_-6px_rgba(238,93,58,0.7)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
                    <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.93V20H8a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07A7 7 0 0019 11z" />
                  </svg>
                </div>
                <div className="flex-1 flex items-center gap-[3px] h-8">
                  {[4, 7, 5, 10, 6, 12, 8, 5, 11, 6, 4, 8, 5, 7, 4, 9, 5].map((h, i) => (
                    <span
                      key={i}
                      className="flex-1 bg-coral/55 rounded-full"
                      style={{ height: `${h * 2.5}px` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-ink-muted font-medium tabular-nums">0:42</span>
              </div>
            </div>

            {/* Floating language chips */}
            <div
              className="absolute -top-4 -right-3 bg-paper border border-ink/10 rounded-full pl-2 pr-4 py-1.5 shadow-lg text-sm font-medium chip-a flex items-center gap-1.5"
              style={{ ['--r' as string]: '6deg' }}
            >
              <span className="w-5 h-5 rounded-full bg-plum-soft text-plum text-[9px] font-bold flex items-center justify-center">JA</span>
              <span className="text-plum" style={italicStyle}>日本語</span>
            </div>
            <div
              className="absolute -bottom-5 -left-3 bg-paper border border-ink/10 rounded-full pl-2 pr-4 py-1.5 shadow-lg text-sm font-medium chip-b flex items-center gap-1.5"
              style={{ ['--r' as string]: '-4deg' }}
            >
              <span className="w-5 h-5 rounded-full bg-sky-soft text-sky text-[9px] font-bold flex items-center justify-center">FR</span>
              <span className="text-sky" style={italicStyle}>Français</span>
            </div>
          </div>
        </div>
      </section>

      {/* Scenarios */}
      <section className="max-w-[1280px] mx-auto px-6 md:px-10 py-16 md:py-20 border-t border-ink/10">
        <div className="mb-10 md:mb-12 max-w-3xl">
          <p className="text-xs text-coral font-semibold mb-3 uppercase tracking-wider">Scenarios</p>
          <h2 className="text-ink tracking-[-0.02em] leading-[1.05] font-semibold" style={{ fontSize: 'clamp(2rem, 4.2vw, 3.25rem)' }}>
            Everyday situations.{' '}
            <span className="text-ink-soft" style={italicStyle}>Three degrees of difficulty.</span>
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {scenarios.map((s) => (
            <div
              key={s.id}
              className={`${s.bg} rounded-3xl p-6 h-52 flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300 cursor-default relative overflow-hidden`}
            >
              <div className="text-4xl drop-shadow-sm">{s.icon}</div>
              <div>
                <p className={`text-[10px] ${s.accent} font-bold mb-1.5 uppercase tracking-[0.14em]`}>
                  {s.title}
                </p>
                <p className="text-ink leading-snug text-lg" style={italicStyle}>
                  {s.blurb}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-[1280px] mx-auto px-6 md:px-10 py-16 md:py-20 border-t border-ink/10">
        <p className="text-xs text-coral font-semibold mb-3 uppercase tracking-wider">How it works</p>
        <h2 className="text-ink tracking-[-0.02em] leading-[1.05] mb-12 md:mb-16 font-semibold max-w-4xl" style={{ fontSize: 'clamp(2rem, 4.2vw, 3.25rem)' }}>
          From <span style={italicStyle} className="text-sky">silent</span> to{' '}
          <span style={italicStyle} className="text-coral">speaking</span> in under a minute.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
          {[
            {
              n: '1',
              title: 'Pick a language',
              body: 'Spanish, Japanese, Arabic, Hindi — choose from twelve. Your AI partner speaks only in that language.',
              bg: 'bg-sky-soft',
              fg: 'text-sky',
            },
            {
              n: '2',
              title: 'Choose a scenario + level',
              body: 'Coffee, dining, directions, or plans with a friend. Easy, medium, or native pace — switch any time.',
              bg: 'bg-marigold-soft',
              fg: 'text-marigold',
            },
            {
              n: '3',
              title: 'Start talking',
              body: 'Tap the mic and speak. Your AI partner listens, responds, and gently corrects — all in real time.',
              bg: 'bg-coral-soft',
              fg: 'text-coral',
            },
          ].map((step) => (
            <div key={step.n}>
              <div className={`w-12 h-12 rounded-2xl ${step.bg} ${step.fg} flex items-center justify-center text-xl font-bold mb-5`}>
                {step.n}
              </div>
              <h3 className="text-xl mb-2 text-ink font-semibold">{step.title}</h3>
              <p className="text-ink-soft leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Languages */}
      <section className="max-w-[1280px] mx-auto px-6 md:px-10 py-16 md:py-20 border-t border-ink/10">
        <p className="text-xs text-coral font-semibold mb-3 uppercase tracking-wider">Languages</p>
        <h2 className="text-ink tracking-[-0.02em] leading-[1.05] mb-10 font-semibold" style={{ fontSize: 'clamp(2rem, 4.2vw, 3.25rem)' }}>
          Twelve tongues, one tap away.{' '}
          <span className="text-ink-soft" style={italicStyle}>More on the way.</span>
        </h2>
        <div className="flex flex-wrap gap-2.5">
          {languages.map((lang) => (
            <div
              key={lang.code}
              className="group border border-ink/10 bg-paper rounded-full pl-1.5 pr-5 py-1.5 flex items-center gap-2.5 hover:border-ink/30 hover:bg-cream-deep transition-colors"
            >
              <span className="w-7 h-7 rounded-full bg-cream-deep flex items-center justify-center text-[10px] font-bold text-ink-soft tracking-wider group-hover:bg-paper transition-colors">
                {lang.code}
              </span>
              <span className={`text-base ${lang.color} font-medium`} style={italicStyle}>
                {lang.native}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* For educators */}
      <section id="educators" className="max-w-[1280px] mx-auto px-6 md:px-10 py-12 md:py-16">
        <div className="relative rounded-[2rem] bg-ink text-cream px-8 md:px-14 py-12 md:py-16 overflow-hidden">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-coral/25 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-20 w-80 h-80 rounded-full bg-plum/25 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col md:flex-row items-start md:items-center gap-8">
            <div className="flex-1 max-w-2xl">
              <p className="text-xs text-coral font-semibold mb-3 uppercase tracking-wider">For educators</p>
              <h3 className="text-3xl md:text-4xl leading-[1.1] mb-4 font-semibold tracking-[-0.01em]">
                Measurable speaking practice,{' '}
                <span className="text-cream/80" style={italicStyle}>without grading a hundred recordings.</span>
              </h3>
              <p className="text-cream/70 text-base md:text-lg leading-relaxed">
                Cohort dashboards, session history, per-student progress, and SSO. Designed with
                language faculty for programs that actually measure output — not just input.
              </p>
            </div>
            <div className="shrink-0 flex flex-col gap-2">
              <Link
                href="/signup"
                className="bg-coral text-cream rounded-full px-6 py-3 font-medium hover:bg-cream hover:text-ink transition-colors inline-flex items-center gap-2"
              >
                Start a pilot →
              </Link>
              <span className="text-xs text-cream/50 text-center">No payment required</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-[1280px] mx-auto px-6 md:px-10 py-10 border-t border-ink/10">
        <div className="flex flex-col md:flex-row items-baseline justify-between gap-4 text-sm text-ink-muted">
          <span className="flex items-baseline gap-1.5 text-ink font-semibold">
            Verba
            <span className="w-1.5 h-1.5 rounded-full bg-coral" />
          </span>
          <span>Voice by Gemini Live</span>
        </div>
      </footer>
    </div>
  );
}
