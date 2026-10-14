import { AppHeader } from '@/components/layout/AppHeader';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page text-ink">
      <AppHeader />
      <main className="mx-auto max-w-[1280px] px-6 md:px-10 py-10 md:py-14">{children}</main>
    </div>
  );
}
