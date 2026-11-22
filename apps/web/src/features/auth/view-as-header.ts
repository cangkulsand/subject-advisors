// No imports on purpose: API clients read this, and the account cache depends on those clients.
/**
 * System Admin "View as" (S3-P004-033). Kept per browser tab in sessionStorage so a reload keeps the view; sent to the
 * API on every non-admin call as `X-View-As`. The API decides whether the caller may use it.
 */
export type WebViewAs =
  | { role: 'COORDINATOR'; programmeId: number; learningCentreId: number; label: string }
  | { role: 'STUDENT'; studentId: number; label: string };
export const VIEW_AS_STORAGE_KEY = 'sa.viewAs';

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
function storage(): Storage | undefined { try { return typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { return undefined; } }

export function readViewAs(): WebViewAs | null {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(VIEW_AS_STORAGE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const v = value as Record<string, unknown>;
    const label = typeof v.label === 'string' ? v.label : '';
    if (v.role === 'COORDINATOR' && positive(v.programmeId) && positive(v.learningCentreId)) return { role: 'COORDINATOR', programmeId: v.programmeId, learningCentreId: v.learningCentreId, label };
    if (v.role === 'STUDENT' && positive(v.studentId)) return { role: 'STUDENT', studentId: v.studentId, label };
  } catch { /* malformed or blocked storage means no view */ }
  return null;
}

/** The header value for the active view, or null. */
export function viewAsValue(view: WebViewAs | null = readViewAs()): string | null {
  if (!view) return null;
  return view.role === 'COORDINATOR' ? `COORDINATOR;programme=${view.programmeId};centre=${view.learningCentreId}` : `STUDENT;student=${view.studentId}`;
}
export function viewAsHeaders(): Record<string, string> {
  const value = viewAsValue();
  return value ? { 'X-View-As': value } : {};
}

