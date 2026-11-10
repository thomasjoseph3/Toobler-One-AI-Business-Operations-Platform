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
    method: 'POST',
    path: '/api/v1/auth/signup',
    reason: 'A new owner has no account yet. Rate limited (5 an hour per address); the password is checked and hashed.',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/verify-email',
    reason:
      'The link in the verification email is the credential: long, random, single use, stored hashed, expires in 48 h.',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/login',
    reason:
      'Signing in needs no session. Rate limited per address, locked 15 minutes after 5 wrong tries per email, same answer for unknown emails.',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/refresh',
    reason:
      'Uses the refresh cookie, not an access token (the access token has just expired). A replaced token used again ends the session.',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/forgot-password',
    reason:
      'Asking for a reset link needs no session. Always the same answer, so it cannot be used to find out who has an account. Rate limited.',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/reset-password',
    reason:
      'The emailed link is the credential: random, single use, 1 hour, stored hashed. Ends every session of that person. Rate limited.',
  },
];
