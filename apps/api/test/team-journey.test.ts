import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { findConsistencyProblems } from './support/consistency';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, uniqueUaeNumber, type TeamMember } from './support/team';

// "A busy day at Nair Stays": the whole lead engine built so far, told as one story by several real people, each with their
// own sign-in and their own role. After every chapter the consistency checker (support/consistency.ts) reads the whole
// business out of the database and proves everything is connected and nothing is duplicated.

let database: Database;
let app: FastifyInstance;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
});
afterAll(async () => {
  await app.close();
  await database.close();
});

/** The consistency checker's findings for one business: an empty list means everything adds up. */
const problemsOf = (member: TeamMember) => findConsistencyProblems(database, member.businessId);

/** The id of the pipeline stage with this name, as the person sees the pipeline. */
async function stageIdNamed(member: TeamMember, name: string): Promise<string> {
  const pipeline = await member.ok('GET', '/pipeline');
  const stage = pipeline.stages.find((candidate: { name: string }) => candidate.name === name);
  if (!stage) throw new Error(`No stage named ${name}`);
  return stage.id;
}

/** Adds a contact with a fresh phone number and returns its id. */
async function addContact(member: TeamMember, name: string): Promise<string> {
  return (await member.ok('POST', '/contacts', { name, phone: uniqueUaeNumber() }, 201)).id;
}

/** How many live leads each stage really holds in the database, by stage name. */
async function leadCountsPerStageInDatabase(businessId: string): Promise<Record<string, number>> {
  const rows = await database.system
    .selectFrom('leads as lead')
    .innerJoin('pipeline_stages as stage', 'stage.id', 'lead.stage_id')
    .select(['stage.name', (expression) => expression.fn.countAll<string>().as('total')])
    .where('lead.account_id', '=', businessId)
    .where('lead.deleted_at', 'is', null)
    .groupBy('stage.name')
    .execute();
  return Object.fromEntries(rows.map((row) => [row.name, Number(row.total)]));
}

/** The number of rows a business has in a table. */
async function countRows(
  table: 'leads' | 'tickets' | 'ticket_notes' | 'contacts' | 'business_answers',
  businessId: string,
) {
  const row = await database.system
    .selectFrom(table)
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .where('account_id', '=', businessId)
    .executeTakeFirstOrThrow();
  return Number(row.total);
}

