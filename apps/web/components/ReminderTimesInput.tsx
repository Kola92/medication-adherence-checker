'use client';

import { validateReminderTime } from '@/lib/validation';

interface ReminderTimesInputProps {
  times: string[];
  onChange: (times: string[]) => void;
}

// Dynamic list of HH:MM inputs backing reminderTimes: string[] on
// user_medications - matches the API schema exactly (see
// apps/api/src/routes/user-medications.ts createSchema). Always keeps
// at least one row - a medication with zero reminder times isn't a
// valid state the form should be able to reach, so "remove" is disabled
// rather than hidden when only one row remains (hidden would look like
// the button vanished for no visible reason; disabled explains itself).
export function ReminderTimesInput({ times, onChange }: ReminderTimesInputProps) {
  function updateTime(index: number, value: string) {
    const next = [...times];
    next[index] = value;
    onChange(next);
  }

  function addTime() {
    onChange([...times, '']);
  }

  function removeTime(index: number) {
    onChange(times.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">Reminder times</label>
      <div className="space-y-2">
        {times.map((time, index) => {
          const error = validateReminderTime(time);
          return (
            <div key={index} className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => updateTime(index, e.target.value)}
                  aria-label={`Reminder time ${index + 1}`}
                  aria-invalid={Boolean(time && error)}
                  className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent aria-invalid:border-red-500"
                />
              </div>
              <button
                type="button"
                onClick={() => removeTime(index)}
                disabled={times.length === 1}
                aria-label={`Remove reminder time ${index + 1}`}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={addTime}
        className="mt-2 min-h-11 rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent cursor-pointer"
      >
        + Add another time
      </button>
    </div>
  );
}
