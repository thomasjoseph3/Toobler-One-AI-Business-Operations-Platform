import { sql } from 'kysely';
import type { Database } from '../../src/kernel/database';
import { computeLifecycleStage } from '../../src/modules/core/contacts/helpers/lifecycle';
import { getQuestionsForIndustry } from '../../src/modules/core/knowledge/helpers/question-set';
import { SITUATIONS } from '../../src/modules/core/knowledge/helpers/situations';

// The consistency checker: looks at EVERYTHING one business has in the database and lists every fact that does not add up.
// Journey tests call it after telling a story, so a bug that leaves data disconnected, duplicated or leaking shows up even
// when no single route test would catch it. Many of these rules are also enforced by the database itself (constraints and
// indexes); they are checked here again on purpose, so if a constraint is ever dropped by a later migration, a test notices.
//
// It runs on the owner connection (it sees every row), always filtered to one business. To add a rule: add a function that
// returns the problems it finds in plain words, and add it to `checks` at the bottom.

/** Runs one query on the owner connection and returns its rows. */
async function rowsOf<Row>(database: Database, query: ReturnType<typeof sql<Row>>): Promise<Row[]> {
  return (await query.execute(database.system)).rows;
}

type Check = (database: Database, accountId: string) => Promise<string[]>;

// ---------------------------------------------------------------------------------------------------- contacts

const contactsAreNotDuplicated: Check = async (database, accountId) => {
  const phones = await rowsOf<{ phone_key: string; total: number }>(
    database,
    sql`select phone_key, count(*)::int as total from app.contacts
        where account_id = ${accountId} and deleted_at is null and phone_key is not null
        group by phone_key having count(*) > 1`,
  );
  const emails = await rowsOf<{ email: string; total: number }>(
    database,
    sql`select email, count(*)::int as total from app.contacts
        where account_id = ${accountId} and deleted_at is null and email is not null
        group by email having count(*) > 1`,
  );
  return [
    ...phones.map((row) => `${row.total} live contacts share the phone ${row.phone_key}`),
    ...emails.map((row) => `${row.total} live contacts share the email ${row.email}`),
  ];
};

const contactLifecycleMatchesTheirLeads: Check = async (database, accountId) => {
  const rows = await rowsOf<{ id: string; lifecycle_stage: string; open_leads: number; won_leads: number }>(
    database,
    sql`select c.id, c.lifecycle_stage,
          count(*) filter (where l.id is not null and l.closed_at is null)::int as open_leads,
          count(*) filter (where l.id is not null and s.kind = 'won')::int as won_leads
        from app.contacts c
        left join app.leads l on l.contact_id = c.id and l.account_id = c.account_id and l.deleted_at is null
        left join app.pipeline_stages s on s.id = l.stage_id
        where c.account_id = ${accountId} and c.deleted_at is null
        group by c.id, c.lifecycle_stage`,
  );
  return rows
    .filter((row) => row.lifecycle_stage !== 'not_a_fit') // staff's own decision always wins
    .map((row) => ({
      row,
      expected: computeLifecycleStage({ markedNotAFit: false, openLeads: row.open_leads, wonLeads: row.won_leads }),
    }))
    .filter(({ row, expected }) => row.lifecycle_stage !== expected)
    .map(
      ({ row, expected }) =>
        `contact ${row.id} is "${row.lifecycle_stage}" but its leads (${row.open_leads} open, ${row.won_leads} won) say "${expected}"`,
    );
};

// ------------------------------------------------------------------------------------------------ pipeline, leads

