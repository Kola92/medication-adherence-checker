'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { PageSpinner } from '@/components/PageSpinner';
import { InteractionFindingCard } from '@/components/InteractionFindingCard';
import type { InteractionCheckResult, InteractionFinding, UserMedication } from '@/lib/types';

const SEVERITY_ORDER: Record<string, number> = { severe: 0, moderate: 1, minor: 2 };

function sortFindings(findings: InteractionFinding[]): InteractionFinding[] {
  const tierRank: Record<InteractionFinding['tier'], number> = {
    curated: 0,
    'text-scan-warning': 1,
    'text-scan-reassuring': 2
  };

  return [...findings].sort((a, b) => {
    const tierDiff = tierRank[a.tier] - tierRank[b.tier];
    if (tierDiff !== 0) return tierDiff;

    if (a.tier === 'curated' && b.tier === 'curated') {
      return (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    }

    return 0;
  });
}

export default function InteractionsPage() {
  const [medications, setMedications] = useState<UserMedication[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoadingMeds, setIsLoadingMeds] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [result, setResult] = useState<InteractionCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMedications() {
      try {
        const { userMedications } = await apiClient.listUserMedications();
        if (!cancelled) setMedications(userMedications);
      } catch {
        if (!cancelled) setLoadError('Could not load your medications. Try refreshing the page.');
      } finally {
        if (!cancelled) setIsLoadingMeds(false);
      }
    }

    loadMedications();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleSelected(medicationId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(medicationId)) {
        next.delete(medicationId);
      } else {
        next.add(medicationId);
      }
      return next;
    });
  }

  async function handleCheck() {
    setIsChecking(true);
    setCheckError(null);
    setResult(null);

    try {
      const data = await apiClient.checkInteractions(Array.from(selectedIds));
      setResult(data);
    } catch {
      setCheckError('Could not check interactions right now. Please try again.');
    } finally {
      setIsChecking(false);
    }
  }

  if (isLoadingMeds) {
    return <PageSpinner label="Loading your medications" />;
  }

  const sortedFindings = result ? sortFindings(result.findings) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Check interactions</h1>
        <p className="mt-1 text-sm text-foreground/70">
          Select two or more medications to check for known or possible interactions.
        </p>
      </div>

      <div
        role="alert"
        className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400"
      >
        This tool is not a substitute for professional medical advice. Always consult a doctor
        or pharmacist before making decisions about your medications.
      </div>

      {loadError && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {loadError}
        </div>
      )}

      {!loadError && medications.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-foreground/70">
          You don&apos;t have any saved medications yet.{' '}
          <Link href="/dashboard/add" className="font-medium text-accent hover:underline">
            Add a medication
          </Link>{' '}
          to check interactions.
        </div>
      )}

      {medications.length > 0 && (
        <fieldset className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <legend className="px-1 text-sm font-medium text-foreground">Your medications</legend>
          {medications.map((med) => (
            <label
              key={med.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(med.medicationId)}
                onChange={() => toggleSelected(med.medicationId)}
                className="h-5 w-5 accent-accent"
              />
              <span className="text-sm text-foreground">{med.medicationName}</span>
            </label>
          ))}
        </fieldset>
      )}

      <button
        type="button"
        onClick={handleCheck}
        disabled={selectedIds.size < 2 || isChecking}
        className="min-h-11 w-full rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        {isChecking
          ? 'Checking…'
          : selectedIds.size < 2
            ? 'Select at least 2 medications'
            : `Check ${selectedIds.size} medications`}
      </button>

      {checkError && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {checkError}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {result.findingsCount === 0 ? (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-600 dark:text-green-400">
              No known or possible interactions found among the {result.checkedMedicationCount}{' '}
              medications checked.
            </div>
          ) : (
            <>
              <p className="text-sm text-foreground/70">
                {result.findingsCount} finding{result.findingsCount === 1 ? '' : 's'} across{' '}
                {result.checkedMedicationCount} medications checked.
              </p>
              {sortedFindings.map((finding, index) => (
                <InteractionFindingCard key={index} finding={finding} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
