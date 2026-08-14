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
import { validateEmail, allValid } from '@/lib/validation';

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailError = validateEmail(email);
  // Login intentionally does NOT enforce the 8-char minimum the way
  // register does - an existing user's password predates that rule and
  // must still be able to log in. Only "is something typed" matters here.
  const loginPasswordError = password ? null : 'Password is required';
  const isFormValid = useMemo(
    () => allValid(emailError, loginPasswordError),
    [emailError, loginPasswordError]
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
      await login(email, password);
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
            <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
            <p className="mt-2 text-sm text-muted">Sign in to manage your medications</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
              error={loginPasswordError}
              renderInput={(fieldProps) => (
                <PasswordInput
                  {...fieldProps}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              )}
            />

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
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-medium text-accent hover:text-accent-hover">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
