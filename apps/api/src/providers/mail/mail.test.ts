import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../kernel/config';
import { createMailSender } from './index';

const baseEnvironment = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x',
  JWT_SECRET: 'a-test-secret-that-is-long-enough-to-pass-32',
};

describe('createMailSender', () => {
  it('prints the email in the terminal when the provider is console, and sends nothing', async () => {
    const lines: string[] = [];
    const sender = createMailSender(loadConfig(baseEnvironment), (line) => lines.push(line));
    await sender.send({ to: 'a@example.com', subject: 'Hello', text: 'Open https://x.test/y', html: '<p>x</p>' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('To: a@example.com');
    expect(lines[0]).toContain('Open https://x.test/y');
  });

  it('uses a real mail server when SMTP_HOST is set, and fails (not silently) when it cannot be reached', async () => {
    const config = loadConfig({
      ...baseEnvironment,
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1', // nothing listens here
      EMAIL_FROM: 'Toobler One <no-reply@example.com>',
    });
    expect(config.mail.provider).toBe('smtp');
    const lines: string[] = [];
    const sender = createMailSender(config, (line) => lines.push(line));
    await expect(sender.send({ to: 'a@example.com', subject: 's', text: 't', html: 'h' })).rejects.toThrow();
    expect(lines).toEqual([]); // it did not fall back to printing
  });
});
