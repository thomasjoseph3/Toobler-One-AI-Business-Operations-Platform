import type { StageKind } from '@toobler-one/shared';
import { sql } from 'kysely';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';

// The SQL for the `leads` table (one enquiry that might become a sale). More functions arrive with the lead routes; for
// now it holds what removing a pipeline stage needs.

/** How many leads are in a stage that are not deleted. */
export async function countLiveLeadsInStage(db: Db, accountId: string, stageId: string): Promise<number> {
  const countRow = await db
    .selectFrom('leads')
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .where('account_id', '=', accountId)
    .where('stage_id', '=', stageId)
    .where('deleted_at', 'is', null)
    .executeTakeFirstOrThrow();
  return Number(countRow.total);
}

/**
 * Moves every lead of one stage into another, deleted leads included (a deleted lead still points at its stage, so the
 * stage could not be removed otherwise). A tidy-up of the board is not contact with the customer, so "last activity" is left
 * alone. Returns nothing.
 */
export async function moveAllLeadsToStage(
  db: Db,
  options: { accountId: string; fromStageId: string; toStageId: string; actor: Actor },
): Promise<void> {
  await db
    .updateTable('leads')
    .set({
      stage_id: options.toStageId,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
      updated_at: new Date(),
    })
    .where('account_id', '=', options.accountId)
    .where('stage_id', '=', options.fromStageId)
    .execute();
}

