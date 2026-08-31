'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient, ApiError } from '@/lib/api-client';
import { PageSpinner } from '@/components/PageSpinner';
import { ConfirmButton } from '@/components/ConfirmButton';
import type { UserMedication, AdherenceSummary, DoseLog, DoseLogStatus } from '@/lib/types';

function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const ADHERENCE_WINDOWS = [7, 30, 90] as const;

export default function MedicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [medication, setMedication] = useState<UserMedication | null>(null);
  const [medicationError, setMedicationError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [adherence, setAdherence] = useState<AdherenceSummary | null>(null);
  const [adherenceDays, setAdherenceDays] = useState<7 | 30 | 90>(7);

  const [doseLogs, setDoseLogs] = useState<DoseLog[] | null>(null);

  const [logDate, setLogDate] = useState(getLocalDateString());
  const [logTime, setLogTime] = useState('');
  const [loggingStatus, setLoggingStatus] = useState<DoseLogStatus | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  const loadDoseLogs = useCallback(() => {
    apiClient.listDoseLogs(id).then((result) => setDoseLogs(result.doseLogs));
  }, [id]);

  useEffect(() => {
    apiClient
      .getUserMedication(id)
      .then((med) => {
        setMedication(med);
        setLogTime(med.reminderTimes[0] ?? '');
      })
      .catch((err) => {
        setMedicationError(err instanceof ApiError ? err.message : 'Could not load this medication.');
      });
    loadDoseLogs();
  }, [id, loadDoseLogs]);

  useEffect(() => {
    if (!medication) return;
    apiClient.getAdherenceSummary(id, adherenceDays).then(setAdherence);
  }, [id, medication, adherenceDays]);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await apiClient.deleteUserMedication(id);
      router.push('/dashboard');
    } catch {
      setIsDeleting(false);
    }
  }

  async function handleLogDose(status: DoseLogStatus) {
    setLogError(null);
    setLoggingStatus(status);
    try {
      await apiClient.createDoseLog({
        userMedicationId: id,
        scheduledDate: logDate,
        scheduledTime: logTime,
        status
      });
      loadDoseLogs();
      if (medication) {
        apiClient.getAdherenceSummary(id, adherenceDays).then(setAdherence);
      }
    } catch (err) {
      setLogError(
        err instanceof ApiError
          ? err.message
          : 'Could not log this dose. Please try again.'
      );
    } finally {
      setLoggingStatus(null);
    }
  }

  if (medicationError) {
    return (
      <div className="mx-auto max-w-lg">
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-500">
          {medicationError}
        </div>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-accent hover:text-accent-hover">
          ← Back to your medications
        </Link>
      </div>
    );
  }

  if (!medication) {
    return <PageSpinner label="Loading medication" />;
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{medication.medicationName}</h1>
          <p className="text-sm text-muted">{medication.medicationCategory}</p>
          <p className="mt-2 text-sm text-foreground">
            {medication.dosageAmount} {medication.dosageUnit} · {medication.frequency}
          </p>
          <p className="mt-1 text-xs text-muted">
            Reminders: {medication.reminderTimes.join(', ')}
          </p>
        </div>
        <ConfirmButton label="Delete" onConfirm={handleDelete} isLoading={isDeleting} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Adherence</h2>
          <div className="flex gap-1">
            {ADHERENCE_WINDOWS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setAdherenceDays(days)}
                className={`min-h-11 rounded-lg px-3 text-sm font-medium transition-colors cursor-pointer ${
                  adherenceDays === days
                    ? 'bg-accent-solid text-white'
                    : 'border border-control-border bg-surface text-foreground hover:bg-surface-hover'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        {adherence ? (
          adherence.totalSlots === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-sm text-muted">
                No adherence data yet. This window doesn&apos;t include any full days.
                Check back tomorrow, or try a longer window.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-3xl font-semibold text-foreground">
                {adherence.adherencePercentage === null ? 'N/A' : `${adherence.adherencePercentage}%`}
              </p>
              <p className="mt-1 text-sm text-muted">
                {adherence.takenSlots} of {adherence.totalSlots} doses taken · {adherence.startDate} to {adherence.endDate}
              </p>
            </div>
          )
        ) : (
          <p className="text-sm text-muted">Loading adherence…</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-foreground">Log a dose</h2>
        <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="log-date" className="mb-1.5 block text-sm font-medium text-foreground">
                Date
              </label>
              <input
                id="log-date"
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="log-time" className="mb-1.5 block text-sm font-medium text-foreground">
                Time
              </label>
              <select
                id="log-time"
                value={logTime}
                onChange={(e) => setLogTime(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {medication.reminderTimes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {logError && (
            <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-500">
              {logError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleLogDose('taken')}
              disabled={loggingStatus !== null}
              className="min-h-11 flex-1 rounded-lg bg-green-700 px-3 text-sm font-medium text-white transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {loggingStatus === 'taken' ? 'Logging…' : 'Taken'}
            </button>
            <button
              type="button"
              onClick={() => handleLogDose('missed')}
              disabled={loggingStatus !== null}
              className="min-h-11 flex-1 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {loggingStatus === 'missed' ? 'Logging…' : 'Missed'}
            </button>
            <button
              type="button"
              onClick={() => handleLogDose('skipped')}
              disabled={loggingStatus !== null}
              className="min-h-11 flex-1 rounded-lg border border-control-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {loggingStatus === 'skipped' ? 'Logging…' : 'Skipped'}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-foreground">Recent logs</h2>
        {doseLogs === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : doseLogs.length === 0 ? (
          <p className="text-sm text-muted">No doses logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {doseLogs.slice(0, 10).map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="text-foreground">
                  {log.scheduledDate} at {log.scheduledTime}
                </span>
                <span
                  className={
                    log.status === 'taken'
                      ? 'font-medium text-green-700 dark:text-green-500'
                      : log.status === 'missed'
                        ? 'font-medium text-red-700 dark:text-red-500'
                        : 'font-medium text-muted'
                  }
                >
                  {log.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
