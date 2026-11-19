import { describe, expect, it } from 'vitest';
import { CHAT_TEXT } from './chat-text';
import { describeSendError } from './describe-send-error';
import { WidgetApiError } from './widget-api';

describe('describeSendError', () => {
  it('says each kind of failure in plain words', () => {
    expect(describeSendError(new WidgetApiError(0, null))).toBe(CHAT_TEXT.offline);
    expect(describeSendError(new WidgetApiError(429, 'TOO_MANY_REQUESTS'))).toBe(CHAT_TEXT.busy);
    expect(describeSendError(new WidgetApiError(503, 'ASSISTANT_UNAVAILABLE'))).toBe(CHAT_TEXT.assistantUnavailable);
    expect(describeSendError(new WidgetApiError(503, 'NOT_OPEN_YET'))).toBe(CHAT_TEXT.notOpenYet);
    expect(describeSendError(new WidgetApiError(400, 'CHAT_TOO_LONG'))).toBe(CHAT_TEXT.chatTooLong);
    expect(describeSendError(new WidgetApiError(400, 'VALIDATION_ERROR'))).toBe(CHAT_TEXT.tooLong);
  });

  it('falls back to a general sentence for anything else, and never shows a status or a code', () => {
    expect(describeSendError(new WidgetApiError(500, null))).toBe(CHAT_TEXT.somethingWentWrong);
    expect(describeSendError(new Error('boom'))).toBe(CHAT_TEXT.somethingWentWrong);
  });
});
