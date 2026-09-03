'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { PageSpinner } from '@/components/PageSpinner';

// The bare root route ("/") has no content of its own - it's purely a
// redirect target, sending a signed-in visitor straight to their
// dashboard and an anonymous one to /login. Without this, hitting the
// domain root directly (as any first-time visitor would) rendered
// Next.js's default create-next-app scaffold - a real gap that existed
// silently until someone actually loaded "/" instead of a specific
// route like /login or /dashboard/add.
export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      router.replace(user ? '/dashboard' : '/login');
    }
  }, [isLoading, user, router]);

  return <PageSpinner label="Loading MedTrack" />;
}
