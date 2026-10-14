'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { useSearchParams } from 'next/navigation';
import { auth } from '@/lib/firebase/client';
import { authErrorCls } from '@/components/auth/authStyles';

// When middleware refuses to mint a session (account has no admin/allowed claim)
// it bounces here with ?reason=not-allowed. The server cookie is already
// cleared; this also signs out the client SDK so the user lands in a clean
// logged-out state instead of a half-authed one.
export function LoginReasonBanner() {
  const searchParams = useSearchParams();
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const r = searchParams.get('reason');
    if (!r) return;
    setReason(r);
    if (r === 'not-allowed') {
      signOut(auth).catch(() => {});
    }
  }, [searchParams]);

  if (reason !== 'not-allowed') return null;

  return (
    <div className={`mb-6 ${authErrorCls}`} role="alert">
      <span className="font-semibold text-bad">This account hasn&apos;t been invited.</span>{' '}
      <span className="text-ink-soft">
        Verba is invite-only right now. If you think you should have access, ask
        your program administrator to invite you.
      </span>
    </div>
  );
}
