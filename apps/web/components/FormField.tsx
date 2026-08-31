'use client';

import { InputHTMLAttributes, useId, useState } from 'react';

interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error: string | null;
  hint?: string;
  // Lets a field opt into a custom input renderer (e.g. PasswordInput's
  // eye-toggle wrapper) while still getting the shared label/error/hint
  // chrome around it - avoids duplicating that markup per input type.
  renderInput?: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
    onBlur: () => void;
  }) => React.ReactNode;
}

export function FormField({ label, error, hint, renderInput, onBlur, ...inputProps }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [touched, setTouched] = useState(false);

  // Only surface the error after the field has been touched (blurred) at
  // least once - showing "required" errors while someone is mid-keystroke
  // on their first character is noisy, not helpful.
  const showError = touched && error;
  const describedBy = [showError ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    setTouched(true);
    onBlur?.(e);
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      {renderInput ? (
        renderInput({
          id,
          'aria-invalid': Boolean(showError),
          'aria-describedby': describedBy,
          onBlur: () => setTouched(true)
        })
      ) : (
        <input
          {...inputProps}
          id={id}
          onBlur={handleBlur}
          aria-invalid={Boolean(showError)}
          aria-describedby={describedBy}
          className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent aria-invalid:border-red-500"
        />
      )}
      {hint && !showError && (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {showError && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
