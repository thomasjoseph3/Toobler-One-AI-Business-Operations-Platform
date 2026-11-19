import type { Database } from '../../../../kernel/database';
import type { Principal } from '../../../../kernel/http/guard';
import { describeLiveEvent, listEventNamesForRole, READ_OVERLAP_MILLISECONDS } from '../helpers/live-events';
import * as liveEventsRepository from '../repositories/live-events.repository';

/** The most events one read hands a screen; more than this in two seconds is a burst the screen catches up on by refetching. */
const MOST_EVENTS_PER_READ = 100;

/**
 * What the live stream does for one open screen: it remembers where it is (a time and the ids already sent) and, each time it is asked,
 * returns the business's new events as small messages. It only ever reads the signed-in person's own business, inside that business's
 * database fence.
 */
export function createLiveUpdatesService({
  database,
  now = () => new Date(),
}: {
  database: Database;
  now?: () => Date;
}) {
  return {
    /** Starts following a business from this moment: no history is sent. */
    startFollowing(principal: Pick<Principal, 'accountId' | 'role'>) {
      const names = listEventNamesForRole(principal.role);
      const startedAt = now();
      let readFrom = startedAt;
      // Ids already sent, with when they happened, so the overlap of each read never sends one twice
      const sentIds = new Map<string, number>();

      return {
        /** The messages for the events that happened since the last read (each event once). */
        async readNewMessages(): Promise<Array<Record<string, string>>> {
          const events = await database.runInAccountTransaction(principal.accountId, (transaction) =>
            liveEventsRepository.listEventsSince(transaction, {
              accountId: principal.accountId,
              names,
              since: new Date(readFrom.getTime() - READ_OVERLAP_MILLISECONDS),
              limit: MOST_EVENTS_PER_READ,
            }),
          );
          const messages: Array<Record<string, string>> = [];
          for (const event of events) {
            // What happened before the screen opened is history the screen already loaded; the overlap must not send it
            if (event.occurredAt.getTime() < startedAt.getTime() || sentIds.has(event.id)) continue;
            sentIds.set(event.id, event.occurredAt.getTime());
            messages.push(describeLiveEvent(event.name, event.payload));
          }
          // Forget ids that are older than the overlap: they can never come back
          const forgetBefore = now().getTime() - 2 * READ_OVERLAP_MILLISECONDS;
          for (const [eventId, happenedAt] of sentIds) {
            if (happenedAt < forgetBefore) sentIds.delete(eventId);
          }
          readFrom = now();
          return messages;
        },
      };
    },
  };
}
