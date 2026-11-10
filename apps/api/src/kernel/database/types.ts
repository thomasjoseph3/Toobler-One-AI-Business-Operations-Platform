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

/** A kind of business a person can pick at sign-up. Shared by every business; read-only for the app role. */
export interface IndustriesTable {
  id: string;
  label: string;
  sort_order: Generated<number>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A business. Fenced by its own id. */
export interface AccountsTable {
  id: string;
  name: string;
  industry: Generated<string>;
  time_zone: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A person in a business (one business each for now). Fenced by account_id. */
export interface UsersTable {
  id: string;
  account_id: string;
  email: string;
  name: string;
  mobile_e164: string | null;
  mobile_key: string | null;
  role: 'manager' | 'staff' | 'staff_own';
  status: Generated<'active' | 'disabled'>;
  /** Unlocks platform-only actions (adding industries). Set only by someone with database access; false for everyone else. */
  is_platform_admin: Generated<boolean>;
  last_login_at: Date | null;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Password hashes. Not fenced; closed to the app role instead. */
export interface UserCredentialsTable {
  user_id: string;
  password_hash: string;
  password_changed_at: Generated<Date>;
}

/** Sign-ins, one per device. Not fenced; closed to the app role instead. */
export interface SessionsTable {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  previous_refresh_token_hash: string | null;
  rotated_at: Date | null;
  user_agent: string | null;
  ip: string | null;
  created_at: Generated<Date>;
  last_used_at: Generated<Date>;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
}

/** Tables are added here by the migration that creates them. */
export interface DB {
  schema_migrations: SchemaMigrationsTable;
  domain_events: DomainEventsTable;
  activity_log: ActivityLogTable;
  industries: IndustriesTable;
  accounts: AccountsTable;
  users: UsersTable;
  user_credentials: UserCredentialsTable;
  sessions: SessionsTable;
}
