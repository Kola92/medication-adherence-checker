'use client';

import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { ThemeToggle } from '@/components/ThemeToggle';
import { FormField } from '@/components/FormField';
import { PasswordInput } from '@/components/PasswordInput';
import { PageSpinner } from '@/components/PageSpinner';
import { validateEmail, validatePassword, validateName, allValid } from '@/lib/validation';

// Browser-native, matches the server's own validation source
// (Intl.supportedValuesOf('timeZone') in apps/api/src/services/auth.ts) -
// no drift between what the form offers and what the server accepts.
const TIMEZONES = Intl.supportedValuesOf('timeZone');
const DETECTED_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function RegisterPage() {
  const { user, isLoading, register } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState(DETECTED_TIMEZONE);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nameError = validateName(name);
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  const isFormValid = useMemo(
    () => allValid(nameError, emailError, passwordError),
    [nameError, emailError, passwordError]
  );

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard');
    }
  }, [isLoading, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await register(email, password, name, timezone);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || user) {
    return <PageSpinner label="Checking your session" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold text-foreground">Create your account</h1>
            <p className="mt-2 text-sm text-muted">Start tracking your medications</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <FormField
              label="Name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={nameError}
              placeholder="Jane Doe"
            />

            <FormField
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={emailError}
              placeholder="you@example.com"
            />

            <FormField
              label="Password"
              error={passwordError}
              renderInput={(fieldProps) => (
                <PasswordInput
                  {...fieldProps}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              )}
            />

            <div>
              <label htmlFor="timezone" className="mb-1.5 block text-sm font-medium text-foreground">
                Timezone
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                Detected automatically — used to schedule your medication reminders at the right local time.
              </p>
            </div>

            {error && (
              <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="w-full rounded-lg bg-accent px-4 py-2 font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
