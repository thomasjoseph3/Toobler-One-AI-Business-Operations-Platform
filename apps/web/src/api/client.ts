// The one place the web app talks to the API. Every call goes through apiRequest, so the safety headers, the error shape
// and the quiet "session ran out, refresh it" step are written once.

/** The prefix of every API address. In development Vite passes /api on to the API on port 4000. */
const API_PREFIX = '/api/v1';

/** An answer the API gave that was not a success: the HTTP status, the stable code, and the plain-English message. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

/** The people who want to know when the session has ended for good (the app then shows the sign-in page). */
const sessionEndedListeners = new Set<() => void>();

/** Calls `listener` whenever a refresh fails and the person has to sign in again. Returns the function that stops listening. */
export function onSessionEnded(listener: () => void): () => void {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

/** The refresh that is running right now, if any. Several requests that fail together share one refresh, not one each. */
let refreshInProgress: Promise<boolean> | null = null;

/** Sends one request and returns the answer's JSON (or undefined when the answer has no body). Throws ApiRequestError. */
async function sendOnce<Answer>(method: string, path: string, body?: unknown): Promise<Answer> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        // The API refuses any change that does not carry this header: a page on another website cannot add it (CSRF)
        'X-Requested-With': 'toobler-web',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    // The browser could not reach the API at all (offline, server down)
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Could not reach the server.');
  }
  const answerText = await response.text();
  const answer: unknown = answerText ? safelyParseJson(answerText) : undefined;
  if (!response.ok) {
    const problem = readErrorBody(answer);
    throw new ApiRequestError(response.status, problem.code, problem.message);
  }
  return answer as Answer;
}

/** Parses JSON, or returns undefined when the text is not JSON (for example an error page from a proxy). */
function safelyParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Reads the API's error shape `{ error: { code, message } }`; anything else becomes a generic error. */
function readErrorBody(answer: unknown): { code: string; message: string } {
  if (typeof answer === 'object' && answer !== null && 'error' in answer) {
    const error = (answer as { error: { code?: unknown; message?: unknown } }).error;
    if (typeof error?.code === 'string' && typeof error?.message === 'string') {
      return { code: error.code, message: error.message };
    }
  }
  return { code: 'UNKNOWN_ERROR', message: 'Something went wrong.' };
}

/** Asks the API for new tokens using the refresh cookie. True when it worked. Only one refresh runs at a time. */
function refreshSession(): Promise<boolean> {
  if (!refreshInProgress) {
    refreshInProgress = sendOnce('POST', '/auth/refresh')
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshInProgress = null;
      });
  }
  return refreshInProgress;
}

/**
 * Calls the API and returns the answer. When the answer is 401 on a normal call (the 15-minute access token has run
 * out) it refreshes the session once and repeats the call. If the refresh fails, listeners are told the session ended and
 * the original 401 is thrown. The /auth/ routes themselves are never refreshed-and-repeated: a wrong password is a
 * plain answer, not an expired session.
 */
export async function apiRequest<Answer>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<Answer> {
  try {
    return await sendOnce<Answer>(method, path, body);
  } catch (error) {
    const canRefresh = error instanceof ApiRequestError && error.status === 401 && !path.startsWith('/auth/');
    if (!canRefresh) throw error;
    if (await refreshSession()) return sendOnce<Answer>(method, path, body);
    sessionEndedListeners.forEach((listener) => listener());
    throw error;
  }
}
