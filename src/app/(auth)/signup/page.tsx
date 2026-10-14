import Link from 'next/link';
import { AuthSplit } from '@/components/auth/AuthSplit';
import { authButtonCls } from '@/components/auth/authStyles';

// Public signup is closed: Verba is invite-only (see src/config/access.ts).
// The route stays so old links land on an explanation instead of a 404.
export default function SignupPage() {
  return (
    <AuthSplit
      headline={
        <>
          Start <span className="text-accent">speaking</span> in minutes.
        </>
      }
      eyebrow="Invite only"
      title="Verba is invite-only right now."
      subtitle="If you've been invited, check your email for a link to set your password, then sign in."
    >
      <Link href="/login" className={`${authButtonCls} inline-flex items-center justify-center`}>
        Go to sign in
      </Link>
    </AuthSplit>
  );
}
