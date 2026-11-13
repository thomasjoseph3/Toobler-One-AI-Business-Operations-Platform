import { describe, expect, it } from 'vitest';
import {
  buildFallbackStormEmail,
  buildModelRetiringEmail,
  buildModelsMissingEmail,
  buildNewModelsEmail,
  buildOwnKeyProblemEmail,
  buildPlatformKeyProblemEmail,
  escapeHtml,
} from './ai-notice-emails';

const recipient = { name: 'Asha <Admin>', email: 'asha@example.com' };

describe('AI warning emails', () => {
  it('escapes anything a person typed, in the HTML, and keeps the plain text readable', () => {
    const email = buildOwnKeyProblemEmail(recipient, {
      label: 'Main <script>alert(1)</script> key',
      provider: 'gemini',
      status: 'failed',
      note: 'The AI company rejected this key.',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('Hi Asha &lt;Admin&gt;,');
    expect(email.text).toContain('Main <script>alert(1)</script> key');
    expect(email.to).toBe('asha@example.com');
  });

  it('says what happened to an own key, which company, and what to do, differently for a failed and a limited key', () => {
    const failed = buildOwnKeyProblemEmail(recipient, {
      label: 'Main',
      provider: 'openai',
      status: 'failed',
      note: 'The AI company rejected this key.',
    });
    expect(failed.subject).toBe('Your OpenAI key "Main" needs attention');
    expect(failed.text).toContain('stopped working');
    const limited = buildOwnKeyProblemEmail(recipient, {
      label: 'Main',
      provider: 'openai',
      status: 'limited',
      note: 'Quota used up.',
    });
    expect(limited.text).toContain('run into a limit');
    expect(failed.text).toContain('AI connections');
  });

  it('names a platform key by its place, never by the key', () => {
    const email = buildPlatformKeyProblemEmail(recipient, {
      provider: 'gemini',
      keyPosition: 3,
      status: 'failed',
      note: 'Rejected.',
    });
    expect(email.subject).toBe('Platform Google Gemini key 3 needs attention');
    expect(email.text).toContain('key number 3');
  });

  it('lists missing and new models', () => {
    expect(buildModelsMissingEmail(recipient, 'gemini', ['a', 'b']).subject).toBe(
      'Google Gemini no longer lists 2 of our models',
    );
    expect(buildModelsMissingEmail(recipient, 'gemini', ['a', 'b']).text).toContain('a, b');
    expect(buildNewModelsEmail(recipient, 'openai', ['gpt-6']).subject).toBe('OpenAI offers 1 new model');
    expect(buildNewModelsEmail(recipient, 'openai', ['x', 'y']).subject).toBe('OpenAI offers 2 new models');
  });

  it('words each retirement warning', () => {
    const base = { label: 'Gemini 2.5 Flash', modelName: 'gemini-2.5-flash', retiresOn: '2027-01-15' };
    expect(buildModelRetiringEmail(recipient, { ...base, warning: '30_days' }).text).toContain('within 30 days');
    expect(buildModelRetiringEmail(recipient, { ...base, warning: '7_days' }).text).toContain('within 7 days');
    const passed = buildModelRetiringEmail(recipient, { ...base, warning: 'passed' });
    expect(passed.subject).toContain('has reached its retirement date');
    expect(passed.text).toContain('passed its retirement date');
  });

  it('points a fallback warning at the right place to look', () => {
    expect(
      buildFallbackStormEmail(recipient, { taskLabel: 'Sorting conversations', count: 12, usingPlatformKeys: true })
        .text,
    ).toContain('Platform keys');
    expect(
      buildFallbackStormEmail(recipient, { taskLabel: 'Sorting conversations', count: 12, usingPlatformKeys: false })
        .text,
    ).toContain('your own keys');
  });

  it('escapes the five dangerous characters', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});