const pipelineHasItsShape: Check = async (database, accountId) => {
  const problems: string[] = [];
  const pipelines = await rowsOf<{ id: string }>(
    database,
    sql`select id from app.pipelines where account_id = ${accountId}`,
  );
  if (pipelines.length !== 1) problems.push(`the business has ${pipelines.length} pipelines, not one`);
  for (const pipeline of pipelines) {
    const stages = await rowsOf<{ id: string; name: string; kind: string; sort: number; account_id: string }>(
      database,
      sql`select id, name, kind, sort, account_id from app.pipeline_stages where pipeline_id = ${pipeline.id} order by sort`,
    );
    if (stages.some((stage) => stage.account_id !== accountId)) problems.push('a stage belongs to another business');
    const kinds = stages.map((stage) => stage.kind);
    if (kinds.filter((kind) => kind === 'won').length !== 1)
      problems.push('the pipeline does not have exactly one Won stage');
    if (kinds.filter((kind) => kind === 'lost').length !== 1)
      problems.push('the pipeline does not have exactly one Lost stage');
    if (kinds.slice(-2).join() !== 'won,lost')
      problems.push(`Won and Lost are not the last two stages (order: ${kinds.join(', ')})`);
    if (new Set(stages.map((stage) => stage.sort)).size !== stages.length) problems.push('two stages share a position');
    const names = stages.map((stage) => stage.name.toLowerCase());
    if (new Set(names).size !== names.length) problems.push('two stages have the same name');
  }
  const reasons = await rowsOf<{ label: string }>(
    database,
    sql`select label from app.lost_reasons where account_id = ${accountId}`,
  );
  const labels = reasons.map((reason) => reason.label.toLowerCase());
  if (new Set(labels).size !== labels.length) problems.push('two lost reasons have the same words');
  return problems;
};

const leadsAreInOrder: Check = async (database, accountId) => {
  const problems: string[] = [];
  const openContacts = await rowsOf<{ contact_id: string; total: number }>(
    database,
    sql`select contact_id, count(*)::int as total from app.leads
        where account_id = ${accountId} and closed_at is null and deleted_at is null
        group by contact_id having count(*) > 1`,
  );
  problems.push(...openContacts.map((row) => `contact ${row.contact_id} has ${row.total} open leads`));

  const closedMismatch = await rowsOf<{ id: string }>(
    database,
    sql`select l.id from app.leads l join app.pipeline_stages s on s.id = l.stage_id
        where l.account_id = ${accountId} and l.deleted_at is null and ((s.kind <> 'open') <> (l.closed_at is not null))`,
  );
  problems.push(
    ...closedMismatch.map((row) => `lead ${row.id}: being closed and being in a Won or Lost stage disagree`),
  );

  const reasonMismatch = await rowsOf<{ id: string }>(
    database,
    sql`select l.id from app.leads l join app.pipeline_stages s on s.id = l.stage_id
        where l.account_id = ${accountId} and l.deleted_at is null and ((s.kind = 'lost') <> (l.lost_reason is not null))`,
  );
  problems.push(
    ...reasonMismatch.map((row) => `lead ${row.id} has a lost reason exactly when it is not in the Lost stage`),
  );

  const crossBusiness = await rowsOf<{ id: string; what: string }>(
    database,
    sql`select l.id, 'contact' as what from app.leads l join app.contacts c on c.id = l.contact_id
          where l.account_id = ${accountId} and c.account_id <> l.account_id
        union all
        select l.id, 'stage' from app.leads l join app.pipeline_stages s on s.id = l.stage_id
          where l.account_id = ${accountId} and s.account_id <> l.account_id
        union all
        select l.id, 'owner' from app.leads l join app.users u on u.id = l.owner_user_id
          where l.account_id = ${accountId} and u.account_id <> l.account_id`,
  );
  problems.push(...crossBusiness.map((row) => `lead ${row.id} points at a ${row.what} of another business`));

  const liveLeadOfDeletedContact = await rowsOf<{ id: string }>(
    database,
    sql`select l.id from app.leads l join app.contacts c on c.id = l.contact_id
        where l.account_id = ${accountId} and l.deleted_at is null and l.closed_at is null and c.deleted_at is not null`,
  );
  problems.push(...liveLeadOfDeletedContact.map((row) => `open lead ${row.id} belongs to a deleted contact`));
  return problems;
};

const sharingOutPointsAtThePeopleOfTheBusiness: Check = async (database, accountId) => {
  const rows = await rowsOf<{ what: string }>(
    database,
    sql`select 'a person in the turn list' as what from app.assignment_rule_people p join app.users u on u.id = p.user_id
          where p.account_id = ${accountId} and u.account_id <> p.account_id
        union all
        select 'the rule''s person' from app.assignment_rules r join app.users u on u.id = r.user_id
          where r.account_id = ${accountId} and u.account_id <> r.account_id
        union all
        select 'the last person given a lead' from app.assignment_rules r join app.users u on u.id = r.last_assigned_user_id
          where r.account_id = ${accountId} and u.account_id <> r.account_id`,
  );
  return rows.map((row) => `${row.what} works for another business`);
};

