import type { Db, Database } from './database';
import { writeActivityLog, type ActivityDetails } from './activity-log';
import { publishEvent } from './events/publish';

/** Who is doing something. Stamped on every change and on the activity log. */
export interface Actor {
  kind: 'user' | 'agent' | 'assistant' | 'import' | 'system' | 'workflow';
  /** The user's id, the module or job name, and so on. Null when there is no one specific. */
  id: string | null;
}

/**
 * Everything a service needs to do work for ONE business: the business id (fixed, never taken from input), who is
 * acting, and the three things every change needs: a fenced transaction, an activity log entry and an event.
 * Sign-in (F01) will add the signed-in person on top of this for web requests.
 */
export interface AccountContext {
  readonly accountId: string;
  readonly actor: Actor;
  /** Runs `work` in one transaction that can only see this business's rows. */
  runInAccountTransaction<Result>(work: (transaction: Db) => Promise<Result>): Promise<Result>;
  /** Adds a line to the activity log, in the same transaction as the change. */
  audit(transaction: Db, kind: string, details?: ActivityDetails): Promise<void>;
  /** Saves an event for other modules, in the same transaction as the change. Returns the event id. */
  publish(transaction: Db, eventName: string, payload?: Record<string, unknown>): Promise<string>;
}

/** Builds an AccountContext for a business and an actor. Jobs, event handlers and webhooks all start from this. */
export type ContextFactory = (accountId: string, actor: Actor) => AccountContext;

/** Creates the function that builds contexts, wired to the database. */
export function createContextFactory(database: Database): ContextFactory {
  return (accountId, actor) => ({
    accountId,
    actor,
    runInAccountTransaction: (work) => database.runInAccountTransaction(accountId, work),
    audit: (transaction, kind, details) => writeActivityLog(transaction, { accountId, actor, kind, details }),
    publish: (transaction, eventName, payload = {}) => publishEvent(transaction, { accountId, eventName, payload }),
  });
}
