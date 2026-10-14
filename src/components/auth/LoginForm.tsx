'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  authButtonCls,
  authErrorCls,
  authInputCls as inputCls,
  authLabelCls as labelCls,
} from '@/components/auth/authStyles';


export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, error, submitting } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const success = await login(email, password);
    if (success) router.push('/dashboard');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="login-email" className={labelCls}>
          Email
        </label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="login-password" className={labelCls}>
          Password
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          required
          autoComplete="current-password"
          className={inputCls}
        />
      </div>

      {error && (
        <div className={authErrorCls} role="alert">
          <span className="font-semibold text-bad">Sign-in failed.</span>{' '}
          <span className="text-ink-soft">{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className={authButtonCls}
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
