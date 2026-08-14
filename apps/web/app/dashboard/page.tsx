'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient, ApiError } from '@/lib/api-client';
import { PageSpinner } from '@/components/PageSpinner';
import type { UserMedication } from '@/lib/types';

export default function DashboardPage() {
  const [medications, setMedications] = useState<UserMedication[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .listUserMedications()
      .then((result) => {
        if (!cancelled) setMedications(result.userMedications);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load your medications.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (medications === null) {
    return <PageSpinner label="Loading your medications" />;
  }

  if (medications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
        <h2 className="text-lg font-semibold text-foreground">No medications yet</h2>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Add your first medication to start getting reminders and tracking adherence.
        </p>
        <Link
          href="/dashboard/add"
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Add a medication
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Your medications</h1>
        <Link
          href="/dashboard/add"
          className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Add medication
        </Link>
      </div>

      <ul className="space-y-3">
        {medications.map((med) => (
          <li key={med.id}>
            <Link
              href={`/dashboard/${med.id}`}
              className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
            >
              <p className="font-medium text-foreground">{med.medicationName}</p>
              <p className="mt-1 text-sm text-muted">
                {med.dosageAmount} {med.dosageUnit} — {med.frequency}
              </p>
              <p className="mt-1 text-xs text-muted">
                Reminders: {med.reminderTimes.join(', ')}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
