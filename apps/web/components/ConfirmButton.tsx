'use client';

import { useState } from 'react';

interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

// Two-step inline confirm instead of a native confirm() dialog (breaks
// visual consistency, blocks the whole page) or a full modal (overkill
// for a single destructive action). First click reveals "Are you sure?"
// with real Confirm/Cancel buttons in place - stays keyboard/screen-
// reader accessible without any extra ARIA wiring, since it's just
// normal buttons swapping in and out.
export function ConfirmButton({ label, confirmLabel = 'Are you sure?', onConfirm, isLoading }: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">{confirmLabel}</span>
        <button
          type="button"
          onClick={() => onConfirm()}
          disabled={isLoading}
          className="min-h-11 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
        >
          {isLoading ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isLoading}
          className="min-h-11 rounded-lg border border-control-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover cursor-pointer"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="min-h-11 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-sm font-medium text-red-700 dark:text-red-500 transition-colors hover:bg-red-500/20 cursor-pointer"
    >
      {label}
    </button>
  );
}
