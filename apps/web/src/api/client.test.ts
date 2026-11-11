import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiRequestError, onSessionEnded } from './client';

/** What the pretend server answers: a status and a JSON body (or none). */
interface PretendAnswer {
  status: number;
  body?: unknown;
}

/** Replaces fetch with a pretend server that gives these answers in order, and records every request it receives. */
function pretendServer(answers: PretendAnswer[]) {
  const requests: { url: string; method: string; headers: Record<string, string>; body: string | undefined }[] = [];
  const remaining = [...answers];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({
        url,
        method: init.method ?? 'GET',
        headers: init.headers as Record<string, string>,
        body: init.body as string | undefined,
      });
      const answer = remaining.shift();
      if (!answer) throw new Error('the pretend server ran out of answers');
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status });
    }),
  );
  return requests;
}

const unauthorized = { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Please sign in.' } } };

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('apiRequest', () => {
  it('calls the versioned address with the safety header and returns the JSON answer', async () => {
    const requests = pretendServer([{ status: 200, body: { hello: 'world' } }]);
    const answer = await apiRequest('GET', '/me');
    expect(answer).toEqual({ hello: 'world' });
    expect(requests[0]).toMatchObject({ url: '/api/v1/me', method: 'GET' });
    expect(requests[0]!.headers['X-Requested-With']).toBe('toobler-web');
  });

  it('sends a body as JSON, with a JSON content type', async () => {
    const requests = pretendServer([{ status: 200, body: { ok: true } }]);
    await apiRequest('POST', '/auth/login', { email: 'a@b.com', password: 'secret' });
    expect(requests[0]!.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(requests[0]!.body!)).toEqual({ email: 'a@b.com', password: 'secret' });
  });

  it('turns the API error shape into an ApiRequestError with status, code and message', async () => {
    pretendServer([
      { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'The email or password is not right.' } } },
    ]);
    await expect(apiRequest('POST', '/auth/login', {})).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'The email or password is not right.',
    });
  });

  it('gives a generic error when the answer is not the API error shape (for example a proxy error page)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })),
    );
    await expect(apiRequest('GET', '/me')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' });
  });

  it('says NETWORK_ERROR when the server cannot be reached at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(apiRequest('GET', '/me')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('on a 401 it refreshes the session once and repeats the call', async () => {
    const requests = pretendServer([
      unauthorized,
      { status: 200, body: { ok: true } },
      { status: 200, body: { name: 'Anita' } },
    ]);
    const answer = await apiRequest('GET', '/me');
    expect(answer).toEqual({ name: 'Anita' });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'GET /api/v1/me',
      'POST /api/v1/auth/refresh',
      'GET /api/v1/me',
    ]);
  });

  it('when the refresh fails it tells the listeners the session ended, and throws the 401', async () => {
    pretendServer([
      unauthorized,
      { status: 401, body: { error: { code: 'SESSION_ENDED', message: 'Your session has ended.' } } },
    ]);
    const listener = vi.fn();
    const stopListening = onSessionEnded(listener);
    await expect(apiRequest('GET', '/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(listener).toHaveBeenCalledTimes(1);
    stopListening();
  });

  it('never refreshes for the /auth/ routes: a wrong password is a plain answer, not an expired session', async () => {
    const requests = pretendServer([unauthorized]);
    await expect(apiRequest('POST', '/auth/login', {})).rejects.toBeInstanceOf(ApiRequestError);
    expect(requests).toHaveLength(1);
  });

  it('does not refresh for errors other than 401', async () => {
    const requests = pretendServer([{ status: 403, body: { error: { code: 'FORBIDDEN', message: 'No.' } } }]);
    await expect(apiRequest('GET', '/me')).rejects.toMatchObject({ status: 403 });
    expect(requests).toHaveLength(1);
  });

  it('several calls that fail together share ONE refresh', async () => {
    const requests: string[] = [];
    let refreshed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        requests.push(url);
        if (url === '/api/v1/auth/refresh') {
          refreshed = true;
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (!refreshed) return new Response(JSON.stringify(unauthorized.body), { status: 401 });
        return new Response(JSON.stringify({ fine: true }), { status: 200 });
      }),
    );
    await Promise.all([apiRequest('GET', '/me'), apiRequest('GET', '/industries'), apiRequest('GET', '/me')]);
    expect(requests.filter((url) => url.endsWith('/auth/refresh'))).toHaveLength(1);
  });
});
