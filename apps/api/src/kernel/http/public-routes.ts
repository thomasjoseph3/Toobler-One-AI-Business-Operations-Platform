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
  {
    method: 'GET',
    path: '/api/v1/public/widget/:key/config',
    reason:
      "A visitor's browser on the business's own website asks how the chat bubble should look. The business comes only from the widget key " +
      "(an unknown key and a switched-off chat both answer 404), and the website must be on the business's allowed list (else 403). It " +
      'reveals only the look and the contact links the business already shows on that website. Each address is limited to 60 a minute.',
  },
  {
    method: 'OPTIONS',
    path: '/api/v1/public/widget/:key/config',
    reason:
      "The browser's permission check before a call from another website (CORS). It answers with permission only for a website on the " +
      "business's allowed list, and reveals nothing else. Each address is limited to 60 a minute.",
  },
  {
    method: 'POST',
    path: '/api/v1/public/widget/:key/messages',
    reason:
      "A visitor chats with the business's AI agent from the business's own website, with no sign-in. The business comes only from the widget " +
      "key; the website must be on the business's allowed list; a chat is carried on only with the signed visitor token the server gave for " +
      'it. A message is limited in size and a chat in length; each address is limited to 20 messages a minute, each key to 120 a minute, ' +
      'and each address to 10 new chats an hour. The CSRF check does not apply (no cookie is used), the website check and the token take its place.',
  },
  {
    method: 'OPTIONS',
    path: '/api/v1/public/widget/:key/messages',
    reason:
      "The browser's permission check before a call from another website (CORS). It answers with permission only for a website on the " +
      "business's allowed list. Each address is limited to 60 a minute.",
  },
  {
    method: 'GET',
    path: '/api/v1/public/widget/:key/messages',
    reason:
      'A visitor whose page was reloaded gets their own chat back. The business comes only from the widget key, the website must be on the ' +
      "business's allowed list, and the signed visitor token names the one chat that may be read (401 without a good one, for another " +
      'business or a test chat). It changes nothing. Each address is limited to 60 a minute.',
  },
  {
    method: 'POST',
    path: '/api/v1/public/widget/:key/end',
    reason:
      "The visitor closes the bubble, so their chat ends and is sorted. Same checks as the messages: the widget key, the business's allowed " +
      'websites and the signed visitor token. Closing a chat that already ended does nothing, so a repeat costs nothing. Each address is ' +
      'limited to 10 a minute. The CSRF check does not apply (no cookie is used).',
  },
  {
    method: 'OPTIONS',
    path: '/api/v1/public/widget/:key/end',
    reason:
      "The browser's permission check before a call from another website (CORS). It answers with permission only for a website on the " +
      "business's allowed list. Each address is limited to 60 a minute.",
  },
  {
    method: 'GET',
    path: '/widget/loader.js',
    reason:
      'The one line a business pastes into its website loads this script. It is the same file for every business, holds no data, and reads ' +
      'nothing from the page. Each address is limited to 120 requests a minute.',
  },
  {
    method: 'GET',
    path: '/widget/assets/:file',
    reason:
      "The chat window's own script and styles: built files, the same for every business, read only by plain file name from one folder " +
      '(no path can leave it). Each address is limited to 120 requests a minute.',
  },
  {
    method: 'GET',
    path: '/widget/chat',
    reason:
      "The chat window's page, shown in an iframe on a business's website. It answers 404 for an unknown key, a switched-off chat, a " +
      "business with no allowed website, and a page opened on its own (not in a frame); the browser is told that only the business's " +
      'allowed websites may frame it. Each address is limited to 60 requests a minute.',
  },
  {
    method: 'GET',
    path: '/widget/test',
    reason:
      'A page to try the chat bubble on. It is only registered when the app is not in production, and it shows only the key typed into the address.',
  },
];
