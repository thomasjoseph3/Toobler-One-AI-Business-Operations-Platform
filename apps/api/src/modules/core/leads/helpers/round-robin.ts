// Sharing new leads out in turn (round-robin). Pure logic, no database: the lead service asks it who is next.

/**
 * The person whose turn it is: the one after `lastAssignedUserId` in the list, wrapping round to the first. When nobody has had
 * a turn yet, or the last person is no longer on the list, it is the first person. Returns null for an empty list.
 */
export function pickNextPerson(options: {
  /** The people taking turns, in turn order. */
  userIds: readonly string[];
  /** Who got the previous lead, or null if nobody has yet. */
  lastAssignedUserId: string | null;
}): string | null {
  const { userIds, lastAssignedUserId } = options;
  if (userIds.length === 0) return null;
  const positionOfLast = lastAssignedUserId === null ? -1 : userIds.indexOf(lastAssignedUserId);
  const positionOfNext = (positionOfLast + 1) % userIds.length;
  return userIds[positionOfNext] ?? null;
}
