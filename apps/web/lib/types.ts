// Mirrors apps/api response shapes exactly - see docs/DECISIONS.md and
// apps/api/src/routes/*.ts and src/services/*.ts for the source of truth.
// Keep in sync manually; no shared package between web and api (frontend
// talks HTTP, not TS imports).

export interface User {
  id: string;
  email: string;
  name: string;
  timezone: string;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Medication {
  id: string;
  name: string;
  category: string;
}

export interface UserMedication {
  id: string;
  userId: string;
  medicationId: string;
  medicationName: string;
  medicationCategory: string;
  dosageAmount: number;
  dosageUnit: string;
  frequency: string;
  reminderTimes: string[];
  startedAt: string;
  createdAt: string;
}

export interface UserMedicationCreated extends UserMedication {
  jobsScheduled: number;
}

export type DoseLogStatus = 'taken' | 'missed' | 'skipped';

export interface DoseLog {
  id: string;
  userMedicationId: string;
  scheduledDate: string;
  scheduledTime: string;
  status: DoseLogStatus;
  loggedAt: string;
  notes: string | null;
}

export interface AdherenceSummary {
  userMedicationId: string;
  days: number;
  totalSlots: number;
  takenSlots: number;
  adherencePercentage: number | null;
  startDate: string;
  endDate: string;
}

// Discriminated union on `tier` - mirrors apps/api/src/services/interactions.ts
// exactly. Curated findings come from the hand-curated interactions table
// (structured severity/mechanism/recommendation). Text-scan findings come
// from a keyword match against a medication's FDA-label interaction_notes
// text, then classified as warning vs reassuring based on whether the
// surrounding excerpt contains phrasing like "no clinically significant
// interaction" - not exhaustive NLP, a narrow heuristic, and labeled as
// such to the frontend so it can render text-scan findings with visibly
// lower confidence than curated ones.
export interface CuratedFinding {
  tier: 'curated';
  medicationA: string;
  medicationB: string;
  severity: string;
  description: string;
  mechanism: string | null;
  recommendation: string | null;
  sourceCitation: string;
}

export interface TextScanFinding {
  tier: 'text-scan-warning' | 'text-scan-reassuring';
  medicationA: string;
  medicationB: string;
  excerpt: string;
  fullTextAvailable: boolean;
  sourceUrl: string | null;
}

export type InteractionFinding = CuratedFinding | TextScanFinding;

export interface InteractionCheckResult {
  checkedMedicationCount: number;
  findingsCount: number;
  findings: InteractionFinding[];
}

export interface ApiErrorBody {
  error: string;
}

export interface MeResult {
  user: User;
}
