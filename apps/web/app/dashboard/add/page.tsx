'use client';

import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api-client';
import { FormField } from '@/components/FormField';
import { ReminderTimesInput } from '@/components/ReminderTimesInput';
import {
  validateDosageAmount,
  validateDosageUnit,
  validateFrequency,
  validateReminderTime,
  validateMedicationSelected,
  allValid
} from '@/lib/validation';
import type { Medication } from '@/lib/types';

const DOSAGE_UNIT_SUGGESTIONS = ['mg', 'ml', 'mcg', 'IU', 'tablet', 'capsule'];
const FREQUENCY_SUGGESTIONS = ['Once daily', 'Twice daily', 'Three times daily', 'Every 8 hours', 'As needed'];

export default function AddMedicationPage() {
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Medication[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);

  const [dosageAmount, setDosageAmount] = useState('');
  const [dosageUnit, setDosageUnit] = useState('');
  const [frequency, setFrequency] = useState('');
  const [reminderTimes, setReminderTimes] = useState<string[]>(['']);
  const [startedAt, setStartedAt] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debounced live search - waits 300ms after the user stops typing
  // before hitting the API, rather than firing a request on every
  // keystroke. Cancelled/superseded correctly if the term changes again
  // before the timer fires.
  useEffect(() => {
    if (selectedMedication) return; // don't re-search once a pick is made
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      apiClient
        .searchMedications(searchTerm)
        .then((result) => setSearchResults(result.medications))
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, selectedMedication]);

  const medicationError = validateMedicationSelected(selectedMedication?.id ?? '');
  const dosageAmountError = validateDosageAmount(dosageAmount);
  const dosageUnitError = validateDosageUnit(dosageUnit);
  const frequencyError = validateFrequency(frequency);
  const reminderTimesValid = reminderTimes.every((t) => validateReminderTime(t) === null);

  const isFormValid = useMemo(
    () =>
      allValid(medicationError, dosageAmountError, dosageUnitError, frequencyError) &&
      reminderTimesValid,
    [medicationError, dosageAmountError, dosageUnitError, frequencyError, reminderTimesValid]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedMedication) return;
    setIsSubmitting(true);

    try {
      await apiClient.createUserMedication({
        medicationId: selectedMedication.id,
        dosageAmount: Number(dosageAmount),
        dosageUnit,
        frequency,
        reminderTimes,
        startedAt: startedAt || undefined
      });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-semibold text-foreground">Add a medication</h1>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="medication-search" className="mb-1.5 block text-sm font-medium text-foreground">
            Medication
          </label>

          {selectedMedication ? (
            <div className="flex items-center justify-between rounded-lg border border-accent bg-surface px-3 py-2">
              <div>
                <p className="font-medium text-foreground">{selectedMedication.name}</p>
                <p className="text-xs text-muted">{selectedMedication.category}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedMedication(null);
                  setSearchTerm('');
                }}
                className="min-h-11 rounded-lg px-3 text-sm font-medium text-accent hover:text-accent-hover cursor-pointer"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                id="medication-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search medications…"
                className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {isSearching && <p className="mt-1 text-xs text-muted">Searching…</p>}
              {!isSearching && searchResults.length > 0 && (
                <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border">
                  {searchResults.map((med) => (
                    <li key={med.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMedication(med);
                          setSearchResults([]);
                        }}
                        className="flex min-h-11 w-full flex-col items-start justify-center bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                      >
                        <span className="font-medium text-foreground">{med.name}</span>
                        <span className="text-xs text-muted">{med.category}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!isSearching && searchTerm.trim() && searchResults.length === 0 && (
                <p className="mt-1 text-xs text-muted">No medications found.</p>
              )}
            </>
          )}
        </div>

        <FormField
          label="Dosage amount"
          type="number"
          inputMode="decimal"
          step="any"
          value={dosageAmount}
          onChange={(e) => setDosageAmount(e.target.value)}
          error={dosageAmountError}
          placeholder="e.g. 500"
        />

        <FormField
          label="Dosage unit"
          type="text"
          list="dosage-unit-suggestions"
          value={dosageUnit}
          onChange={(e) => setDosageUnit(e.target.value)}
          error={dosageUnitError}
          placeholder="e.g. mg"
        />
        <datalist id="dosage-unit-suggestions">
          {DOSAGE_UNIT_SUGGESTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>

        <FormField
          label="Frequency"
          type="text"
          list="frequency-suggestions"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          error={frequencyError}
          placeholder="e.g. Twice daily"
        />
        <datalist id="frequency-suggestions">
          {FREQUENCY_SUGGESTIONS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>

        <ReminderTimesInput times={reminderTimes} onChange={setReminderTimes} />

        <FormField
          label="Started on"
          type="date"
          value={startedAt}
          onChange={(e) => setStartedAt(e.target.value)}
          error={null}
          hint="Optional — defaults to today if left blank."
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
          {isSubmitting ? 'Adding…' : 'Add medication'}
        </button>
      </form>
    </div>
  );
}
