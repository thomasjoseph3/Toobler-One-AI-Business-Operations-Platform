/**
 * The person inside an actor stamp such as { kind: 'user', id: '...' }. Returns the user's id, or null when the stamp is
 * empty or was made by something other than a person (the system, the AI agent). Pure: no database.
 */
export function userIdFromActorStamp(stamp: unknown): string | null {
  if (typeof stamp !== 'object' || stamp === null) return null;
  const { kind, id } = stamp as { kind?: unknown; id?: unknown };
  return kind === 'user' && typeof id === 'string' ? id : null;
}
