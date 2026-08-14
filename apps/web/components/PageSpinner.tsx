// role="status" + aria-live="polite" means a screen reader announces
// "Loading" once when this mounts, rather than staying silent while the
// page appears frozen - the visual spinner alone communicates nothing to
// non-sighted users. motion-reduce:animate-none respects
// prefers-reduced-motion (configured in globals.css / tailwind defaults)
// for users who've asked the OS not to show spinning/motion effects.
export function PageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div
        role="status"
        aria-live="polite"
        className="h-6 w-6 animate-spin motion-reduce:animate-none rounded-full border-2 border-border border-t-accent"
      >
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}
