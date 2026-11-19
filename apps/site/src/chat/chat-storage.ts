// Keeps the visitor token in the browser so a reload carries on the same chat. Where the browser refuses storage (private windows, blocked
// site data) the token is kept in memory only, and the chat simply starts fresh after a reload.

const memory = new Map<string, string>();

/** The name the token is saved under: one per widget key, so two businesses' chats on one browser never mix. */
export function storageNameFor(widgetKey: string): string {
  return `toobler-chat-token:${widgetKey}`;
}

/** The saved token, or null. */
export function readSavedToken(widgetKey: string): string | null {
  const name = storageNameFor(widgetKey);
  try {
    return window.localStorage.getItem(name) ?? memory.get(name) ?? null;
  } catch {
    return memory.get(name) ?? null;
  }
}

/** Saves the token. */
export function saveToken(widgetKey: string, token: string): void {
  const name = storageNameFor(widgetKey);
  memory.set(name, token);
  try {
    window.localStorage.setItem(name, token);
  } catch {
    // Kept in memory only
  }
}

/** Forgets the token (the chat ended, or the server no longer knows it). */
export function forgetToken(widgetKey: string): void {
  const name = storageNameFor(widgetKey);
  memory.delete(name);
  try {
    window.localStorage.removeItem(name);
  } catch {
    // Nothing to forget
  }
}
