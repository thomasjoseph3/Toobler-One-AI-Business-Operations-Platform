import type { Generated } from 'kysely';

type Json = Record<string, unknown>;

export interface SchemaMigrationsTable {
  name: string;
  checksum: string;
  applied_at: Generated<Date>;
}

/** The outbox: written in the same transaction as the change, delivered at least once by the dispatcher. */
export interface DomainEventsTable {
  id: string;
  account_id: string;
  name: string;
  payload: Json;
  occurred_at: Generated<Date>;
  dispatched_at: Date | null;
  attempts: Generated<number>;
  next_attempt_at: Generated<Date>;
  locked_until: Date | null;
  last_error: string | null;
  failed_at: Date | null;
}

/** Who did what, when: field names only, never values. Append only for the app role. */
export interface ActivityLogTable {
  id: string;
  account_id: string;
  actor: Json;
  kind: string;
  record_type: string | null;
  record_id: string | null;
  fields: Generated<string[]>;
  ip: string | null;
  user_agent: string | null;
  created_at: Generated<Date>;
}

/** Tables are added here by the migration that creates them. */
export interface DB {
  schema_migrations: SchemaMigrationsTable;
  domain_events: DomainEventsTable;
  activity_log: ActivityLogTable;
}
