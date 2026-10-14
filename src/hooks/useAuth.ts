'use client';

import { useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useAuthContext } from '@/providers/AuthProvider';

export function useAuth() {
  const { user, loading } = useAuthContext();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function login(email: string, password: string): Promise<boolean> {
    setError(null);
    setSubmitting(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await cred.user.getIdToken();
      await fetch('/api/login', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await signOut(auth);
    await fetch('/api/logout', { method: 'POST' });
  }

  return { user, loading, error, submitting, login, logout };
}