describe('journey: a busy day at Nair Stays', () => {
  it('a manager, a second manager, a staff member and an "own leads only" person run a business together; an outsider sees nothing', async () => {
    // ------------------------------------------------------------------ the cast: four real people, four sessions
    const anita = await signUpOwner(app, database); // the owner: a manager
    const rahul = await addTeamMember(app, database, anita, { name: 'Rahul Kumar', role: 'staff' });
    const meera = await addTeamMember(app, database, anita, { name: 'Meera Das', role: 'staff_own' });
    const vikram = await addTeamMember(app, database, anita, { name: 'Vikram Rao', role: 'manager' });
    expect(new Set([anita.userId, rahul.userId, meera.userId, vikram.userId]).size).toBe(4);
    for (const person of [anita, rahul, meera, vikram]) {
      const profile = await person.ok('GET', '/me');
      expect(profile.user).toMatchObject({ id: person.userId, role: person.role });
      expect(profile.business.id).toBe(anita.businessId);
    }
    expect(await problemsOf(anita)).toEqual([]);

    // ----------------------------------------------------------- chapter 1: the manager sets the business up
    const profileBefore = await anita.ok('GET', '/knowledge/questions');
    expect(profileBefore.progress).toMatchObject({ answeredQuestions: 0, readyToGoLive: false });
    const neededAnswers: Record<string, unknown> = {
      has_website: { yes: true, detail: 'https://nairstays.example' },
      business_name: 'Nair Stays',
      business_summary: 'A homestay with six rooms near the beach.',
      address: 'Beach Road, opposite the lighthouse',
      contact_details: { rows: [{ kind: 'Phone', value: '+91 98470 12345' }] },
      opening_hours: { days: { mon: { open: '09:00', close: '21:00' }, sat: { open: '10:00', close: '14:00' } } },
      customer_languages: { choices: ['English', 'Malayalam'] },
    };
    let lastAnswer;
    for (const [key, value] of Object.entries(neededAnswers))
      lastAnswer = await anita.ok('PUT', `/knowledge/answers/${key}`, { value });
    expect(lastAnswer.progress).toMatchObject({ readyToGoLive: true, neededToGoLiveStillMissing: [] });
    await anita.ok('PUT', '/knowledge/answers/hotel_pets', { value: { yes: true, detail: 'Small dogs only' } }); // a hotel's own question
    await anita.ok('PUT', '/knowledge/situations/discount_request', { choice: 'prices_are_fixed' });
    await anita.ok('PUT', '/knowledge/settings', { timeZone: 'Asia/Dubai', defaultCountry: 'AE' });
    await anita.ok('POST', '/pipeline/stages', { name: 'Site visit' }, 201);
    await anita.ok('PUT', '/lost-reasons', { reasons: ['Price too high', 'Chose a competitor', 'No answer'] });
    await anita.ok('PUT', '/assignment-rules', {
      mode: 'round_robin',
      userIds: [anita.userId, rahul.userId, meera.userId],
    });

    // Everybody reads the settings; only managers change them
    for (const person of [anita, rahul, meera, vikram]) {
      const questions = await person.ok('GET', '/knowledge/questions');
      expect(questions.progress.readyToGoLive, person.name).toBe(true);
      expect(
        questions.questions.find((question: { key: string }) => question.key === 'business_name').answer.value,
      ).toBe('Nair Stays');
      expect((await person.ok('GET', '/knowledge/settings')).defaultCountry).toBe('AE');
      const discountHandling = (await person.ok('GET', '/knowledge/situations')).items.find(
        (situation: { key: string }) => situation.key === 'discount_request',
      );
      expect(discountHandling.selectedChoiceKey).toBe('prices_are_fixed');
      expect((await person.ok('GET', '/pipeline')).stages.map((stage: { name: string }) => stage.name)).toContain(
        'Site visit',
      );
    }
    for (const person of [rahul, meera]) {
      const forbidden: Array<[string, string, object]> = [
        ['PUT', '/knowledge/answers/business_name', { value: 'Hacked' }],
        ['POST', '/knowledge/answers/confirm', { questionKeys: ['business_name'] }],
        ['PUT', '/knowledge/situations/after_hours', { choice: 'call_at_opening_only' }],
        ['PUT', '/knowledge/settings', { defaultCountry: 'IN' }],
        ['POST', '/pipeline/stages', { name: 'Sneaky' }],
        ['PUT', '/lost-reasons', { reasons: ['Sneaky'] }],
        ['PUT', '/assignment-rules', { mode: 'one_person', userId: person.userId }],
      ];
      for (const [method, url, body] of forbidden) {
        await person.refused(method as 'PUT', url, body, 403);
      }
    }
    expect(
      (await anita.ok('GET', '/knowledge/questions')).questions.find(
        (question: { key: string }) => question.key === 'business_name',
      ).answer.value,
    ).toBe('Nair Stays');
    expect(await problemsOf(anita)).toEqual([]);

    // ----------------------------------------------------- chapter 2: enquiries arrive; leads are shared out in turn
    const priya = await addContact(rahul, 'Priya Menon');
    const karthik = await addContact(rahul, 'Karthik Raj');
    const divya = await addContact(rahul, 'Divya Pillai');
    const phoneOfPriya = (await anita.ok('GET', `/contacts/${priya}`)).phone;
    expect(phoneOfPriya.startsWith('+971')).toBe(true);
    // The same person twice is refused, not duplicated
    expect(await rahul.refused('POST', '/contacts', { name: 'Priya again', phone: phoneOfPriya }, 409)).toBe(
      'CONTACT_EXISTS',
    );

    const leadOfPriya = await rahul.ok('POST', '/leads', { contactId: priya, interest: '3 nights in December' }, 201);
    const leadOfKarthik = await rahul.ok('POST', '/leads', { contactId: karthik, interest: 'A wedding in March' }, 201);
    const leadOfDivya = await rahul.ok('POST', '/leads', { contactId: divya, interest: 'A weekend stay' }, 201);
    // The owner is the next person in turn, not the person who typed it in
    expect([leadOfPriya.ownerUserId, leadOfKarthik.ownerUserId, leadOfDivya.ownerUserId]).toEqual([
      anita.userId,
      rahul.userId,
      meera.userId,
    ]);
    // Each contact now has exactly one open lead, and a second one is refused
    expect(await rahul.refused('POST', '/leads', { contactId: priya }, 409)).toBe('LEAD_OPEN');
    for (const contactId of [priya, karthik, divya]) {
      expect((await anita.ok('GET', `/contacts/${contactId}`)).lifecycleStage).toBe('lead');
    }

    // Who sees what: managers and staff see every lead; the "own leads only" person sees only hers
    expect((await anita.ok('GET', '/leads')).total).toBe(3);
    expect((await vikram.ok('GET', '/leads')).total).toBe(3);
    expect((await rahul.ok('GET', '/leads')).total).toBe(3);
    const meerasLeads = await meera.ok('GET', '/leads');
    expect(meerasLeads.total).toBe(1);
    expect(meerasLeads.items[0].id).toBe(leadOfDivya.id);
    await meera.refused('GET', `/leads/${leadOfPriya.id}`, undefined, 404);
    await meera.refused('PATCH', `/leads/${leadOfKarthik.id}`, { interest: 'Taken over' }, 404);
    await meera.refused(
      'POST',
      `/leads/${leadOfPriya.id}/move`,
      { stageId: await stageIdNamed(meera, 'Contacted') },
      404,
    );
    expect(
      (await meera.ok('GET', '/pipeline')).stages.find((stage: { name: string }) => stage.name === 'New').leadCount,
    ).toBe(1);
    expect(
      (await anita.ok('GET', '/pipeline')).stages.find((stage: { name: string }) => stage.name === 'New').leadCount,
    ).toBe(3);
    // She can add a lead only in her own name
    const arjun = await addContact(meera, 'Arjun Nambiar');
    await meera.refused('POST', '/leads', { contactId: arjun, ownerUserId: rahul.userId }, 403);
    const leadOfArjun = await meera.ok('POST', '/leads', { contactId: arjun }, 201);
    expect(leadOfArjun.ownerUserId).toBe(meera.userId);
    expect((await meera.ok('GET', '/leads')).total).toBe(2);
    expect(await problemsOf(anita)).toEqual([]);

    // --------------------------------------------------------------- chapter 3: the team works the leads
    const contactedId = await stageIdNamed(rahul, 'Contacted');
    const quotedId = await stageIdNamed(rahul, 'Quoted');
    const newId = await stageIdNamed(rahul, 'New');
    const wonId = await stageIdNamed(rahul, 'Won');
    const lostId = await stageIdNamed(rahul, 'Lost');
    await rahul.ok('POST', `/leads/${leadOfKarthik.id}/move`, { stageId: contactedId });
    await rahul.ok('POST', `/leads/${leadOfKarthik.id}/move`, { stageId: quotedId });

    // Anita loses Priya's lead: a reason is needed, from the business's own list
    expect(await anita.refused('POST', `/leads/${leadOfPriya.id}/move`, { stageId: lostId }, 400)).toBe(
      'LOST_REASON_REQUIRED',
    );
    expect(
      await anita.refused('POST', `/leads/${leadOfPriya.id}/move`, { stageId: lostId, lostReason: 'Too costly' }, 400),
    ).toBe('INVALID_LOST_REASON');
    const lost = await anita.ok('POST', `/leads/${leadOfPriya.id}/move`, {
      stageId: lostId,
      lostReason: 'price too high',
    });
    expect(lost).toMatchObject({ lostReason: 'Price too high', stage: { kind: 'lost' } });
    expect((await anita.ok('GET', `/contacts/${priya}`)).lifecycleStage).toBe('new');
    // ...then she is back: moving the lead to an open stage reopens it
    const reopened = await anita.ok('POST', `/leads/${leadOfPriya.id}/move`, { stageId: newId });
    expect(reopened).toMatchObject({ closedAt: null, lostReason: null });
    expect((await anita.ok('GET', `/contacts/${priya}`)).lifecycleStage).toBe('lead');

    // Meera wins her own lead: Divya becomes a customer; a repeat enquiry gives a second lead, and winning it makes her a repeat customer
    await meera.ok('POST', `/leads/${leadOfDivya.id}/move`, { stageId: wonId });
    expect((await anita.ok('GET', `/contacts/${divya}`)).lifecycleStage).toBe('customer');
    const secondLeadOfDivya = await rahul.ok(
      'POST',
      '/leads',
      { contactId: divya, interest: 'Back for Christmas' },
      201,
    );
    expect(secondLeadOfDivya.ownerUserId).toBe(anita.userId); // the turn came round to Anita again
    expect((await anita.ok('GET', `/contacts/${divya}`)).lifecycleStage).toBe('customer');
    await anita.ok('POST', `/leads/${secondLeadOfDivya.id}/move`, { stageId: wonId });
    expect((await anita.ok('GET', `/contacts/${divya}`)).lifecycleStage).toBe('repeat_customer');

    // Anita hands Karthik's lead to Meera: it leaves Rahul's list... staff see everything, Meera now sees it too
    await anita.ok('POST', `/leads/${leadOfKarthik.id}/assign`, { ownerUserId: meera.userId });
    expect((await meera.ok('GET', '/leads')).items.map((lead: { id: string }) => lead.id)).toContain(leadOfKarthik.id);
    await meera.ok('PATCH', `/leads/${leadOfKarthik.id}`, { interest: 'A wedding in March, 120 guests' });

    // The numbers on the board are the numbers in the database
    const boardNow = await anita.ok('GET', '/pipeline');
    const countsInDatabase = await leadCountsPerStageInDatabase(anita.businessId);
    for (const stage of boardNow.stages) expect(stage.leadCount, stage.name).toBe(countsInDatabase[stage.name] ?? 0);
    expect((await anita.ok('GET', '/leads?limit=100')).total).toBe(await countRows('leads', anita.businessId));
    expect(await problemsOf(anita)).toEqual([]);

    // ---------------------------------------------------------------- chapter 4: a complaint, worked by three people
    const complaint = await rahul.ok(
      'POST',
      '/tickets',
      {
        contactId: priya,
        title: 'Unhappy about the room',
        details: 'The air conditioner did not work.',
        type: 'complaint',
        priority: 'high',
      },
      201,
    );
    expect(complaint).toMatchObject({ status: 'open', ownerUserId: null });
    await rahul.ok('PATCH', `/tickets/${complaint.id}`, { ownerUserId: anita.userId });
    // Tickets are shared work: everybody, even the "own leads only" person, sees it
    for (const person of [anita, rahul, meera, vikram]) {
      const list = await person.ok('GET', '/tickets?status=open');
      expect(
        list.items.map((ticket: { id: string }) => ticket.id),
        person.name,
      ).toContain(complaint.id);
    }
    expect((await anita.ok('GET', '/tickets?ownerUserId=me')).total).toBe(1);
    await meera.ok('PATCH', `/tickets/${complaint.id}`, { note: 'Spoke to housekeeping.' });
    await anita.ok('PATCH', `/tickets/${complaint.id}`, { note: 'Called her, offered one night free.' });
    const closed = await anita.ok('PATCH', `/tickets/${complaint.id}`, { status: 'done', note: 'She accepted.' });
    expect(closed).toMatchObject({ status: 'done', closedByUserId: anita.userId });
    expect(closed.notes.map((note: { writtenByUserId: string }) => note.writtenByUserId)).toEqual([
      meera.userId,
      anita.userId,
      anita.userId,
    ]);
    await rahul.refused('PATCH', `/tickets/${complaint.id}`, { priority: 'urgent' }, 409);
    const again = await rahul.ok('PATCH', `/tickets/${complaint.id}`, { status: 'open', note: 'She wrote again.' });
    expect(again).toMatchObject({ status: 'open', closedAt: null, closedByUserId: null });
    await rahul.ok('PATCH', `/tickets/${complaint.id}`, { status: 'done' });
    // A second ticket, raised by Meera for another contact, left open
    await meera.ok('POST', '/tickets', { contactId: karthik, title: 'Parking question', type: 'question' }, 201);

    // The tickets never touched the leads board or the contacts' stages
    expect((await anita.ok('GET', `/leads/${leadOfPriya.id}`)).stage.name).toBe('New');
    expect((await anita.ok('GET', `/contacts/${priya}`)).lifecycleStage).toBe('lead');
    expect((await anita.ok('GET', '/tickets?status=done')).total).toBe(1);
    expect((await anita.ok('GET', '/tickets?status=open')).total).toBe(1);
    expect((await anita.ok('GET', '/tickets?limit=100')).total).toBe(await countRows('tickets', anita.businessId));
    expect(await countRows('ticket_notes', anita.businessId)).toBe(4);
    expect(await problemsOf(anita)).toEqual([]);

    // ---------------------------------------------------- chapter 5: the second manager takes charge; only managers delete
    expect((await vikram.ok('GET', '/leads')).total).toBe(5);
    await rahul.refused('DELETE', `/leads/${leadOfKarthik.id}`, undefined, 403);
    await meera.refused('DELETE', `/leads/${leadOfKarthik.id}`, undefined, 403);
    await rahul.refused('DELETE', `/contacts/${arjun}`, undefined, 403);
    await vikram.ok('DELETE', `/leads/${leadOfKarthik.id}`, undefined, 204);
    expect((await anita.ok('GET', `/contacts/${karthik}`)).lifecycleStage).toBe('new'); // his only lead is gone
    await meera.refused('GET', `/leads/${leadOfKarthik.id}`, undefined, 404);
    await anita.refused('GET', `/leads/${leadOfKarthik.id}`, undefined, 404);
    await vikram.ok('PUT', '/knowledge/situations/after_hours', { choice: 'call_at_opening_only' });
    expect(
      (await anita.ok('GET', '/knowledge/situations')).items.find(
        (situation: { key: string }) => situation.key === 'after_hours',
      ).selectedChoiceKey,
    ).toBe('call_at_opening_only');
    // Arjun's enquiry is over: his lead goes first, then his contact (see the note on R46 in the test below)
    await vikram.ok('DELETE', `/leads/${leadOfArjun.id}`, undefined, 204);
    await vikram.ok('DELETE', `/contacts/${arjun}`, undefined, 204);
    expect(await problemsOf(anita)).toEqual([]);

    // ---------------------------------------------------- chapter 6: an outsider sees nothing of Nair Stays
    const bob = await signUpOwner(app, database);
    for (const url of ['/leads', '/tickets', '/contacts']) expect((await bob.ok('GET', url)).total, url).toBe(0);
    await bob.refused('GET', `/leads/${leadOfPriya.id}`, undefined, 404);
    await bob.refused('GET', `/tickets/${complaint.id}`, undefined, 404);
    await bob.refused('GET', `/contacts/${priya}`, undefined, 404);
    await bob.refused('POST', '/tickets', { contactId: priya, title: 'Sneaky' }, 404);
    expect(
      (await bob.ok('GET', '/knowledge/questions')).questions.every(
        (question: { answer: unknown }) => question.answer === null,
      ),
    ).toBe(true);
    expect((await bob.ok('GET', '/knowledge/settings')).defaultCountry).toBe('IN');
    expect(await problemsOf(bob)).toEqual([]);
    expect(await problemsOf(anita)).toEqual([]);

    // ----------------------------------------- chapter 7: signing out and switching people off ends their access at once
    await rahul.ok('POST', '/auth/logout');
    await rahul.refused('GET', '/leads', undefined, 401);
    expect((await meera.ok('GET', '/leads')).total).toBeGreaterThan(0); // the others carry on
    await database.system.updateTable('users').set({ status: 'disabled' }).where('id', '=', meera.userId).execute();
    await meera.refused('GET', '/leads', undefined, 401);
    await meera.refused('POST', '/tickets', { contactId: priya, title: 'Still here?' }, 401);
    // Everything they did stays, with their name on it
    const ticketsWrittenByMeera = await database.system
      .selectFrom('ticket_notes')
      .select('id')
      .where('account_id', '=', anita.businessId)
      .where('created_by', '=', { kind: 'user', id: meera.userId })
      .execute();
    expect(ticketsWrittenByMeera).toHaveLength(1);
    expect((await anita.ok('GET', '/leads?ownerUserId=' + meera.userId)).total).toBeGreaterThan(0);
    expect(await problemsOf(anita)).toEqual([]);

    // ------------------------------------------------------ the end: the profile numbers match the database
    const final = await anita.ok('GET', '/knowledge/questions');
    expect(final.progress.answeredQuestions).toBe(await countRows('business_answers', anita.businessId));
    expect(final.progress.readyToGoLive).toBe(true);
  });
});

