import type {
  AuthResult,
  Medication,
  UserMedication,
  UserMedicationCreated,
  DoseLog,
  DoseLogStatus,
  AdherenceSummary,
  MeResult,
  InteractionCheckResult,
  ApiErrorBody
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_PREFIX = '/api/v1';

if (!API_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is not set - check apps/web/.env.local');
}

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// accessToken lives in memory only, held here and mirrored into
// auth-context.tsx's React state. refreshToken is NOT stored here at all
// anymore - it lives exclusively in an httpOnly cookie the browser manages,
// which this module can't read even if it wanted to. Every request that
// needs the cookie uses credentials: 'include' so the browser attaches it
// automatically.
let accessToken: string | null = null;
let onTokensRefreshed: ((accessToken: string) => void) | null = null;
let onAuthFailure: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setAuthCallbacks(callbacks: {
  onTokensRefreshed: (accessToken: string) => void;
  onAuthFailure: () => void;
}) {
  onTokensRefreshed = callbacks.onTokensRefreshed;
  onAuthFailure = callbacks.onAuthFailure;
}

// Prevents duplicate concurrent refresh calls if multiple requests 401 at
// the same time. All callers awaiting a refresh share the same in-flight
// promise instead of each independently hitting /auth/refresh.
let refreshInFlight: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const response = await fetch(`${API_URL}${API_PREFIX}/auth/refresh`, {
    method: 'POST',
    credentials: 'include' // sends the httpOnly refreshToken cookie
  });

  if (!response.ok) {
    throw new ApiError(response.status, 'Refresh token invalid or expired');
  }

  const data = (await response.json()) as { accessToken: string };
  accessToken = data.accessToken;
  onTokensRefreshed?.(data.accessToken);
  return data.accessToken;
}

interface RequestOptions {
  skipAuthRedirect?: boolean;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  authenticated?: boolean;
  query?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_URL}${API_PREFIX}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function rawRequest<T>(path: string, options: RequestOptions, token: string | null): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.authenticated && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    // credentials: 'include' is required on EVERY request (not just
    // refresh) so /auth/logout can also read+clear the httpOnly cookie,
    // and so /auth/register and /auth/login responses' Set-Cookie header
    // is actually accepted by the browser cross-origin.
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(response.status, (data as ApiErrorBody).error ?? 'Request failed');
  }

  return data as T;
}

// Central request function. On a 401 from an authenticated call, attempts
// exactly one token refresh, then retries the original request once. If
// the refresh itself fails, calls onAuthFailure (auth-context redirects to
// /login) rather than retrying indefinitely.
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options, accessToken);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 401 && options.authenticated) {
      try {
        if (!refreshInFlight) {
          refreshInFlight = performRefresh().finally(() => {
            refreshInFlight = null;
          });
        }
        const newToken = await refreshInFlight;
        return await rawRequest<T>(path, options, newToken);
      } catch {
        if (!options.skipAuthRedirect) {
          onAuthFailure?.();
        }
        throw err;
      }
    }
    throw err;
  }
}

export const apiClient = {
  register: (email: string, password: string, name: string, timezone?: string) =>
    request<Omit<AuthResult, 'refreshToken'>>('/auth/register', {
      method: 'POST',
      body: { email, password, name, timezone }
    }),

  login: (email: string, password: string) =>
    request<Omit<AuthResult, 'refreshToken'>>('/auth/login', {
      method: 'POST',
      body: { email, password }
    }),

  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  getCurrentUser: () => request<MeResult>('/auth/me', { authenticated: true }),

  searchMedications: (search?: string) =>
    request<{ medications: Medication[] }>('/medications', { query: { search } }),

  checkInteractions: (medicationIds: string[]) =>
    request<InteractionCheckResult>('/interactions/check', {
      query: { medIds: medicationIds.join(',') }
    }),

  listUserMedications: () =>
    request<{ userMedications: UserMedication[] }>('/user-medications', { authenticated: true }),

  getUserMedication: (id: string) =>
    request<UserMedication>(`/user-medications/${id}`, { authenticated: true }),

  createUserMedication: (input: {
    medicationId: string;
    dosageAmount: number;
    dosageUnit: string;
    frequency: string;
    reminderTimes: string[];
    startedAt?: string;
  }) =>
    request<UserMedicationCreated>('/user-medications', {
      method: 'POST',
      authenticated: true,
      body: input
    }),

  deleteUserMedication: (id: string) =>
    request<void>(`/user-medications/${id}`, { method: 'DELETE', authenticated: true }),

  createDoseLog: (input: {
    userMedicationId: string;
    scheduledDate: string;
    scheduledTime: string;
    status: DoseLogStatus;
    notes?: string;
  }) =>
    request<DoseLog>('/dose-logs', { method: 'POST', authenticated: true, body: input }),

  listDoseLogs: (userMedicationId?: string) =>
    request<{ doseLogs: DoseLog[] }>('/dose-logs', {
      authenticated: true,
      query: { userMedicationId }
    }),

  getAdherenceSummary: (userMedicationId: string, days?: number) =>
    request<AdherenceSummary>('/adherence/summary', {
      authenticated: true,
      query: { userMedicationId, days }
    })
};

// Used only by auth-context.tsx's silent session-restore on page load.
// A 401 here is the EXPECTED outcome for a first-time or logged-out
// visitor - it must not trigger the global onAuthFailure redirect
// (which would otherwise force every anonymous page load, including
// /login and /register themselves, to bounce to /login - a real bug
// this fixed after being caught live via HAR inspection). Genuine
// mid-session auth failures on actual authenticated actions still use
// apiClient.getCurrentUser() / other apiClient methods, which keep the
// redirect behavior.
export function fetchCurrentUserSilently() {
  return request<MeResult>('/auth/me', { authenticated: true, skipAuthRedirect: true });
}