// ------------------------------------------------------------------------------------------------------ tickets

const ticketsAreInOrder: Check = async (database, accountId) => {
  const problems: string[] = [];
  const statusMismatch = await rowsOf<{ id: string }>(
    database,
    sql`select id from app.tickets where account_id = ${accountId}
        and ((status = 'done') <> (closed_at is not null) or (status = 'done') <> (closed_by is not null))`,
  );
  problems.push(...statusMismatch.map((row) => `ticket ${row.id}: done, closing time and closing person do not agree`));

  const crossBusiness = await rowsOf<{ id: string; what: string }>(
    database,
    sql`select t.id, 'contact' as what from app.tickets t join app.contacts c on c.id = t.contact_id
          where t.account_id = ${accountId} and c.account_id <> t.account_id
        union all
        select t.id, 'owner' from app.tickets t join app.users u on u.id = t.owner_user_id
          where t.account_id = ${accountId} and u.account_id <> t.account_id
        union all
        select n.ticket_id, 'note' from app.ticket_notes n join app.tickets t on t.id = n.ticket_id
          where n.account_id = ${accountId} and t.account_id <> n.account_id`,
  );
  problems.push(...crossBusiness.map((row) => `ticket ${row.id} points at a ${row.what} of another business`));

  const closedByStranger = await rowsOf<{ id: string }>(
    database,
    sql`select t.id from app.tickets t
        where t.account_id = ${accountId} and t.closed_by->>'kind' = 'user'
          and not exists (select 1 from app.users u where u.id::text = t.closed_by->>'id' and u.account_id = t.account_id)`,
  );
  problems.push(
    ...closedByStranger.map((row) => `ticket ${row.id} was closed by someone who does not work for the business`),
  );
  return problems;
};

// ----------------------------------------------------------------------------------------- offerings and offers

const offeringsAndOffersAreInOrder: Check = async (database, accountId) => {
  const problems: string[] = [];
  const duplicateNames = await rowsOf<{ name: string; total: number }>(
    database,
    sql`select lower(name) as name, count(*)::int as total from app.offerings
        where account_id = ${accountId} and deleted_at is null group by lower(name) having count(*) > 1`,
  );
  problems.push(...duplicateNames.map((row) => `${row.total} live offerings are called "${row.name}"`));

  const sharedPositions = await rowsOf<{ sort: number; total: number }>(
    database,
    sql`select sort, count(*)::int as total from app.offerings
        where account_id = ${accountId} and deleted_at is null group by sort having count(*) > 1`,
  );
  problems.push(...sharedPositions.map((row) => `${row.total} live offerings share the position ${row.sort}`));

  const halfPrices = await rowsOf<{ id: string }>(
    database,
    sql`select id from app.offerings where account_id = ${accountId}
        and ((from_price_paise is null) <> (price_unit is null) or (from_price_paise is null) <> (gst_mode is null))`,
  );
  problems.push(...halfPrices.map((row) => `offering ${row.id} has a half-described price`));

  const tooManyDetails = await rowsOf<{ id: string }>(
    database,
    sql`select id from app.offerings where account_id = ${accountId} and jsonb_array_length(details) > 10`,
  );
  problems.push(...tooManyDetails.map((row) => `offering ${row.id} has more than 10 details`));

  const crossBusiness = await rowsOf<{ id: string; what: string }>(
    database,
    sql`select o.id, 'owner' as what from app.offerings o join app.users u on u.id = o.owner_user_id
          where o.account_id = ${accountId} and u.account_id <> o.account_id
        union all
        select l.id, 'offering' from app.leads l join app.offerings o on o.id = l.offering_id
          where l.account_id = ${accountId} and o.account_id <> l.account_id`,
  );
  problems.push(...crossBusiness.map((row) => `${row.id} points at an ${row.what} of another business`));

  const rule = await rowsOf<{ mode: string; user_id: string | null }>(
    database,
    sql`select mode, user_id from app.assignment_rules where account_id = ${accountId}`,
  );
  for (const row of rule) {
    if (row.mode !== 'round_robin' && row.user_id === null)
      problems.push(`the sharing-out rule is "${row.mode}" but names nobody`);
  }
  return problems;
};

