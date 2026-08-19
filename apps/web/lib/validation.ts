// Mirrors apps/api's own Fastify schemas exactly - email format, password
// minLength 8, name minLength 1 (see apps/api/src/routes/auth.ts). Client-
// side validation here is a UX layer only (instant feedback, no round
// trip) - the server remains the actual source of truth and re-validates
// everything regardless. Keep in sync manually if the API schemas change.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  if (!value.trim()) return 'Email is required';
  if (!EMAIL_PATTERN.test(value)) return 'Enter a valid email address';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Password is required';
  if (value.length < 8) return 'Password must be at least 8 characters';
  return null;
}

export function validateName(value: string): string | null {
  if (!value.trim()) return 'Name is required';
  return null;
}

// Runs a set of {value, validator} pairs and returns true only if every
// field passes - used to gate submit-button enablement without needing
// a full form library.
export function allValid(...results: (string | null)[]): boolean {
  return results.every((r) => r === null);
}

// Mirrors apps/api's user-medications createSchema exactly (see
// apps/api/src/routes/user-medications.ts): dosageAmount must be a
// positive number, dosageUnit and frequency are freeform non-empty
// strings, reminderTimes must match HH:MM 24-hour format.
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateDosageAmount(value: string): string | null {
  if (!value.trim()) return 'Dosage amount is required';
  const num = Number(value);
  if (Number.isNaN(num) || num <= 0) return 'Enter a valid positive number';
  return null;
}

export function validateDosageUnit(value: string): string | null {
  if (!value.trim()) return 'Dosage unit is required';
  return null;
}

export function validateFrequency(value: string): string | null {
  if (!value.trim()) return 'Frequency is required';
  return null;
}

export function validateReminderTime(value: string): string | null {
  if (!value) return 'Time is required';
  if (!TIME_PATTERN.test(value)) return 'Enter a valid time';
  return null;
}

export function validateMedicationSelected(medicationId: string): string | null {
  if (!medicationId) return 'Select a medication from the search results';
  return null;
}
