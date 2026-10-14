import { Wordmark } from '@/components/layout/Wordmark';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-surface border border-rule rounded-ui p-8 text-center">
        <Wordmark className="mb-8" />
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-mute mb-3">
          No connection
        </p>
        <h1 className="text-[32px] font-extrabold tracking-[-0.035em] leading-tight text-ink">
          You&apos;re offline
        </h1>
        <p className="mt-3 text-ink-soft">
          Verba needs an internet connection for voice conversations. Reconnect and try again.
        </p>
      </div>
    </div>
  );
}