/** A lead as the database holds it, with the name and kind of its stage. The service turns it into the API's Lead. */
export interface LeadRow {
  id: string;
  contactId: string;
  stageId: string;
  stageName: string;
  stageKind: StageKind;
  temperature: 'unscored' | 'hot' | 'warm' | 'cold';
  temperatureReason: string | null;
  temperatureSetBy: 'rules' | 'manual' | null;
  askedPrice: boolean;
  askedToBook: boolean;
  interest: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  partySize: number | null;
  budgetPaise: number | null;
  promise: string | null;
  callbackAt: Date | null;
  ownerUserId: string | null;
  offeringId: string | null;
  firstChannel: 'manual' | 'web_chat' | 'whatsapp' | 'email' | 'phone';
  lastActivityAt: Date;
  lostReason: string | null;
  closedAt: Date | null;
  /** The stored answers to custom fields, removed fields' answers included (the service hides those). */
  custom: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Which leads a list or a board column should hold. A filter that is left out does not narrow anything. */
export interface LeadFilters {
  accountId: string;
  stageId?: string | undefined;
  ownerUserId?: string | undefined;
  contactId?: string | undefined;
  offeringId?: string | undefined;
  /** `open` = not closed; `closed` = won or lost. */
  status?: 'open' | 'closed' | undefined;
  /** For the "own leads only" role: only the leads this person owns. Left out, every lead of the business. */
  visibleToUserId?: string | undefined;
}

/** The query every lead read starts from: live leads of the business, each joined to its stage, narrowed by the filters. */
function selectLeadRows(db: Db, filters: LeadFilters) {
  let query = db
    .selectFrom('leads as lead')
    .innerJoin('pipeline_stages as stage', 'stage.id', 'lead.stage_id')
    .where('lead.account_id', '=', filters.accountId)
    .where('lead.deleted_at', 'is', null);
  if (filters.stageId) query = query.where('lead.stage_id', '=', filters.stageId);
  if (filters.ownerUserId) query = query.where('lead.owner_user_id', '=', filters.ownerUserId);
  if (filters.contactId) query = query.where('lead.contact_id', '=', filters.contactId);
  if (filters.offeringId) query = query.where('lead.offering_id', '=', filters.offeringId);
  if (filters.visibleToUserId) query = query.where('lead.owner_user_id', '=', filters.visibleToUserId);
  if (filters.status === 'open') query = query.where('lead.closed_at', 'is', null);
  if (filters.status === 'closed') query = query.where('lead.closed_at', 'is not', null);
  return query;
}

/** The columns of a lead (and its stage) that every read returns. */
const LEAD_COLUMNS = [
  'lead.id',
  'lead.contact_id',
  'lead.stage_id',
  'stage.name as stage_name',
  'stage.kind as stage_kind',
  'lead.temperature',
  'lead.temperature_reason',
  'lead.temperature_set_by',
  'lead.asked_price',
  'lead.asked_to_book',
  'lead.interest',
  'lead.date_from',
  'lead.date_to',
  'lead.party_size',
  'lead.budget_paise',
  'lead.promise',
  'lead.callback_at',
  'lead.owner_user_id',
  'lead.offering_id',
  'lead.first_channel',
  'lead.last_activity_at',
  'lead.lost_reason',
  'lead.closed_at',
  'lead.custom',
  'lead.created_at',
  'lead.updated_at',
] as const;

/** Turns a database row into a LeadRow. */
function toLeadRow(row: {
  id: string;
  contact_id: string;
  stage_id: string;
  stage_name: string;
  stage_kind: StageKind;
  temperature: LeadRow['temperature'];
  temperature_reason: string | null;
  temperature_set_by: LeadRow['temperatureSetBy'];
  asked_price: boolean;
  asked_to_book: boolean;
  interest: string | null;
  date_from: string | null;
  date_to: string | null;
  party_size: number | null;
  budget_paise: number | null;
  promise: string | null;
  callback_at: Date | null;
  owner_user_id: string | null;
  offering_id: string | null;
  first_channel: LeadRow['firstChannel'];
  last_activity_at: Date;
  lost_reason: string | null;
  closed_at: Date | null;
  custom: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}): LeadRow {
  return {
    id: row.id,
    contactId: row.contact_id,
    stageId: row.stage_id,
    stageName: row.stage_name,
    stageKind: row.stage_kind,
    temperature: row.temperature,
    temperatureReason: row.temperature_reason,
    temperatureSetBy: row.temperature_set_by,
    askedPrice: row.asked_price,
    askedToBook: row.asked_to_book,
    interest: row.interest,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    partySize: row.party_size,
    budgetPaise: row.budget_paise,
    promise: row.promise,
    callbackAt: row.callback_at,
    ownerUserId: row.owner_user_id,
    offeringId: row.offering_id,
    firstChannel: row.first_channel,
    lastActivityAt: row.last_activity_at,
    lostReason: row.lost_reason,
    closedAt: row.closed_at,
    custom: row.custom,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Adds a lead. The caller has already checked the contact, the stage and the one-open-lead rule. */
export async function insertLead(
  db: Db,
  lead: {
    id: string;
    accountId: string;
    contactId: string;
    stageId: string;
    interest: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    partySize: number | null;
    budgetPaise: number | null;
    promise: string | null;
    callbackAt: Date | null;
    ownerUserId: string | null;
    offeringId: string | null;
    /** The channel the lead first came in on; leads added by hand are `manual`. */
    firstChannel?: LeadRow['firstChannel'];
    /** The answers to custom fields, already checked (left out: none). */
    custom?: Record<string, unknown>;
    actor: Actor;
  },
): Promise<void> {
  const actorStamp = { kind: lead.actor.kind, id: lead.actor.id };
  await db
    .insertInto('leads')
    .values({
      id: lead.id,
      account_id: lead.accountId,
      contact_id: lead.contactId,
      stage_id: lead.stageId,
      interest: lead.interest,
      date_from: lead.dateFrom,
      date_to: lead.dateTo,
      party_size: lead.partySize,
      budget_paise: lead.budgetPaise,
      promise: lead.promise,
      callback_at: lead.callbackAt,
      owner_user_id: lead.ownerUserId,
      offering_id: lead.offeringId,
      first_channel: lead.firstChannel ?? 'manual',
      custom: JSON.stringify(lead.custom ?? {}),
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/**
 * One live lead of the business, or undefined (also for a deleted lead or another business's lead). With `visibleToUserId`
 * (the "own leads only" role) a lead owned by someone else is undefined too.
 */
export async function findLeadById(
  db: Db,
  accountId: string,
  leadId: string,
  visibleToUserId?: string,
): Promise<LeadRow | undefined> {
  const row = await selectLeadRows(db, { accountId, visibleToUserId })
    .select(LEAD_COLUMNS)
    .where('lead.id', '=', leadId)
    .executeTakeFirst();
  return row ? toLeadRow(row) : undefined;
}

/** What a list can be ordered by, and which way. */
export interface LeadSorting {
  sort: 'lastActivity' | 'createdAt' | 'callbackAt' | 'stage';
  order: 'asc' | 'desc';
}

/** The order a board column uses: newest activity first. */
const NEWEST_ACTIVITY_FIRST: LeadSorting = { sort: 'lastActivity', order: 'desc' };

/**
 * One page of leads in the given order (newest activity first when none is given), and how many leads match in all (one database call).
 * The lead's id is always the last tie-breaker, so the order is the same on every page.
 */
export async function listLeadRows(
  db: Db,
  filters: LeadFilters,
  paging: { limit: number; offset: number },
  sorting: LeadSorting = NEWEST_ACTIVITY_FIRST,
): Promise<{ rows: LeadRow[]; total: number }> {
  let query = selectLeadRows(db, filters).select(LEAD_COLUMNS);
  if (sorting.sort === 'lastActivity') query = query.orderBy('lead.last_activity_at', sorting.order);
  if (sorting.sort === 'createdAt') query = query.orderBy('lead.created_at', sorting.order);
  // Leads with no callback date always come last, whichever way the dates are ordered
  if (sorting.sort === 'callbackAt') {
    const callbackOrder =
      sorting.order === 'asc' ? sql`lead.callback_at asc nulls last` : sql`lead.callback_at desc nulls last`;
    query = query.orderBy(callbackOrder);
  }
  if (sorting.sort === 'stage') query = query.orderBy('stage.sort', sorting.order);
  // The total comes back in the same call as the page: `count(*) over ()` counts every matching lead before the page is cut,
  // so the list needs one database call fewer (each call costs a round trip, which is slow when the database is far away).
  const rows = await query
    .select(sql<string>`count(*) over ()`.as('total_matching'))
    .orderBy('lead.id', sorting.order)
    .limit(paging.limit)
    .offset(paging.offset)
    .execute();
  const firstRow = rows[0];
  if (firstRow) return { rows: rows.map(toLeadRow), total: Number(firstRow.total_matching) };
  // No rows came back, so there was no row to carry the total. That is 0 leads in all, unless the page asked for lies past
  // the last one (page 5 of 3), where the real total is still wanted: count then.
  if (paging.offset === 0) return { rows: [], total: 0 };
  const countRow = await selectLeadRows(db, filters)
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  return { rows: [], total: Number(countRow.total) };
}

/**
 * The person's newest lead for the one-open-lead rule: their open lead if they have one, otherwise the one closed most
 * recently. Undefined if they have never had a lead.
 */
export async function findLatestLeadForContact(
  db: Db,
  accountId: string,
  contactId: string,
): Promise<{ id: string; stageKind: StageKind; closedAt: Date | null } | undefined> {
  const row = await db
    .selectFrom('leads as lead')
    .innerJoin('pipeline_stages as stage', 'stage.id', 'lead.stage_id')
    .select(['lead.id', 'stage.kind as stage_kind', 'lead.closed_at'])
    .where('lead.account_id', '=', accountId)
    .where('lead.contact_id', '=', contactId)
    .where('lead.deleted_at', 'is', null)
    // Open leads have no closed_at, so "nulls first" puts them ahead of every closed lead
    .orderBy(sql`lead.closed_at desc nulls first`)
    .limit(1)
    .executeTakeFirst();
  return row ? { id: row.id, stageKind: row.stage_kind, closedAt: row.closed_at } : undefined;
}

/** How many open and how many won leads the person has (deleted leads do not count). */
export async function countOpenAndWonLeadsForContact(
  db: Db,
  accountId: string,
  contactId: string,
): Promise<{ openLeads: number; wonLeads: number }> {
  const rows = await db
    .selectFrom('leads as lead')
    .innerJoin('pipeline_stages as stage', 'stage.id', 'lead.stage_id')
    .select(['stage.kind as stage_kind', (expression) => expression.fn.countAll<string>().as('total')])
    .where('lead.account_id', '=', accountId)
    .where('lead.contact_id', '=', contactId)
    .where('lead.deleted_at', 'is', null)
    .groupBy('stage.kind')
    .execute();
  const countFor = (kind: StageKind) => Number(rows.find((row) => row.stage_kind === kind)?.total ?? 0);
  return { openLeads: countFor('open'), wonLeads: countFor('won') };
}

/**
 * Locks one live lead of the business until the transaction ends, so two edits at once take turns instead of overwriting
 * each other. Returns false if there is no such live lead (also for another business's lead, or, with `visibleToUserId`, one
 * owned by someone else). Only the lead row is locked,
 * not its stage, so edits to other leads of the same stage are not held up.
 */
export async function lockLeadForUpdate(
  db: Db,
  accountId: string,
  leadId: string,
  visibleToUserId?: string,
): Promise<boolean> {
  let query = db
    .selectFrom('leads')
    .select('id')
    .where('account_id', '=', accountId)
    .where('id', '=', leadId)
    .where('deleted_at', 'is', null);
  // The "own leads only" role can only lock (and so only change) leads it owns
  if (visibleToUserId) query = query.where('owner_user_id', '=', visibleToUserId);
  const row = await query.forUpdate().executeTakeFirst();
  return row !== undefined;
}

/** The new values of a lead's details. A key that is left out is not touched; `null` clears the field. */
export interface LeadDetailChanges {
  interest?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  partySize?: number | null;
  budgetPaise?: number | null;
  promise?: string | null;
  callbackAt?: Date | null;
  offeringId?: string | null;
  /** The whole new set of answers (the service merges what was sent into what is stored). */
  custom?: Record<string, unknown>;
}

/** Changes the listed details of a live lead and stamps who did it. "Last activity" is left alone: editing is not contact with the customer. */
export async function updateLeadDetails(
  db: Db,
  options: { accountId: string; leadId: string; changes: LeadDetailChanges; actor: Actor },
): Promise<void> {
  const { changes } = options;
  await db
    .updateTable('leads')
    .set({
      ...(changes.interest !== undefined ? { interest: changes.interest } : {}),
      ...(changes.dateFrom !== undefined ? { date_from: changes.dateFrom } : {}),
      ...(changes.dateTo !== undefined ? { date_to: changes.dateTo } : {}),
      ...(changes.partySize !== undefined ? { party_size: changes.partySize } : {}),
      ...(changes.budgetPaise !== undefined ? { budget_paise: changes.budgetPaise } : {}),
      ...(changes.promise !== undefined ? { promise: changes.promise } : {}),
      ...(changes.callbackAt !== undefined ? { callback_at: changes.callbackAt } : {}),
      ...(changes.offeringId !== undefined ? { offering_id: changes.offeringId } : {}),
      ...(changes.custom !== undefined ? { custom: JSON.stringify(changes.custom) } : {}),
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.leadId)
    .where('deleted_at', 'is', null)
    .execute();
}

/**
 * Puts a live lead in another stage. Winning or losing closes it (`closedAt` set; `lostReason` is the reason's words for a
 * lost lead); moving to an open stage reopens it (both cleared). A move counts as activity on the lead.
 */
export async function moveLeadToStage(
  db: Db,
  options: {
    accountId: string;
    leadId: string;
    stageId: string;
    closedAt: Date | null;
    lostReason: string | null;
    movedAt: Date;
    actor: Actor;
  },
): Promise<void> {
  await db
    .updateTable('leads')
    .set({
      stage_id: options.stageId,
      closed_at: options.closedAt,
      lost_reason: options.lostReason,
      last_activity_at: options.movedAt,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.leadId)
    .where('deleted_at', 'is', null)
    .execute();
}

/** Gives a live lead a new owner (or no owner) and stamps who did it. Assigning is not activity on the lead, so "last activity" stays. */
export async function setLeadOwner(
  db: Db,
  options: { accountId: string; leadId: string; ownerUserId: string | null; actor: Actor },
): Promise<void> {
  await db
    .updateTable('leads')
    .set({
      owner_user_id: options.ownerUserId,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.leadId)
    .where('deleted_at', 'is', null)
    .execute();
}

/** Hides a live lead (the row stays) and stamps who did it. Returns false if there is no such live lead. */
export async function softDeleteLead(
  db: Db,
  options: { accountId: string; leadId: string; actor: Actor },
): Promise<boolean> {
  const row = await db
    .updateTable('leads')
    .set({ deleted_at: new Date(), updated_by: { kind: options.actor.kind, id: options.actor.id } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.leadId)
    .where('deleted_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/** The ids, among these, of live leads of the business; with `visibleToUserId` (the "own leads only" role) only the ones that person owns. */
export async function listVisibleLeadIds(
  db: Db,
  accountId: string,
  leadIds: string[],
  visibleToUserId?: string,
): Promise<string[]> {
  if (leadIds.length === 0) return [];
  let query = db
    .selectFrom('leads')
    .select('id')
    .where('account_id', '=', accountId)
    .where('deleted_at', 'is', null)
    .where('id', 'in', leadIds);
  if (visibleToUserId !== undefined) query = query.where('owner_user_id', '=', visibleToUserId);
  return (await query.execute()).map((row) => row.id);
}

/** Gives every OPEN, live lead of a person to another person (a won or lost lead keeps its owner, as history). Returns how many leads moved. Run it inside the business's fence. */
export async function handOverOpenLeads(
  db: Db,
  options: { accountId: string; fromUserId: string; toUserId: string; actor: Actor },
): Promise<number> {
  const rows = await db
    .updateTable('leads')
    .set({
      owner_user_id: options.toUserId,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('owner_user_id', '=', options.fromUserId)
    .where('closed_at', 'is', null)
    .where('deleted_at', 'is', null)
    .returning('id')
    .execute();
  return rows.length;
}

/** For each of these contacts (with `visibleToUserId`, counting only the leads that person owns): how many open leads and how many won leads they have, and the combined budget of the won ones in paise (deleted leads do not count). Contacts with no leads are left out. */
export async function summariseLeadsOfContacts(
  db: Db,
  accountId: string,
  contactIds: string[],
  visibleToUserId?: string,
): Promise<Array<{ contactId: string; openLeads: number; wonLeads: number; wonValuePaise: number }>> {
  if (contactIds.length === 0) return [];
  let query = db
    .selectFrom('leads as lead')
    .innerJoin('pipeline_stages as stage', 'stage.id', 'lead.stage_id')
    .select([
      'lead.contact_id',
      sql<string>`count(*) filter (where stage.kind = 'open')`.as('open_leads'),
      sql<string>`count(*) filter (where stage.kind = 'won')`.as('won_leads'),
      sql<string>`coalesce(sum(lead.budget_paise) filter (where stage.kind = 'won'), 0)`.as('won_value'),
    ])
    .where('lead.account_id', '=', accountId)
    .where('lead.contact_id', 'in', contactIds)
    .where('lead.deleted_at', 'is', null);
  // The "own leads only" role adds up only the leads it owns
  if (visibleToUserId) query = query.where('lead.owner_user_id', '=', visibleToUserId);
  const rows = await query.groupBy('lead.contact_id').execute();
  return rows.map((row) => ({
    contactId: row.contact_id,
    openLeads: Number(row.open_leads),
    wonLeads: Number(row.won_leads),
    wonValuePaise: Number(row.won_value),
  }));
}

/** The live leads of these contacts, newest first. With `visibleToUserId` (the "own leads only" role) only the ones that person owns. */
export async function listLeadsOfContacts(
  db: Db,
  options: { accountId: string; contactIds: string[]; visibleToUserId?: string },
): Promise<LeadRow[]> {
  if (options.contactIds.length === 0) return [];
  const rows = await selectLeadRows(db, { accountId: options.accountId, visibleToUserId: options.visibleToUserId })
    .select(LEAD_COLUMNS)
    .where('lead.contact_id', 'in', options.contactIds)
    .orderBy('lead.created_at', 'desc')
    .orderBy('lead.id', 'desc')
    .execute();
  return rows.map(toLeadRow);
}

/**
 * Deletes one custom field's answer from every lead of the business (the purge of a removed field). Records without that answer are not
 * touched. Returns how many records changed.
 */
export async function removeCustomAnswerKey(
  db: Db,
  options: { accountId: string; key: string; actor: Actor },
): Promise<number> {
  const result = await db
    .updateTable('leads')
    .set({
      custom: sql<string>`custom - ${options.key}::text`,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where(sql<boolean>`jsonb_exists(custom, ${options.key})`)
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
}

/**
 * Adds answers to a live lead's custom fields, but only for keys it has no answer for yet (what staff typed is never overridden by what the AI
 * heard). One statement, so running it twice gives the same result. Returns whether the lead exists.
 */
export async function addCustomAnswersWhereEmpty(
  db: Db,
  options: { accountId: string; leadId: string; answers: Record<string, unknown>; actor: Actor },
): Promise<boolean> {
  const row = await db
    .updateTable('leads')
    .set({
      // "new answers || stored answers": on a key in both, the stored one wins
      custom: sql<string>`${JSON.stringify(options.answers)}::jsonb || custom`,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.leadId)
    .where('deleted_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return row !== undefined;
}

/** Sets a live lead's temperature, the reason and who decided it, and stamps who did it. Scoring is not contact with the customer, so "last activity" stays. */
export async function setLeadTemperature(
  db: Db,
  options: {
    accountId: string;
    leadId: string;
    temperature: 'hot' | 'warm' | 'cold';
    reason: string;
    setBy: 'rules' | 'manual';
    actor: Actor;
  },
): Promise<void> {
  await db
    .updateTable('leads')
    .set({
      temperature: options.temperature,
      temperature_reason: options.reason,
      temperature_set_by: options.setBy,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.leadId)
    .where('deleted_at', 'is', null)
    .execute();
}

/**
 * Adds what a conversation taught us about a live lead: "asked the price" and "asked to book" are only ever switched on (never off), and the
 * dates are filled in only when the lead has none (what staff typed is never overridden). Does not touch "last activity" or the temperature.
 */
export async function addConversationFactsToLead(
  db: Db,
  options: {
    accountId: string;
    leadId: string;
    askedPrice: boolean;
    askedToBook: boolean;
    dateFrom: string | null;
    dateTo: string | null;
    actor: Actor;
  },
): Promise<void> {
  await db
    .updateTable('leads')
    .set({
      asked_price: sql<boolean>`asked_price OR ${options.askedPrice}`,
      asked_to_book: sql<boolean>`asked_to_book OR ${options.askedToBook}`,
      // The last day only comes with a first day, and only when the lead has no dates at all
      date_from: sql<string | null>`coalesce(date_from, ${options.dateFrom}::date)`,
      date_to: sql<string | null>`CASE WHEN date_from IS NULL THEN ${options.dateTo}::date ELSE date_to END`,
      updated_by: { kind: options.actor.kind, id: options.actor.id },
    })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.leadId)
    .where('deleted_at', 'is', null)
    .execute();
}
