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
      'After 5 wrong passwords an email is locked for 15 minutes (known or not), and each address is limited to 10 tries a minute.',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/verify-email',
    reason:
      'The link in the email is opened in a browser that may not be signed in. The long random token in the body is the ' +
      'proof; it works once, expires, and an unknown, used or expired token all get the same answer. Each ' +
      'address is limited to 20 tries a minute.',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/refresh',
    reason:
      'The access token has usually run out by the time the app refreshes, so the refresh cookie is the proof (it is only ' +
      'sent to this address). Each refresh replaces the token; a replaced token used again ends the whole session. Each ' +
      'address is limited to 30 refreshes a minute.',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/signup',
    reason:
      'A new owner has no account yet. The password is checked and stored only as an argon2id hash. ' +
      'Each address is limited to 10 sign-ups an hour, and the CSRF check applies.',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/forgot-password',
    reason:
      'Someone who forgot their password cannot sign in. It always answers the same, whether or not the email has an ' +
      'account, and only ever emails the address on the account. Each address is limited to 3 requests per 10 minutes.',
  },
  {
    method: 'POST',
    path: '/api/v1/auth/reset-password',
    reason:
      'The link in the email is opened by someone who cannot sign in. The long random token is the proof; it works once, ' +
      'expires after an hour, and an unknown, used or expired token all get the same answer. Each address is limited ' +
      'to 10 tries a minute.',
  },
];
