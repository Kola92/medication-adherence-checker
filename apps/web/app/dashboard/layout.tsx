'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PageSpinner } from '@/components/PageSpinner';

// Shared shell for every /dashboard/* route: auth protection (mirror of
// login/register's redirect logic, but inverted - here we redirect AWAY
// from the dashboard if there's no valid session, rather than away from
// the login form if there IS one) plus a consistent header. Keeps this
// logic in one place instead of duplicated across every dashboard
// sub-page (list, add, per-medication detail, interactions).
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return <PageSpinner label="Loading your dashboard" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div>
          <p className="font-semibold text-foreground">MedTrack</p>
          <p className="text-xs text-muted">Hi, {user.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={logout}
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
