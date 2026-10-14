'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import { Wordmark } from '@/components/layout/Wordmark';

export function AppHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    user.getIdTokenResult().then((res) => setIsAdmin(res.claims.admin === true));
  }, [user]);

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  const navLink = (href: string, label: string) => {
    const active =
      pathname === href ||
      (href === '/dashboard' && pathname.startsWith('/language')) ||
      (href === '/dashboard' && pathname.startsWith('/session')) ||
      (href === '/admin/scenarios' && pathname.startsWith('/admin'));
    return (
      <Link
        href={href}
        prefetch
        aria-current={active ? 'page' : undefined}
        className={`text-[15px] font-semibold px-3 py-1.5 rounded-ui transition-colors ${
          active
            ? 'bg-brand text-accent'
            : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
        }`}
      >
        {label}
      </Link>
    );
  };

  const email = user?.email ?? '';
  const initial = email.charAt(0).toUpperCase() || '·';

  return (
    <header className="sticky top-0 z-20 bg-page border-b border-rule">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 md:px-10 h-16 flex items-center justify-between gap-3">
        <Link href="/dashboard" prefetch className="rounded-ui" aria-label="Verba home">
          <Wordmark />
        </Link>

        <nav className="flex items-center gap-1">
          {navLink('/dashboard', 'Languages')}
          {navLink('/history', 'History')}
          {isAdmin && navLink('/admin/scenarios', 'Admin')}

          {user && (
            <div className="ml-2 sm:ml-3 flex items-center gap-2 pl-2 sm:pl-3 border-l border-rule">
              <div
                className="hidden sm:flex w-8 h-8 rounded-ui bg-surface-2 text-ink-soft items-center justify-center font-mono text-[13px] font-semibold"
                title={email}
              >
                {initial}
              </div>
              <button
                onClick={handleLogout}
                className="text-[14px] text-mute hover:text-ink hover:bg-surface-2 rounded-ui px-2 py-1.5 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
