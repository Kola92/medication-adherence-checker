import { pool } from '../db';

interface CuratedFinding {
  tier: 'curated';
  medicationA: string;
  medicationB: string;
  severity: string;
  description: string;
  mechanism: string | null;
  recommendation: string | null;
  sourceCitation: string;
}

interface TextScanFinding {
  tier: 'text-scan-warning' | 'text-scan-reassuring';
  medicationA: string;
  medicationB: string;
  excerpt: string;
  fullTextAvailable: boolean;
  sourceUrl: string | null;
}

export type InteractionFinding = CuratedFinding | TextScanFinding;

interface MedicationRow {
  id: string;
  name: string;
  interaction_notes: string | null;
  source_url: string | null;
}

const EXCERPT_RADIUS = 150;

// Phrases FDA labels commonly use to indicate NO clinically significant
// interaction was found — presence of these near a drug mention means the
// match is likely reassuring, not a warning. Not exhaustive NLP, just the
// most common patterns, applied narrowly and still labeled transparently.
const NEGATIVE_PATTERNS = [
  'without evidence of clinically significant',
  'without evidence of any',
  'no clinically significant',
  'no clinically meaningful',
  'no meaningful clinically important',
  'not expected to interact',
  'no significant interaction',
  'no dose adjustment is necessary',
  'no dose adjustment necessary'
];

function classifyExcerpt(excerpt: string): 'text-scan-warning' | 'text-scan-reassuring' {
  const lower = excerpt.toLowerCase();
  const isReassuring = NEGATIVE_PATTERNS.some((pattern) => lower.includes(pattern));
  return isReassuring ? 'text-scan-reassuring' : 'text-scan-warning';
}

function extractExcerpt(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - EXCERPT_RADIUS);
  const end = Math.min(text.length, matchIndex + matchLength + EXCERPT_RADIUS);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return prefix + text.slice(start, end).trim() + suffix;
}

export async function checkInteractions(medicationIds: string[]): Promise<InteractionFinding[]> {
  if (medicationIds.length < 2) {
    return [];
  }

  const medsResult = await pool.query<MedicationRow>(
    `SELECT id, name, interaction_notes, source_url FROM medications WHERE id = ANY($1)`,
    [medicationIds]
  );

  const meds = medsResult.rows;
  const findings: InteractionFinding[] = [];
  const curatedPairsFound = new Set<string>();

  const curatedResult = await pool.query(
    `SELECT
       m1.name as medication_a, m2.name as medication_b,
       i.severity, i.description, i.mechanism, i.recommendation, i.source_citation
     FROM interactions i
     JOIN medications m1 ON m1.id = i.medication_a_id
     JOIN medications m2 ON m2.id = i.medication_b_id
     WHERE (i.medication_a_id = ANY($1) AND i.medication_b_id = ANY($1))`,
    [medicationIds]
  );

  for (const row of curatedResult.rows) {
    findings.push({
      tier: 'curated',
      medicationA: row.medication_a,
      medicationB: row.medication_b,
      severity: row.severity,
      description: row.description,
      mechanism: row.mechanism,
      recommendation: row.recommendation,
      sourceCitation: row.source_citation
    });
    curatedPairsFound.add([row.medication_a, row.medication_b].sort().join('::'));
  }

  for (let i = 0; i < meds.length; i++) {
    for (let j = 0; j < meds.length; j++) {
      if (i === j) continue;

      const drugA = meds[i];
      const drugB = meds[j];

      const pairKey = [drugA.name, drugB.name].sort().join('::');
      if (curatedPairsFound.has(pairKey)) continue;

      if (!drugA.interaction_notes) continue;

      const matchIndex = drugA.interaction_notes.toLowerCase().indexOf(drugB.name.toLowerCase());
      if (matchIndex === -1) continue;

      const excerpt = extractExcerpt(drugA.interaction_notes, matchIndex, drugB.name.length);
      const tier = classifyExcerpt(excerpt);

      findings.push({
        tier,
        medicationA: drugA.name,
        medicationB: drugB.name,
        excerpt,
        fullTextAvailable: true,
        sourceUrl: drugA.source_url
      });

      curatedPairsFound.add(pairKey);
    }
  }

  return findings;
}