describe('the consistency checker itself', () => {
  /** A small business with one contact, one lead, one ticket and a few profile answers, all made through the real routes. */
  async function buildSmallBusiness() {
    const owner = await signUpOwner(app, database);
    const contactId = await addContact(owner, 'Karthik Raj');
    const lead = await owner.ok('POST', '/leads', { contactId }, 201);
    const ticket = await owner.ok('POST', '/tickets', { contactId, title: 'A question' }, 201);
    await owner.ok('PUT', '/knowledge/answers/business_name', { value: 'Nair Stays' });
    return { owner, contactId, lead, ticket };
  }

  it('finds nothing wrong in a business built through the routes', async () => {
    const { owner } = await buildSmallBusiness();
    expect(await problemsOf(owner)).toEqual([]);
  });

  it("notices damage done behind the app's back, naming the rule that is broken", async () => {
    const { owner, contactId, lead, ticket } = await buildSmallBusiness();
    const businessId = owner.businessId;
    const damage: Array<{ what: string; expectInReport: string; apply: () => Promise<void> }> = [
      {
        what: 'a contact whose stage does not match its leads',
        expectInReport: '[contact stages match their leads]',
        apply: async () => {
          await database.system
            .updateTable('contacts')
            .set({ lifecycle_stage: 'customer' })
            .where('id', '=', contactId)
            .execute();
        },
      },
      {
        what: 'a lead with a lost reason that is not lost',
        expectInReport: '[leads are in order]',
        apply: async () => {
          await database.system
            .updateTable('leads')
            .set({ lost_reason: 'Price too high', closed_at: new Date() })
            .where('id', '=', lead.id)
            .execute();
        },
      },
      {
        what: 'a creation log line removed',
        expectInReport: '[every creation is logged and announced once]',
        apply: async () => {
          await database.system
            .deleteFrom('activity_log')
            .where('record_id', '=', ticket.id)
            .where('kind', '=', 'tickets.created')
            .execute();
        },
      },
      {
        what: 'an answer to a question the business does not have',
        expectInReport: '[the profile and settings are valid]',
        apply: async () => {
          await database.system
            .insertInto('business_answers')
            .values({
              account_id: businessId,
              question_key: 'clinic_insurance',
              value: JSON.stringify({ yes: true }),
              confirmed_at: new Date(),
            })
            .execute();
        },
      },
      {
        what: 'a saved choice for a situation that is fixed',
        expectInReport: '[the profile and settings are valid]',
        apply: async () => {
          await database.system
            .insertInto('situations')
            .values({
              account_id: businessId,
              situation_key: 'complaint',
              choice: 'apologise_pass_to_manager_raise_ticket',
            })
            .execute();
        },
      },
      {
        what: 'a log line naming somebody who does not work for the business',
        expectInReport: '[log lines name a person of the business]',
        apply: async () => {
          await database.system
            .insertInto('activity_log')
            .values({
              id: crypto.randomUUID(),
              account_id: businessId,
              actor: { kind: 'user', id: crypto.randomUUID() },
              kind: 'leads.updated',
              fields: [],
            })
            .execute();
        },
      },
      {
        what: "a customer's phone number written into the log",
        expectInReport: '[no personal data in the log or events]',
        apply: async () => {
          const contact = await database.system
            .selectFrom('contacts')
            .select('phone')
            .where('id', '=', contactId)
            .executeTakeFirstOrThrow();
          await database.system
            .insertInto('activity_log')
            .values({
              id: crypto.randomUUID(),
              account_id: businessId,
              actor: { kind: 'system', id: 'test' },
              kind: 'contacts.updated',
              fields: [contact.phone as string],
            })
            .execute();
        },
      },
    ];
    for (const item of damage) {
      await item.apply();
      const report = (await problemsOf(owner)).join('\n');
      expect(report, `${item.what} should be noticed`).toContain(item.expectInReport);
    }
  });
});

