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
];
