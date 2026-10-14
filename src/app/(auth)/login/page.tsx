import { Suspense } from 'react';
import { AuthSplit } from '@/components/auth/AuthSplit';
import { authCardCls } from '@/components/auth/authStyles';
import { LoginForm } from '@/components/auth/LoginForm';
import { LoginReasonBanner } from '@/components/auth/LoginReasonBanner';

export default function LoginPage() {
  return (
    <AuthSplit
      headline={
        <>
          Pick up <span className="text-accent">where you left off.</span>
        </>
      }
      eyebrow="Sign in"
      title="Welcome back"
      subtitle="Sign in to keep practicing."
    >
      <Suspense fallback={null}>
        <LoginReasonBanner />
      </Suspense>

      <div className={authCardCls}>
        <LoginForm />
      </div>
    </AuthSplit>
  );
}
