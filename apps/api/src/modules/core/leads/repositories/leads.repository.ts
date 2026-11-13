import { sql } from 'kysely';
import type { StageKind } from '@toobler-one/shared';
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
      first_channel: 'manual',
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
 * One page of leads in the given order (newest activity first when none is given), and how many leads match in all.
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
  const rows = await query.orderBy('lead.id', sorting.order).limit(paging.limit).offset(paging.offset).execute();
  const countRow = await selectLeadRows(db, filters)
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  return { rows: rows.map(toLeadRow), total: Number(countRow.total) };
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
