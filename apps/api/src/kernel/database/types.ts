import type { ColumnType, Generated } from 'kysely';

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

/** An AI model the platform knows about. Shared by every business; the app role can read it but not change it. */
export interface AiModelsTable {
  id: Generated<string>;
  provider: 'gemini' | 'openai' | 'anthropic';
  model_name: string;
  label: string;
  tasks: Generated<string[]>;
  status: Generated<'active' | 'deprecated' | 'retired'>;
  sort_order: Generated<number>;
  kind: Generated<'text' | 'voice'>;
  size: Generated<'small' | 'medium' | 'large'>;
  /** A moving name the provider points at newer models without notice. */
  is_alias: Generated<boolean>;
  /** The day the provider retires the model (like 2027-03-31), typed in by the admin. */
  retires_on: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** The preset (and the platform's setting) of which models do a job, in order. Shared by every business; read-only for the app role. */
export interface AiTaskModelsTable {
  task: string;
  position: number;
  model_id: string;
}

/** An AI key a business saved for itself. The key is stored scrambled; only its last four characters are readable. Fenced by account_id. */
export interface AiKeysTable {
  id: string;
  account_id: string;
  provider: 'gemini' | 'openai' | 'anthropic';
  label: string;
  encrypted_key: string;
  key_last_four: string;
  key_fingerprint: string;
  status: Generated<'unchecked' | 'working' | 'limited' | 'failed'>;
  status_note: string | null;
  status_checked_at: Date | null;
  last_notice_at: Date | null;
  deleted_at: Date | null;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A business's AI settings (one row per business). The manager's columns and the platform's columns are written by different people. */
export interface AiSettingsTable {
  account_id: string;
  key_mode: Generated<'own' | 'platform' | 'own_then_platform'>;
  task_models: Generated<Json>;
  platform_enabled: Generated<boolean>;
  platform_monthly_call_cap: number | null;
  platform_monthly_token_cap: number | null;
  platform_expires_at: Date | null;
  notices_enabled: Generated<boolean>;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** One AI call (no message text, no key). Kept 90 days. Fenced by account_id. */
export interface AiCallsTable {
  id: string;
  account_id: string;
  created_at: Generated<Date>;
  task: string;
  agent_id: string;
  channel: string;
  prompt_version: string;
  conversation_id: string | null;
  provider: 'gemini' | 'openai' | 'anthropic';
  model_name: string;
  key_source: 'platform' | 'own';
  key_position: number;
  success: boolean;
  error_kind: string | null;
  attempt_count: number;
  fallback_used: Generated<boolean>;
  fallback_reason: string | null;
  attempts: Generated<unknown>;
  input_tokens: Generated<number>;
  output_tokens: Generated<number>;
  cached_tokens: Generated<number>;
  usage_missing: Generated<boolean>;
  latency_ms: number | null;
}

/** The daily totals of AI calls (kept for good; the monthly cap is counted from it). Fenced by account_id. */
export interface AiUsageTable {
  account_id: string;
  /** The UTC day, like 2026-11-13. */
  day: string;
  provider: 'gemini' | 'openai' | 'anthropic';
  model_name: string;
  task: string;
  agent_id: string;
  channel: string;
  key_source: 'platform' | 'own';
  calls: Generated<number>;
  failures: Generated<number>;
  fallbacks: Generated<number>;
  input_tokens: Generated<number>;
  output_tokens: Generated<number>;
  cached_tokens: Generated<number>;
}

/** What the daily check found about one of the platform's own keys (by position, never the key). Shared; the app role can only read it. */
export interface AiPlatformKeyChecksTable {
  provider: 'gemini' | 'openai' | 'anthropic';
  key_position: number;
  status: 'working' | 'limited' | 'failed';
  status_note: string | null;
  checked_at: Generated<Date>;
}

/** Which AI warning emails have gone out already (platform-level; only the nightly job touches it). */
export interface AiNoticesSentTable {
  notice_key: string;
  sent_at: Generated<Date>;
}

/** A business. Fenced by its own id. */
export interface AccountsTable {
  id: string;
  name: string;
  industry: Generated<string>;
  time_zone: Generated<string>;
  /** The country a phone number belongs to when typed without a country code, as two capital letters like IN. */
  default_country: Generated<string>;
  /** How many minutes the business promises to call back within while it is open (5 to 120). */
  callback_promise_minutes: Generated<number>;
  /** How many minutes before a task is due its owner is reminded (1 to 1440). */
  task_reminder_minutes: Generated<number>;
  /** How many minutes after a task was due, still open, the managers are told (1 to 1440). */
  task_late_alert_minutes: Generated<number>;
  /** When the business went live (started answering real customers); null until then. */
  live_at: Date | null;
  live_by: Json | null;
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
  /** When the person proved they own the email; empty until then. Written only on the owner connection. */
  email_verified_at: Date | null;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Single-use links we email (verify the email now, reset the password later). Only a hash of each link is stored. */
export interface AuthTokensTable {
  id: string;
  user_id: string;
  purpose: 'verify_email' | 'reset_password';
  token_hash: string;
  created_at: Generated<Date>;
  expires_at: Date;
  used_at: Date | null;
}

/** An invitation to join a business (F02). Only a hash of the emailed link is stored. Fenced by account_id. */
export interface InvitationsTable {
  id: string;
  account_id: string;
  email: string;
  name: string;
  mobile_e164: string | null;
  mobile_key: string | null;
  role: 'manager' | 'staff' | 'staff_own';
  token_hash: string;
  invited_by: string;
  expires_at: Date;
  accepted_at: Date | null;
  cancelled_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Wrong passwords per email typed, for the lockout. Not fenced; closed to the app role instead. */
export interface LoginAttemptsTable {
  email: string;
  failed_count: number;
  window_started_at: Date;
  locked_until: Date | null;
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

/** Which modules a business has: `entitled` by the plan (platform only), `enabled` by the business. Fenced by account_id. */
export interface AccountModulesTable {
  account_id: string;
  module_id: string;
  entitled: Generated<boolean>;
  enabled: Generated<boolean>;
  enabled_at: Date | null;
  disabled_at: Date | null;
  settings: Generated<Json>;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A person the business deals with. Fenced by account_id. `phone_key` is generated by the database from `phone`. */
export interface ContactsTable {
  id: string;
  account_id: string;
  name: string | null;
  phone: string | null;
  phone_key: ColumnType<string | null, never, never>;
  email: string | null;
  language: string | null;
  lifecycle_stage: Generated<'new' | 'lead' | 'customer' | 'repeat_customer' | 'not_a_fit'>;
  deleted_at: Generated<Date | null>;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** The one pipeline of a business (its leads board). Fenced by account_id. */
export interface PipelinesTable {
  id: string;
  account_id: string;
  name: string;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A column of the board. `kind` is open, won or lost. Fenced by account_id. */
export interface PipelineStagesTable {
  id: string;
  account_id: string;
  pipeline_id: string;
  name: string;
  sort: number;
  kind: 'open' | 'won' | 'lost';
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A reason a manager offers when a lead is lost. Fenced by account_id. */
export interface LostReasonsTable {
  id: string;
  account_id: string;
  label: string;
  sort: number;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** How a business shares out new leads (one row per business). Fenced by account_id. */
export interface AssignmentRulesTable {
  account_id: string;
  mode: Generated<'one_person' | 'round_robin' | 'by_offering'>;
  user_id: string | null;
  last_assigned_user_id: string | null;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** The people who take turns when new leads are shared round-robin. Fenced by account_id. */
export interface AssignmentRulePeopleTable {
  account_id: string;
  user_id: string;
  sort: number;
  created_by: Json | null;
  created_at: Generated<Date>;
}

/** One enquiry that might become a sale. Fenced by account_id. Dates come back as text like 2026-12-20. */
export interface LeadsTable {
  id: string;
  account_id: string;
  contact_id: string;
  stage_id: string;
  temperature: Generated<'unscored' | 'hot' | 'warm' | 'cold'>;
  interest: string | null;
  date_from: string | null;
  date_to: string | null;
  party_size: number | null;
  /** Money in paise (whole numbers). Our database setup hands bigint back as a number. */
  budget_paise: number | null;
  promise: string | null;
  callback_at: Date | null;
  owner_user_id: string | null;
  /** The offering the lead is about (an offering of the same business), or null. */
  offering_id: string | null;
  first_channel: Generated<'manual' | 'web_chat' | 'whatsapp' | 'email' | 'phone'>;
  last_activity_at: Generated<Date>;
  lost_reason: string | null;
  closed_at: Date | null;
  deleted_at: Generated<Date | null>;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A request that is not a sale (complaint, callback, question). Fenced by account_id. */
export interface TicketsTable {
  id: string;
  account_id: string;
  contact_id: string;
  title: string;
  details: string | null;
  type: Generated<'callback' | 'question' | 'complaint' | 'existing_customer' | 'other'>;
  priority: Generated<'low' | 'normal' | 'high' | 'urgent'>;
  status: Generated<'open' | 'done'>;
  owner_user_id: string | null;
  conversation_type_key: string | null;
  closed_at: Date | null;
  closed_by: Json | null;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** One reason a person gets in touch, and what happens to such a conversation (docs/CONVERSATION-TYPES.md). Fenced by account_id. */
export interface ConversationTypesTable {
  id: string;
  account_id: string;
  key: string;
  label: string;
  description: string;
  /** A JSON list of short example messages; written as JSON text, read back as a list. */
  examples: ColumnType<unknown, string, string>;
  is_system: Generated<boolean>;
  outcome: 'lead' | 'ticket' | 'log' | 'filter' | 'ignore' | 'review';
  ticket_type: 'callback' | 'question' | 'complaint' | 'existing_customer' | 'other' | null;
  priority: 'low' | 'normal' | 'high' | 'urgent' | null;
  needs_person: Generated<boolean>;
  /** Who to tell and when, as JSON text when written, an object when read. */
  alert: ColumnType<Json | null, string | null, string | null>;
  playbook: Generated<'sales' | 'service' | 'brief_end' | 'emergency'>;
  is_active: Generated<boolean>;
  sort: Generated<number>;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** One conversation on any channel (web chat, WhatsApp, email, phone). Fenced by account_id. */
export interface ConversationsTable {
  id: string;
  account_id: string;
  channel: 'webchat' | 'whatsapp' | 'email' | 'phone';
  /** The other person's phone as digits only, if the channel knew it. */
  from_phone_key: string | null;
  from_email: string | null;
  contact_id: string | null;
  type_key: string | null;
  /** 0 to 1. A numeric column, so it is read back as text and turned into a number by the repository. */
  type_confidence: ColumnType<string | null, number | null | undefined, number | null | undefined>;
  type_source: 'rule' | 'ai_final' | 'staff' | null;
  type_reason: string | null;
  ai_unsure: Generated<boolean>;
  needs_person: Generated<boolean>;
  /** A test chat from "Test the agent": never sorted into a lead or a ticket. */
  is_test: Generated<boolean>;
  status: Generated<'open' | 'sorted'>;
  ended_at: Date | null;
  sorted_at: Date | null;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** The settings of a business's website chat bubble: one row per business, made the first time they are read. Fenced by account_id. */
export interface WebchatSettingsTable {
  account_id: string;
  /** What a visitor's browser knows: finds the business in the public chat routes. Never changes. */
  widget_key: string;
  colour: Generated<string>;
  greeting: Generated<string>;
  position: Generated<'bottom_right' | 'bottom_left'>;
  /** A list of origins like https://nairstays.example. Written as JSON text, read back as a list. */
  allowed_websites: ColumnType<string[], string | undefined, string>;
  phone_number: string | null;
  whatsapp_number: string | null;
  whatsapp_message: string | null;
  /** Which buttons show and in what order (some of chat, call, whatsapp). Written as JSON text, read back as a list. */
  button_order: ColumnType<string[], string | undefined, string>;
  last_seen_website: string | null;
  last_seen_at: Date | null;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** What the AI agent learned in one conversation: the details, the one promise. One row per conversation. Fenced by account_id. */
export interface ConversationFactsTable {
  conversation_id: string;
  account_id: string;
  /** What the customer said, by label. Written as JSON text, read back as an object. */
  details: ColumnType<Json, string, string>;
  situation: Generated<'sale_enquiry' | 'ready_to_book' | 'not_a_sale'>;
  promise_kind: 'call_back_open' | 'call_back_closed' | 'send_confirmation' | 'passed_to_manager' | null;
  promise_sentence: string | null;
  promise_due_at: Date | null;
  promise_made_at: Date | null;
  callback_reason: string | null;
  /** The short summary of the conversation, written once it has ended. */
  summary: string | null;
  summarised_at: Date | null;
  /** A list of texts the tools gave back lately. Written as JSON text, read back as a list. */
  earlier_tool_results: ColumnType<unknown[], string, string>;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** One message of a conversation. Written once, never edited or deleted. Fenced by account_id. */
export interface ConversationMessagesTable {
  id: string;
  account_id: string;
  conversation_id: string;
  sender: 'customer' | 'agent' | 'staff' | 'system';
  body: string;
  channel_message_id: string | null;
  created_at: Generated<Date>;
}

/** What a conversation led to, once per conversation and type. Fenced by account_id. */
export interface ConversationOutcomesTable {
  id: string;
  account_id: string;
  conversation_id: string;
  type_key: string;
  kind: 'lead' | 'ticket' | 'log' | 'filter' | 'ignore' | 'review';
  confidence: ColumnType<string, number, number>;
  ai_unsure: Generated<boolean>;
  lead_id: string | null;
  ticket_id: string | null;
  applied_at: Date | null;
  superseded_at: Date | null;
  /** True when the conversation itself made the lead or ticket (not when it only joined or reopened one). */
  created_record: Generated<boolean>;
  /** The order the outcomes were decided in (the main type first). */
  sort: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A person changing a conversation's type. Written once. Fenced by account_id. */
export interface ClassificationCorrectionsTable {
  id: string;
  account_id: string;
  conversation_id: string;
  from_type_key: string;
  to_type_key: string;
  by_user_id: string;
  created_at: Generated<Date>;
}

/** A phone number or an email a manager never wants treated as a customer. Fenced by account_id. */
export interface BlockListTable {
  id: string;
  account_id: string;
  /** The number as digits only (the same form contacts use); the number with its plus is worked out from it. */
  phone_key: string | null;
  email: string | null;
  reason: string | null;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A note on a ticket. Written once, never edited. Fenced by account_id. */
export interface TicketNotesTable {
  id: string;
  account_id: string;
  ticket_id: string;
  body: string;
  created_by: Json | null;
  created_at: Generated<Date>;
}

/** A to-do with an owner and a due time, about a person and usually one of their leads (F08). Fenced by account_id. */
export interface TasksTable {
  id: string;
  account_id: string;
  contact_id: string;
  lead_id: string | null;
  kind: 'call' | 'whatsapp' | 'email' | 'todo';
  title: string;
  due_at: Date;
  owner_user_id: string;
  done_at: Date | null;
  created_by_agent: string | null;
  reminded_at: Date | null;
  overdue_alerted_at: Date | null;
  deleted_at: Date | null;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** One thing that happened with a person and, usually, one of their leads (a note, or a line the system wrote). Fenced by account_id. */
export interface ActivitiesTable {
  id: string;
  account_id: string;
  contact_id: string;
  lead_id: string | null;
  kind: 'note' | 'lead_created' | 'stage_changed' | 'task_created' | 'task_completed';
  body: string | null;
  by_user_id: string | null;
  by_agent: string | null;
  /** The facts of a system line (stage names, lost reason); empty for notes. */
  details: Json | null;
  /** The event that caused a system line, so a repeated delivery writes nothing twice; empty for notes. */
  source_event_id: string | null;
  edited_at: Date | null;
  deleted_at: Date | null;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** One answer to one business question. Fenced by account_id; the primary key is (account_id, question_key). */
export interface BusinessAnswersTable {
  account_id: string;
  question_key: string;
  /** Any JSON (text, list or object). Read back already parsed; written as JSON text. */
  value: ColumnType<unknown, string, string>;
  source: Generated<'typed' | 'website' | 'listing' | 'document'>;
  source_ref: string | null;
  status: Generated<'check' | 'confirmed'>;
  confirmed_by: Json | null;
  confirmed_at: Date | null;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** How the business wants one situation handled. Fenced by account_id; the primary key is (account_id, situation_key). */
export interface SituationsTable {
  account_id: string;
  situation_key: string;
  choice: string;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** The owner's progress on one setup step. A step with no row is "todo". Fenced by account_id; the primary key is (account_id, step_key). */
export interface SetupStepsTable {
  account_id: string;
  step_key: string;
  status: 'todo' | 'done' | 'skipped';
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** One reading of a website or Google listing by the setup wizard. Fenced by account_id. Holds no page text. */
export interface PrefillRunsTable {
  id: string;
  account_id: string;
  website_url: string | null;
  google_listing_text: string | null;
  status: Generated<'queued' | 'reading' | 'done' | 'failed'>;
  error_code: string | null;
  error_message: string | null;
  pages_read: Generated<number>;
  answers_found: Generated<string[]>;
  answers_skipped: Generated<number>;
  /** Read back already parsed; written as JSON text. */
  suggested_offerings: ColumnType<unknown, string | undefined, string>;
  created_by: Json | null;
  created_at: Generated<Date>;
  finished_at: Date | null;
}

/** Something the business sells. Fenced by account_id. Money in paise; dates come back as text. */
export interface OfferingsTable {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  /** Money in paise (whole numbers). Our database setup hands bigint back as a number. */
  from_price_paise: number | null;
  price_unit: string | null;
  gst_mode: 'included' | 'plus' | 'none' | null;
  season_note: string | null;
  includes: string | null;
  /** A list of { label, value } pairs. Read back already parsed; written as JSON text. */
  details: ColumnType<unknown, string | undefined, string>;
  active: Generated<boolean>;
  sort: number;
  owner_user_id: string | null;
  deleted_at: Generated<Date | null>;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A question and answer the AI may use. Fenced by account_id. Only `confirmed`, live rows are ever searched. */
export interface FaqsTable {
  id: string;
  account_id: string;
  question: string;
  answer: string;
  status: Generated<'confirmed' | 'check'>;
  source: Generated<'typed' | 'website' | 'unanswered'>;
  deleted_at: Generated<Date | null>;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A question customers asked that the AI could not answer, one row per question per business. Fenced by account_id. */
export interface UnansweredQuestionsTable {
  id: string;
  account_id: string;
  question: string;
  group_key: string;
  count: Generated<number>;
  last_asked_at: Generated<Date>;
  answered_at: Generated<Date | null>;
  faq_id: Generated<string | null>;
  ignored_at: Generated<Date | null>;
  /** Set when the nightly job joined this question into another one; the row is then hidden from every list. */
  merged_into_id: Generated<string | null>;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A time-limited promotion. Fenced by account_id. `ends_on` is a plain date like 2026-12-31. */
export interface OffersTable {
  id: string;
  account_id: string;
  text: string;
  ends_on: string;
  deleted_at: Generated<Date | null>;
  created_by: Json | null;
  updated_by: Json | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Tables are added here by the migration that creates them. */
export interface DB {
  schema_migrations: SchemaMigrationsTable;
  domain_events: DomainEventsTable;
  activity_log: ActivityLogTable;
  industries: IndustriesTable;
  ai_models: AiModelsTable;
  ai_task_models: AiTaskModelsTable;
  ai_keys: AiKeysTable;
  ai_settings: AiSettingsTable;
  ai_calls: AiCallsTable;
  ai_usage: AiUsageTable;
  ai_platform_key_checks: AiPlatformKeyChecksTable;
  ai_notices_sent: AiNoticesSentTable;
  accounts: AccountsTable;
  users: UsersTable;
  user_credentials: UserCredentialsTable;
  sessions: SessionsTable;
  auth_tokens: AuthTokensTable;
  invitations: InvitationsTable;
  login_attempts: LoginAttemptsTable;
  account_modules: AccountModulesTable;
  contacts: ContactsTable;
  pipelines: PipelinesTable;
  pipeline_stages: PipelineStagesTable;
  lost_reasons: LostReasonsTable;
  assignment_rules: AssignmentRulesTable;
  assignment_rule_people: AssignmentRulePeopleTable;
  leads: LeadsTable;
  tickets: TicketsTable;
  ticket_notes: TicketNotesTable;
  activities: ActivitiesTable;
  tasks: TasksTable;
  conversation_types: ConversationTypesTable;
  block_list: BlockListTable;
  conversations: ConversationsTable;
  conversation_messages: ConversationMessagesTable;
  conversation_facts: ConversationFactsTable;
  webchat_settings: WebchatSettingsTable;
  conversation_outcomes: ConversationOutcomesTable;
  classification_corrections: ClassificationCorrectionsTable;
  business_answers: BusinessAnswersTable;
  situations: SituationsTable;
  setup_steps: SetupStepsTable;
  prefill_runs: PrefillRunsTable;
  offerings: OfferingsTable;
  offers: OffersTable;
  faqs: FaqsTable;
  unanswered_questions: UnansweredQuestionsTable;
}