// ------------------------------------------------------------------------ FAQs and unanswered questions

const faqsAndUnansweredQuestionsAreInOrder: Check = async (database, accountId) => {
  const problems: string[] = [];
  const duplicateQuestions = await rowsOf<{ question: string; total: number }>(
    database,
    sql`select lower(question) as question, count(*)::int as total from app.faqs
        where account_id = ${accountId} and deleted_at is null group by lower(question) having count(*) > 1`,
  );
  problems.push(...duplicateQuestions.map((row) => `${row.total} live FAQs ask "${row.question}"`));

  // A question that was answered must point at an FAQ that is still there (removing the FAQ opens the question again)
  const answeredWithoutFaq = await rowsOf<{ id: string }>(
    database,
    sql`select q.id from app.unanswered_questions q
        where q.account_id = ${accountId} and q.answered_at is not null
          and not exists (select 1 from app.faqs f where f.id = q.faq_id and f.account_id = q.account_id and f.deleted_at is null)`,
  );
  problems.push(...answeredWithoutFaq.map((row) => `unanswered question ${row.id} is answered by an FAQ that is gone`));

  const openWithFaq = await rowsOf<{ id: string }>(
    database,
    sql`select id from app.unanswered_questions
        where account_id = ${accountId} and answered_at is null and faq_id is not null`,
  );
  problems.push(...openWithFaq.map((row) => `unanswered question ${row.id} is open but points at an FAQ`));

  const answeredAndIgnored = await rowsOf<{ id: string }>(
    database,
    sql`select id from app.unanswered_questions
        where account_id = ${accountId} and answered_at is not null and ignored_at is not null`,
  );
  problems.push(...answeredAndIgnored.map((row) => `unanswered question ${row.id} is both answered and ignored`));

  // A joined question points at one that stays (no chains), and a question's count is never below one
  const chains = await rowsOf<{ id: string }>(
    database,
    sql`select q.id from app.unanswered_questions q
        join app.unanswered_questions target on target.id = q.merged_into_id and target.account_id = q.account_id
        where q.account_id = ${accountId} and target.merged_into_id is not null`,
  );
  problems.push(
    ...chains.map((row) => `unanswered question ${row.id} was joined into a question that was itself joined`),
  );

  const noCount = await rowsOf<{ id: string }>(
    database,
    sql`select id from app.unanswered_questions where account_id = ${accountId} and count < 1`,
  );
  problems.push(...noCount.map((row) => `unanswered question ${row.id} has a count below one`));
  return problems;
};

// ---------------------------------------------------------------------------------------- business profile, settings

const profileAnswersAreForRealQuestions: Check = async (database, accountId) => {
  const account = await rowsOf<{ industry: string; time_zone: string; default_country: string }>(
    database,
    sql`select industry, time_zone, default_country from app.accounts where id = ${accountId}`,
  );
  if (account.length !== 1) return ['the business row is missing'];
  const problems: string[] = [];
  const { industry, time_zone: timeZone, default_country: defaultCountry } = account[0]!;
  const questions = getQuestionsForIndustry(industry);
  const answers = await rowsOf<{ question_key: string; status: string; confirmed_at: Date | null; source: string }>(
    database,
    sql`select question_key, status, confirmed_at, source from app.business_answers where account_id = ${accountId}`,
  );
  for (const answer of answers) {
    const question = questions.find((candidate) => candidate.key === answer.question_key);
    if (!question) problems.push(`answer "${answer.question_key}" is not a question of a ${industry} business`);
    else if (question.handledElsewhere)
      problems.push(`answer "${answer.question_key}" is for a question answered in ${question.handledElsewhere}`);
    if ((answer.status === 'confirmed') !== (answer.confirmed_at !== null)) {
      problems.push(`answer "${answer.question_key}": confirmed and its confirmation time disagree`);
    }
    if (answer.status === 'check' && answer.source === 'typed')
      problems.push(`answer "${answer.question_key}" was typed but is waiting for a check`);
  }
  const situations = await rowsOf<{ situation_key: string; choice: string }>(
    database,
    sql`select situation_key, choice from app.situations where account_id = ${accountId}`,
  );
  for (const situation of situations) {
    const definition = SITUATIONS.find((candidate) => candidate.key === situation.situation_key);
    if (!definition) problems.push(`situation "${situation.situation_key}" does not exist`);
    else if (definition.fixed) problems.push(`situation "${situation.situation_key}" is fixed but has a saved choice`);
    else if (!definition.choices.some((choice) => choice.key === situation.choice)) {
      problems.push(`situation "${situation.situation_key}" has the unknown choice "${situation.choice}"`);
    }
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone });
  } catch {
    problems.push(`the time zone "${timeZone}" is not real`);
  }
  if (!/^[A-Z]{2}$/.test(defaultCountry))
    problems.push(`the default country "${defaultCountry}" is not two capital letters`);
  return problems;
};

