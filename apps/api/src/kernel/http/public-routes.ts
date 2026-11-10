// Every route that needs no sign-in is listed here, with the reason. Adding one is a security decision (docs/SECURITY.md
// 2.5): it is reviewed, rate limited, and its tests say what it must refuse. A public route that isn't listed makes the
// app refuse to start.
export interface PublicRoute {
  method: string;
  path: string;
  reason: string;
}

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  {
    method: 'GET',
    path: '/api/v1/health',
    reason: 'Uptime checks and deploy health checks have no session. Reveals only up or down.',
  },
  {
    method: 'GET',
    path: '/api/v1/industries',
    reason:
      'The sign-up form needs the list of industries before anyone is signed in. It only reads, and it reveals ' +
      'nothing about any business.',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/login',
    reason:
      'Signing in needs no session. A wrong password and an unknown email get the same answer and take the same time. ' +
      'Lockout after repeated wrong passwords and rate limits arrive in a later F01 slice (6).',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/verify-email',
    reason:
      'The link in the email is opened in a browser that may not be signed in. The long random token in the body is the ' +
      'proof; it works once, expires, and an unknown, used or expired token all get the same answer. Rate limits arrive ' +
      'in a later F01 slice (6).',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/refresh',
    reason:
      'The access token has usually run out by the time the app refreshes, so the refresh cookie is the proof (it is only ' +
      'sent to this address). Each refresh replaces the token; a replaced token used again ends the whole session. Rate ' +
      'limits arrive in a later F01 slice (6).',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/signup',
    reason:
      'A new owner has no account yet. The password is checked and stored only as an argon2id hash. ' +
      'Rate limiting and the CSRF check arrive in later F01 slices (3 and 6); until then it is open to repeated use.',
  },
];
