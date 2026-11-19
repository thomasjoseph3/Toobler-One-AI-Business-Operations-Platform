// Remembers which reading of the website the owner last started, in this browser, so the What you sell page can offer what that reading
// found. A convenience for this browser only: if the browser will not keep it, nothing is lost but the offer. Never holds anything but ids.

const STORAGE_KEY = 'toobler.lastReading';

interface RememberedReading {
  businessId: string;
  runId: string;
}

/** Remembers the reading for this business. */
export function rememberReading(businessId: string, runId: string): void {
  try {
    const value: RememberedReading = { businessId, runId };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private windows and blocked storage: the page works without it
  }
}

/** The reading remembered for this business, or null (another business's reading is never given back). */
export function recallReading(businessId: string): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return null;
    const value = JSON.parse(stored) as Partial<RememberedReading>;
    return value.businessId === businessId && typeof value.runId === 'string' ? value.runId : null;
  } catch {
    return null;
  }
}