// ------------------------------------------------------------------------------------------------- AI keys, settings and usage

const aiKeysSettingsAndUsageAreInOrder: Check = async (database, accountId) => {
  const problems: string[] = [];
  // A live key holds a real scrambled value; a removed key is wiped, so no secret outlives its removal
  const keyStates = await rowsOf<{ id: string; deleted: boolean; wiped: boolean; zeroed: boolean }>(
    database,
    sql`select id, deleted_at is not null as deleted,
               encrypted_key = 'v1.removed.removed.removed' as wiped,
               key_fingerprint = repeat('0', 64) as zeroed
        from app.ai_keys where account_id = ${accountId}`,
  );
  for (const key of keyStates) {
    if (key.deleted && !(key.wiped && key.zeroed)) problems.push(`removed AI key ${key.id} still holds its secret`);
    if (!key.deleted && (key.wiped || key.zeroed)) problems.push(`live AI key ${key.id} holds the wiped placeholder`);
  }
  const keysOverTheLimit = await rowsOf<{ provider: string; total: number }>(
    database,
    sql`select provider, count(*)::int as total from app.ai_keys
        where account_id = ${accountId} and deleted_at is null group by provider having count(*) > 10`,
  );
  problems.push(...keysOverTheLimit.map((row) => `${row.total} live ${row.provider} keys (the limit is 10)`));
  const sameKeyTwice = await rowsOf<{ provider: string }>(
    database,
    sql`select provider from app.ai_keys where account_id = ${accountId} and deleted_at is null
        group by provider, key_fingerprint having count(*) > 1`,
  );
  problems.push(...sameKeyTwice.map((row) => `the same ${row.provider} key is saved twice`));
  const statusWithoutCheck = await rowsOf<{ id: string }>(
    database,
    sql`select id from app.ai_keys where account_id = ${accountId} and deleted_at is null
        and status <> 'unchecked' and status_checked_at is null`,
  );
  problems.push(...statusWithoutCheck.map((row) => `AI key ${row.id} has a status but no time it was checked`));

  // The business's own model order only names models that exist
  const unknownModels = await rowsOf<{ job: string; model_id: string }>(
    database,
    sql`select jobs.key as job, model_ids.value as model_id
        from app.ai_settings s,
             jsonb_each(s.task_models) as jobs,
             jsonb_array_elements_text(jobs.value) as model_ids
        where s.account_id = ${accountId}
          and not exists (select 1 from app.ai_models m where m.id::text = model_ids.value)`,
  );
  problems.push(
    ...unknownModels.map((row) => `the model order for ${row.job} names a model that does not exist (${row.model_id})`),
  );

  // The daily totals agree with the call records they are made from (recent days only: old call records are cleaned away)
  const mismatches = await rowsOf<{ description: string }>(
    database,
    sql`with recent_calls as (
          select (created_at at time zone 'utc')::date as day, provider, model_name, task, agent_id, channel, key_source,
                 count(*) filter (where success)::int as calls,
                 count(*) filter (where not success)::int as failures,
                 count(*) filter (where fallback_used)::int as fallbacks,
                 sum(input_tokens)::bigint as input_tokens,
                 sum(output_tokens)::bigint as output_tokens,
                 sum(cached_tokens)::bigint as cached_tokens
          from app.ai_calls
          where account_id = ${accountId} and created_at > now() - interval '85 days'
          group by 1, 2, 3, 4, 5, 6, 7
        ), recent_usage as (
          select * from app.ai_usage where account_id = ${accountId} and day > (now() - interval '85 days')::date
        )
        select concat(coalesce(c.day, u.day)::text, ' ', coalesce(c.task, u.task), ' ', coalesce(c.model_name, u.model_name),
                      ': calls ', coalesce(c.calls, 0), ' vs ', coalesce(u.calls, 0),
                      ', tokens ', coalesce(c.input_tokens, 0), ' vs ', coalesce(u.input_tokens, 0)) as description
        from recent_calls c
        full join recent_usage u using (day, provider, model_name, task, agent_id, channel, key_source)
        where c.calls is distinct from u.calls or c.failures is distinct from u.failures or c.fallbacks is distinct from u.fallbacks
           or c.input_tokens is distinct from u.input_tokens or c.output_tokens is distinct from u.output_tokens
           or c.cached_tokens is distinct from u.cached_tokens`,
  );
  problems.push(...mismatches.map((row) => `the AI usage totals do not match the call records: ${row.description}`));
  return problems;
};

