'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PageSpinner } from '@/components/PageSpinner';

// Shared shell for every /dashboard/* route: auth protection (mirror of
// login/register's redirect logic, but inverted - here we redirect AWAY
// from the dashboard if there's no valid session, rather than away from
// the login form if there IS one) plus a consistent header. Keeps this
// logic in one place instead of duplicated across every dashboard
// sub-page (list, add, per-medication detail, interactions).
//
// Nav links use real <Link>/<nav> elements, not buttons - these are
// genuine page navigations, and a "current page" state (aria-current)
// gives keyboard/screen-reader users the same "you are here" signal
// sighted users get from the underline.
const NAV_LINKS = [
  { href: '/dashboard', label: 'My medications' },
  { href: '/dashboard/interactions', label: 'Check interactions' }
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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
      <header className="border-b border-border px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-foreground">MedTrack</p>
            <p className="text-xs text-muted">Hi, {user.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              className="min-h-11 rounded-lg border border-control-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>

        <nav className="mt-3 flex flex-wrap gap-2" aria-label="Dashboard">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-solid text-white'
                    : 'border border-control-border bg-surface text-foreground hover:bg-surface-hover'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
