import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { Writable } from 'node:stream';
import { loadConfig } from '../../kernel/config';
import { loggerOptions } from '../../kernel/logger';
import { createMailProvider } from './index';

const environment = { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x', JWT_SECRET: 'x'.repeat(32) };

describe('mail providers', () => {
  it('the console provider prints the link so a developer can click it, but never the address', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logger = pino({ ...loggerOptions({ logLevel: 'info', env: 'development' }) }, stream);
    const provider = createMailProvider(loadConfig(environment).mail, logger);
    await provider.send({
      to: 'secret-person@example.com',
      subject: 'Hello',
      text: 'Open http://localhost:3000/verify-email?token=abc123',
    });
    const printed = lines.join('');
    expect(printed).toContain('http://localhost:3000/verify-email?token=abc123');
    expect(printed).not.toContain('secret-person@example.com');
  });

  it('chooses smtp when SMTP_HOST is set and console when it is not, unless told otherwise', () => {
    expect(loadConfig(environment).mail.provider).toBe('console');
    expect(loadConfig({ ...environment, SMTP_HOST: 'smtp.example.com' }).mail.provider).toBe('smtp');
    expect(loadConfig({ ...environment, SMTP_HOST: 'smtp.example.com', MAIL_PROVIDER: 'console' }).mail.provider).toBe(
      'console',
    );
  });
});