// ------------------------------------------------------------------------------------- who did it, and what is written

const everyStampNamesSomeoneOfTheBusiness: Check = async (database, accountId) => {
  const tables = [
    'contacts',
    'leads',
    'tickets',
    'pipelines',
    'business_answers',
    'situations',
    'offerings',
    'offers',
    'faqs',
    'unanswered_questions',
    'ai_keys',
  ] as const;
  const problems: string[] = [];
  for (const table of tables) {
    for (const stamp of ['created_by', 'updated_by'] as const) {
      const rows = await rowsOf<{ total: number }>(
        database,
        sql`select count(*)::int as total from ${sql.table(`app.${table}`)} t
            where t.account_id = ${accountId} and t.${sql.ref(stamp)}->>'kind' = 'user'
              and not exists (select 1 from app.users u where u.id::text = t.${sql.ref(stamp)}->>'id' and u.account_id = t.account_id)`,
      );
      if (rows[0]!.total > 0)
        problems.push(
          `${rows[0]!.total} ${table} rows have ${stamp} naming someone who does not work for the business`,
        );
    }
  }
  return problems;
};

const everyCreationIsLoggedOnce: Check = async (database, accountId) => {
  const problems: string[] = [];
  const things = [
    { table: 'contacts', logKind: 'contacts.created', eventName: 'contact.created', eventKey: 'contactId' },
    { table: 'leads', logKind: 'leads.created', eventName: 'lead.created', eventKey: 'leadId' },
    { table: 'tickets', logKind: 'tickets.created', eventName: 'ticket.created', eventKey: 'ticketId' },
    { table: 'offerings', logKind: 'offerings.created', eventName: 'offering.created', eventKey: 'offeringId' },
    { table: 'offers', logKind: 'offers.created', eventName: 'offer.created', eventKey: 'offerId' },
    { table: 'faqs', logKind: 'knowledge.faq_created', eventName: 'faq.created', eventKey: 'faqId' },
    { table: 'ai_keys', logKind: 'ai.key_added', eventName: 'ai.key_added', eventKey: 'keyId' },
    {
      table: 'unanswered_questions',
      logKind: 'knowledge.unanswered_question_logged',
      eventName: 'unanswered_question.logged',
      eventKey: 'unansweredQuestionId',
    },
  ] as const;
  for (const thing of things) {
    const rows = await rowsOf<{ id: string; log_lines: number; events: number }>(
      database,
      sql`select t.id,
            (select count(*)::int from app.activity_log a
              where a.account_id = t.account_id and a.kind = ${thing.logKind} and a.record_id = t.id) as log_lines,
            (select count(*)::int from app.domain_events e
              where e.account_id = t.account_id and e.name = ${thing.eventName} and e.payload->>${thing.eventKey} = t.id::text) as events
          from ${sql.table(`app.${thing.table}`)} t where t.account_id = ${accountId}`,
    );
    for (const row of rows) {
      if (row.log_lines !== 1)
        problems.push(`${thing.table} row ${row.id} has ${row.log_lines} "${thing.logKind}" log lines, not one`);
      if (row.events !== 1)
        problems.push(`${thing.table} row ${row.id} has ${row.events} "${thing.eventName}" events, not one`);
    }
  }
  return problems;
};

