import { CHAT_TEXT } from './chat-text';
import { WidgetApiError } from './widget-api';

/** Turns a failed call into one plain sentence for the visitor. Never shows the API's own words, a code or a status number. */
export function describeSendError(error: unknown): string {
  if (!(error instanceof WidgetApiError)) return CHAT_TEXT.somethingWentWrong;
  if (error.status === 0) return CHAT_TEXT.offline;
  if (error.status === 429) return CHAT_TEXT.busy;
  if (error.status === 503) return CHAT_TEXT.assistantUnavailable;
  if (error.status === 400 && error.code === 'CHAT_TOO_LONG') return CHAT_TEXT.chatTooLong;
  if (error.status === 400) return CHAT_TEXT.tooLong;
  return CHAT_TEXT.somethingWentWrong;
}
