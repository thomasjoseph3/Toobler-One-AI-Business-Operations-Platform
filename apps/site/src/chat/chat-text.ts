// Every word the chat window shows. English only (the text channels are English only).

export const CHAT_TEXT = {
  assistantLabel: 'AI assistant',
  windowLabel: 'Chat with our AI assistant',
  inputLabel: 'Your message',
  inputPlaceholder: 'Type your message…',
  send: 'Send',
  close: 'Close chat window',
  endChat: 'End chat',
  endChatHint: 'End this chat and start a new one',
  typing: 'The assistant is typing…',
  loading: 'Loading…',
  unavailable: 'The chat is not available here.',
  tooLong: 'That message is too long. Please shorten it.',
  busy: 'The chat is busy right now. Please try again in a minute.',
  assistantUnavailable: "Sorry, I can't answer right now. Please try again in a moment.",
  notOpenYet: "We're not open for chat yet. Please check back soon.",
  chatTooLong: 'This chat is long enough. Please end it and start a new one.',
  somethingWentWrong: 'Something went wrong. Please try again.',
  offline: 'You seem to be offline. Please check your connection and try again.',
  youSaid: 'You',
  assistantSaid: 'Assistant',
} as const;

/** The longest message the chat service accepts (the same number as the API's limit). It is written here, not imported from the shared package, so the window does not carry the whole validation library. */
export const MOST_CHARACTERS_IN_A_MESSAGE = 1000;