const logLinesNameAPersonOfTheBusiness: Check = async (database, accountId) => {
  const rows = await rowsOf<{ id: string; kind: string }>(
    database,
    sql`select a.id, a.kind from app.activity_log a
        where a.account_id = ${accountId} and a.actor->>'kind' = 'user'
          and not exists (select 1 from app.users u where u.id::text = a.actor->>'id' and u.account_id = a.account_id)`,
  );
  return rows.map((row) => `log line ${row.id} (${row.kind}) names someone who does not work for the business`);
};

/**
 * No personal data in the log or the events: the names, phone numbers and email addresses of the business's contacts and
 * people, and the words of its offerings, offers, FAQs and unanswered questions (long enough to be meaningful), must appear in no log line and no event.
 */
const noPersonalDataInTheLogOrEvents: Check = async (database, accountId) => {
  const people = await rowsOf<{ text: string }>(
    database,
    sql`select name as text from app.contacts where account_id = ${accountId} and name is not null
        union all select phone from app.contacts where account_id = ${accountId} and phone is not null
        union all select email from app.contacts where account_id = ${accountId} and email is not null
        union all select name from app.users where account_id = ${accountId}
        union all select email from app.users where account_id = ${accountId}
        union all select name from app.offerings where account_id = ${accountId}
        union all select description from app.offerings where account_id = ${accountId} and description is not null
        union all select text from app.offers where account_id = ${accountId}
        union all select question from app.faqs where account_id = ${accountId}
        union all select answer from app.faqs where account_id = ${accountId}
        union all select question from app.unanswered_questions where account_id = ${accountId}
        union all select label from app.ai_keys where account_id = ${accountId}
          and lower(label) not in ('gemini', 'openai', 'anthropic')`, // a label that is only a company's name is no secret: events name the company
  );
  const needles = [...new Set(people.map((row) => row.text.toLowerCase()).filter((text) => text.length >= 6))];
  if (needles.length === 0) return [];
  const written = await rowsOf<{ text: string }>(
    database,
    sql`select (to_jsonb(a) - 'id')::text as text from app.activity_log a where a.account_id = ${accountId}
        union all
        select (e.payload)::text from app.domain_events e where e.account_id = ${accountId}`,
  );
  const everythingWritten = written.map((row) => row.text.toLowerCase()).join('\n');
  return needles
    .filter((needle) => everythingWritten.includes(needle))
    .map((needle) => `"${needle}" appears in the activity log or the events`);
};

const checks: ReadonlyArray<readonly [string, Check]> = [
  ['contacts are not duplicated', contactsAreNotDuplicated],
  ['contact stages match their leads', contactLifecycleMatchesTheirLeads],
  ['the pipeline has its shape', pipelineHasItsShape],
  ['leads are in order', leadsAreInOrder],
  ["sharing out points at the business's own people", sharingOutPointsAtThePeopleOfTheBusiness],
  ['tickets are in order', ticketsAreInOrder],
  ['offerings and offers are in order', offeringsAndOffersAreInOrder],
  ['FAQs and unanswered questions are in order', faqsAndUnansweredQuestionsAreInOrder],
  ['AI keys, settings and usage are in order', aiKeysSettingsAndUsageAreInOrder],
  ['the profile and settings are valid', profileAnswersAreForRealQuestions],
  ['every stamp names someone of the business', everyStampNamesSomeoneOfTheBusiness],
  ['every creation is logged and announced once', everyCreationIsLoggedOnce],
  ['log lines name a person of the business', logLinesNameAPersonOfTheBusiness],
  ['no personal data in the log or events', noPersonalDataInTheLogOrEvents],
];

/**
 * Every fact about one business that does not add up, in plain words, each starting with the rule it breaks. An empty list
 * means the business's data is consistent.
 */
export async function findConsistencyProblems(database: Database, accountId: string): Promise<string[]> {
  const problems: string[] = [];
  for (const [ruleName, check] of checks) {
    for (const problem of await check(database, accountId)) problems.push(`[${ruleName}] ${problem}`);
  }
  return problems;
}