describe('known limit R46: deleting a contact leaves its open lead behind', () => {
  it('is reported by the checker today, so the day it is fixed this test must be changed on purpose', async () => {
    const owner = await signUpOwner(app, database);
    const contactId = await addContact(owner, 'Arjun Nambiar');
    const lead = await owner.ok('POST', '/leads', { contactId }, 201);
    await owner.ok('DELETE', `/contacts/${contactId}`, undefined, 204);
    // The lead is still on the board, with no contact. See R46 in docs/REQUIREMENTS-REVIEW.md.
    const stillThere = await owner.ok('GET', `/leads/${lead.id}`);
    expect(stillThere.contact).toBeNull();
    expect(await problemsOf(owner)).toEqual([expect.stringContaining('belongs to a deleted contact')]);
  });
});

describe('many people at once: no duplicates, no lost updates', () => {
  /** A business with an owner, a staff member and an "own leads only" person. */
  async function buildTeam() {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Kumar', role: 'staff' });
    const staffOwn = await addTeamMember(app, database, owner, { name: 'Meera Das', role: 'staff_own' });
    const secondManager = await addTeamMember(app, database, owner, { name: 'Vikram Rao', role: 'manager' });
    return { owner, staff, staffOwn, secondManager };
  }

  it('eight people adding the same phone number at once make one contact', async () => {
    const { owner, staff, staffOwn, secondManager } = await buildTeam();
    const phone = uniqueUaeNumber();
    const people = [owner, staff, staffOwn, secondManager, owner, staff, staffOwn, secondManager];
    const responses = await Promise.all(
      people.map((person) => person.send('POST', '/contacts', { name: 'Priya Menon', phone })),
    );
    expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 409)).toHaveLength(7);
    expect(await countRows('contacts', owner.businessId)).toBe(1);
    expect(await problemsOf(owner)).toEqual([]);
  });

  it('eight people adding a lead for the same contact at once make one open lead', async () => {
    const { owner, staff, secondManager } = await buildTeam();
    const contactId = await addContact(owner, 'Priya Menon');
    const people = [owner, staff, secondManager, owner, staff, secondManager, owner, staff];
    const responses = await Promise.all(people.map((person) => person.send('POST', '/leads', { contactId })));
    expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 409)).toHaveLength(7);
    expect(await countRows('leads', owner.businessId)).toBe(1);
    expect((await owner.ok('GET', `/contacts/${contactId}`)).lifecycleStage).toBe('lead');
    expect(await problemsOf(owner)).toEqual([]);
  });

  it('nine leads added at once are shared out evenly, three each, with nobody getting two in the same turn', async () => {
    const { owner, staff, staffOwn } = await buildTeam();
    await owner.ok('PUT', '/assignment-rules', {
      mode: 'round_robin',
      userIds: [owner.userId, staff.userId, staffOwn.userId],
    });
    const contactIds: string[] = [];
    for (let count = 0; count < 9; count += 1) contactIds.push(await addContact(owner, `Customer ${count}`));
    const responses = await Promise.all(contactIds.map((contactId) => staff.send('POST', '/leads', { contactId })));
    expect(responses.map((response) => response.statusCode)).toEqual(Array(9).fill(201));
    const ownerCounts = new Map<string, number>();
    for (const response of responses) {
      const ownerUserId = response.json().ownerUserId as string;
      ownerCounts.set(ownerUserId, (ownerCounts.get(ownerUserId) ?? 0) + 1);
    }
    expect([...ownerCounts.entries()].sort().map(([, total]) => total)).toEqual([3, 3, 3]);
    expect(await problemsOf(owner)).toEqual([]);
  });

  it('ten changes to one ticket at once (notes, and closing) keep every note and close it exactly once', async () => {
    const { owner, staff, staffOwn, secondManager } = await buildTeam();
    const contactId = await addContact(owner, 'Priya Menon');
    const ticket = await owner.ok('POST', '/tickets', { contactId, title: 'Unhappy about the room' }, 201);
    const people = [owner, staff, staffOwn, secondManager, owner];
    const requests = [
      ...people.map((person, index) => person.send('PATCH', `/tickets/${ticket.id}`, { note: `Note ${index}` })),
      ...people.map((person) => person.send('PATCH', `/tickets/${ticket.id}`, { status: 'done' })),
    ];
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.statusCode)).toEqual(Array(10).fill(200));
    const final = await owner.ok('GET', `/tickets/${ticket.id}`);
    expect(final.status).toBe('done');
    expect(final.notes).toHaveLength(5);
    expect(new Set(final.notes.map((note: { body: string }) => note.body)).size).toBe(5);
    const events = await database.system
      .selectFrom('domain_events')
      .select('name')
      .where('account_id', '=', owner.businessId)
      .where('payload', '@>' as never, { ticketId: ticket.id } as never)
      .execute();
    expect(events.filter((event) => event.name === 'ticket.closed')).toHaveLength(1);
    expect(events.filter((event) => event.name === 'ticket.note_added')).toHaveLength(5);
    expect(await problemsOf(owner)).toEqual([]);
  });

  it('two managers answering the same question at once leave one answer, and both changes are logged', async () => {
    const { owner, secondManager } = await buildTeam();
    const responses = await Promise.all([
      owner.send('PUT', '/knowledge/answers/business_name', { value: 'Nair Stays' }),
      secondManager.send('PUT', '/knowledge/answers/business_name', { value: 'Nair Beach Stay' }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    const rows = await database.system
      .selectFrom('business_answers')
      .select(['question_key', 'value'])
      .where('account_id', '=', owner.businessId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(['Nair Stays', 'Nair Beach Stay']).toContain(rows[0]!.value);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'knowledge.answer_saved')
      .execute();
    expect(lines).toHaveLength(2);
    expect(await problemsOf(owner)).toEqual([]);
  });

  it('a lead moved by two people at once ends in one of the two stages, never between', async () => {
    const { owner, staff } = await buildTeam();
    const contactId = await addContact(owner, 'Priya Menon');
    const lead = await owner.ok('POST', '/leads', { contactId }, 201);
    const contactedId = await stageIdNamed(owner, 'Contacted');
    const quotedId = await stageIdNamed(owner, 'Quoted');
    const responses = await Promise.all([
      owner.send('POST', `/leads/${lead.id}/move`, { stageId: contactedId }),
      staff.send('POST', `/leads/${lead.id}/move`, { stageId: quotedId }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    const final = await owner.ok('GET', `/leads/${lead.id}`);
    expect([contactedId, quotedId]).toContain(final.stage.id);
    expect(await problemsOf(owner)).toEqual([]);
  });
});
