import type { InteractionFinding } from '@/lib/types';

const SEVERITY_STYLES: Record<string, string> = {
  severe: 'border-red-500/30 bg-red-500/10 text-red-500',
  moderate: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  minor: 'border-border bg-surface text-foreground'
};

function SeverityBadge({ severity }: { severity: string }) {
  const styles = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.minor;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${styles}`}
    >
      {severity}
    </span>
  );
}

export function InteractionFindingCard({ finding }: { finding: InteractionFinding }) {
  if (finding.tier === 'curated') {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-foreground">
            {finding.medicationA} + {finding.medicationB}
          </h3>
          <SeverityBadge severity={finding.severity} />
        </div>

        <p className="text-sm text-foreground">{finding.description}</p>

        {finding.mechanism && (
          <div className="text-sm">
            <span className="font-medium text-foreground">Mechanism: </span>
            <span className="text-foreground/80">{finding.mechanism}</span>
          </div>
        )}

        {finding.recommendation && (
          <div className="text-sm">
            <span className="font-medium text-foreground">Recommendation: </span>
            <span className="text-foreground/80">{finding.recommendation}</span>
          </div>
        )}

        <p className="text-xs text-foreground/60">Source: {finding.sourceCitation}</p>
      </div>
    );
  }

  const isWarning = finding.tier === 'text-scan-warning';

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-foreground">
          {finding.medicationA} + {finding.medicationB}
        </h3>
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
            isWarning
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
              : 'border-border bg-surface text-foreground/70'
          }`}
        >
          {isWarning ? 'Possible interaction' : 'No significant interaction noted'}
        </span>
      </div>

      <p className="text-xs text-foreground/60">
        Automated text match against FDA label data — not clinically reviewed.
      </p>

      <blockquote className="border-l-2 border-border pl-3 text-sm italic text-foreground/80">
        &ldquo;{finding.excerpt}&rdquo;
      </blockquote>

      {finding.fullTextAvailable && finding.sourceUrl && (
        
          <a
            href={finding.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs font-medium text-accent hover:underline"
        >
          View full label text
        </a>
      )}
    </div>
  );
}
