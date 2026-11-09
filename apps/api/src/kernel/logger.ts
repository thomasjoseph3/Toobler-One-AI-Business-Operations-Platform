import type { FastifyServerOptions } from 'fastify';
import type { Config } from './config';

// Never in a log: credentials, personal data, what customers wrote, secrets. Log ids, not content (docs/SECURITY.md 2.7).
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.secret',
  '*.code',
  '*.phone',
  '*.email',
  '*.message',
  '*.text',
  '*.transcript',
  'password',
  'token',
  'secret',
  'phone',
  'email',
];

/**
 * Builds the logger settings Fastify uses: the log level from the configuration (silent while testing), a list of fields
 * that are replaced with "[redacted]", and a request summary that never contains a body, header or query string.
 */
export function loggerOptions(config: Pick<Config, 'logLevel' | 'env'>): Exclude<FastifyServerOptions['logger'], boolean | undefined> {
  return {
    level: config.env === 'test' ? 'silent' : config.logLevel,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    serializers: {
      // The path without its query string (it can hold a phone number or a code), and never a body or a header
      req: (request: { method: string; url: string; id: string; ip?: string }) => ({
        method: request.method,
        url: request.url.split('?')[0],
        id: request.id,
        ip: request.ip,
      }),
    },
  };
}
