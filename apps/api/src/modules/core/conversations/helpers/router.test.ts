import { describe, expect, it } from 'vitest';
import { INDUSTRY_CONVERSATION_TYPES, SYSTEM_CONVERSATION_TYPES } from './default-conversation-types';
import {
  APPLY_CONFIDENCE,
  UNSURE_CONFIDENCE,
  decide,
  type AccountRules,
  type RoutableConversationType,
  type RoutingContext,
  type TypeClassification,
} from './router';

/** The business's types as the router sees them: the starting types, all switched on. */
const startingTypes: RoutableConversationType[] = [
  ...SYSTEM_CONVERSATION_TYPES,
  ...(INDUSTRY_CONVERSATION_TYPES.hotel_resort ?? []),
].map((type) => ({
  key: type.key,
  outcome: type.outcome,
  ticketType: type.ticketType ?? null,
  priority: type.priority ?? null,
  needsPerson: type.needsPerson,
  alert: type.alert,
  isActive: true,
}));

const noOpenRecords: RoutingContext = { openLead: null, openTicket: null };
const everythingOn: AccountRules = { leadsActive: true };

/** A classification with one main type and, optionally, others. */
const classified = (
  typeKey: string,
  confidence: number,
  more: Partial<TypeClassification> = {},
): TypeClassification => ({
  primary: { typeKey, confidence },
  secondary: [],
  needsPerson: false,
  ...more,
});

const decideWith = (
  classification: TypeClassification,
  context: RoutingContext = noOpenRecords,
  rules: AccountRules = everythingOn,
  types: readonly RoutableConversationType[] = startingTypes,
) => decide(types, classification, context, rules);

describe('router: the confidence thresholds', () => {
  it('applies a type at 0.70 or more, not marked unsure', () => {
    for (const confidence of [APPLY_CONFIDENCE, 0.85, 1]) {
      const decision = decideWith(classified('new_enquiry', confidence));
      expect(decision.primaryTypeKey).toBe('new_enquiry');
      expect(decision.outcomes.map((outcome) => outcome.kind)).toEqual(['lead']);
      expect(decision.aiUnsure).toBe(false);
    }
  });

  it('applies a type from 0.40 up to 0.70 and marks it "AI unsure"', () => {
    for (const confidence of [UNSURE_CONFIDENCE, 0.55, 0.699]) {
      const decision = decideWith(classified('new_enquiry', confidence));
      expect(decision.primaryTypeKey).toBe('new_enquiry');
      expect(decision.outcomes[0]).toMatchObject({ kind: 'lead', aiUnsure: true });
      expect(decision.aiUnsure).toBe(true);
    }
  });

  it('turns a type below 0.40 into "unclear": a person looks, and no lead or ticket is made', () => {
    for (const confidence of [0.399, 0.2, 0]) {
      const decision = decideWith(classified('new_enquiry', confidence));
      expect(decision.primaryTypeKey).toBe('unclear');
      expect(decision.outcomes.map((outcome) => outcome.kind)).toEqual(['review']);
      expect(decision.needsPerson).toBe(true);
    }
  });

  it('treats a confidence that is not a number, or outside 0 to 1, safely', () => {
    expect(decideWith(classified('new_enquiry', Number.NaN)).primaryTypeKey).toBe('unclear');
    expect(decideWith(classified('new_enquiry', -3)).primaryTypeKey).toBe('unclear');
    expect(decideWith(classified('new_enquiry', 7)).outcomes[0]).toMatchObject({
      kind: 'lead',
      confidence: 1,
      aiUnsure: false,
    });
  });

  it('falls back to "unclear" for a type the business does not have', () => {
    const decision = decideWith(classified('made_up_type', 0.95));
    expect(decision.primaryTypeKey).toBe('unclear');
    expect(decision.outcomes.map((outcome) => outcome.kind)).toEqual(['review']);
  });

  it('falls back to "unclear" for a type that has been switched off', () => {
    const typesWithEnquiryOff = startingTypes.map((type) =>
      type.key === 'new_enquiry' ? { ...type, isActive: false } : type,
    );
    const decision = decideWith(classified('new_enquiry', 0.95), noOpenRecords, everythingOn, typesWithEnquiryOff);
    expect(decision.primaryTypeKey).toBe('unclear');
  });

  it('still asks for a person if the business has no "unclear" type at all (a safety net)', () => {
    const withoutUnclear = startingTypes.filter((type) => type.key !== 'unclear');
    const decision = decideWith(classified('made_up_type', 0.95), noOpenRecords, everythingOn, withoutUnclear);
    expect(decision.outcomes).toHaveLength(1);
    expect(decision.outcomes[0]).toMatchObject({ kind: 'review', needsPerson: true });
    expect(decision.needsPerson).toBe(true);
  });
});

describe('router: what each type leads to', () => {
  it("makes a lead for a new enquiry, and the lead moves the contact's lifecycle stage", () => {
    const outcome = decideWith(classified('new_enquiry', 0.9)).outcomes[0]!;
    expect(outcome).toMatchObject({ kind: 'lead', ticket: null, keepContact: true, movesLifecycleStage: true });
  });

  it('makes a high-priority ticket for a complaint that needs a person and alerts the manager at once', () => {
    const decision = decideWith(classified('complaint', 0.92));
    expect(decision.outcomes[0]).toMatchObject({
      kind: 'ticket',
      ticket: { ticketType: 'complaint', priority: 'high' },
      needsPerson: true,
      alert: { who: 'manager', when: 'now' },
      movesLifecycleStage: false,
      keepContact: true,
    });
    expect(decision.needsPerson).toBe(true);
  });

  it('only logs a supplier, and still keeps the contact', () => {
    const outcome = decideWith(classified('vendor_or_partner', 0.9)).outcomes[0]!;
    expect(outcome).toMatchObject({ kind: 'log', ticket: null, keepContact: true, movesLifecycleStage: false });
  });

  it('creates no contact for spam, wrong numbers, silence or machine mail', () => {
    for (const typeKey of ['spam', 'wrong_number', 'no_conversation', 'automated']) {
      const outcome = decideWith(classified(typeKey, 1)).outcomes[0]!;
      expect(outcome.keepContact, typeKey).toBe(false);
    }
  });

  it('creates no contact for a custom type whose outcome is Filtered or Ignored', () => {
    const custom: RoutableConversationType[] = [
      ...startingTypes,
      {
        key: 'telemarketer',
        outcome: 'filter',
        ticketType: null,
        priority: null,
        needsPerson: false,
        alert: null,
        isActive: true,
      },
      {
        key: 'newsletter',
        outcome: 'ignore',
        ticketType: null,
        priority: null,
        needsPerson: false,
        alert: null,
        isActive: true,
      },
    ];
    expect(
      decideWith(classified('telemarketer', 0.9), noOpenRecords, everythingOn, custom).outcomes[0]!.keepContact,
    ).toBe(false);
    expect(
      decideWith(classified('newsletter', 0.9), noOpenRecords, everythingOn, custom).outcomes[0]!.keepContact,
    ).toBe(false);
  });

  it('keeps the contact when a business re-routes a type to a ticket or a log', () => {
    // Re-routing a built-in type does not make it a spam type; only the type's own key and the Filtered / Ignored outcomes do
    const rerouted = startingTypes.map((type) =>
      type.key === 'job_seeker'
        ? { ...type, outcome: 'ticket' as const, ticketType: 'other' as const, priority: 'low' as const }
        : type,
    );
    expect(decideWith(classified('job_seeker', 0.9), noOpenRecords, everythingOn, rerouted).outcomes[0]).toMatchObject({
      kind: 'ticket',
      keepContact: true,
    });
  });

  it('follows the business\'s own setting: "General question" is a lead until the business changes it to log only', () => {
    expect(decideWith(classified('general_question', 0.9)).outcomes[0]!.kind).toBe('lead');
    const logOnly = startingTypes.map((type) =>
      type.key === 'general_question' ? { ...type, outcome: 'log' as const } : type,
    );
    const decision = decideWith(classified('general_question', 0.9), noOpenRecords, everythingOn, logOnly);
    expect(decision.outcomes[0]).toMatchObject({ kind: 'log', movesLifecycleStage: false });
  });

  it("uses the hotel's extra types too", () => {
    const outcome = decideWith(classified('in_house_guest_request', 0.9)).outcomes[0]!;
    expect(outcome).toMatchObject({
      kind: 'ticket',
      ticket: { ticketType: 'other', priority: 'urgent' },
      alert: { who: 'front_desk', when: 'now' },
    });
  });

  it('asks a person to look at "unclear" and tells the alert number in office hours', () => {
    const decision = decideWith(classified('unclear', 0.9));
    expect(decision.outcomes[0]).toMatchObject({
      kind: 'review',
      needsPerson: true,
      alert: { who: 'alert_number', when: 'office_hours' },
    });
    expect(decision.needsPerson).toBe(true);
  });

  it('passes the AI\'s own "needs a person" through', () => {
    expect(decideWith(classified('new_enquiry', 0.9, { needsPerson: true })).needsPerson).toBe(true);
    expect(decideWith(classified('new_enquiry', 0.9)).needsPerson).toBe(false);
  });
});

describe('router: more than one reason', () => {
  it('gives a ticket AND a lead for a complaint plus a booking enquiry, the main reason first', () => {
    const decision = decideWith(
      classified('complaint', 0.92, { secondary: [{ typeKey: 'new_enquiry', confidence: 0.81 }] }),
    );
    expect(decision.primaryTypeKey).toBe('complaint');
    expect(decision.outcomes.map((outcome) => [outcome.typeKey, outcome.kind])).toEqual([
      ['complaint', 'ticket'],
      ['new_enquiry', 'lead'],
    ]);
  });

  it('marks a fairly sure secondary reason as unsure, and leaves out one below 0.40', () => {
    const decision = decideWith(
      classified('complaint', 0.92, {
        secondary: [
          { typeKey: 'new_enquiry', confidence: 0.5 },
          { typeKey: 'vendor_or_partner', confidence: 0.2 },
        ],
      }),
    );
    expect(decision.outcomes.map((outcome) => outcome.typeKey)).toEqual(['complaint', 'new_enquiry']);
    expect(decision.outcomes[1]!.aiUnsure).toBe(true);
    expect(decision.aiUnsure).toBe(true);
  });

  it('leaves out a secondary reason that does not exist, is switched off, or repeats the main one', () => {
    const decision = decideWith(
      classified('complaint', 0.92, {
        secondary: [
          { typeKey: 'made_up_type', confidence: 0.9 },
          { typeKey: 'complaint', confidence: 0.9 },
        ],
      }),
    );
    expect(decision.outcomes.map((outcome) => outcome.typeKey)).toEqual(['complaint']);
  });

  it('looks at no more than two secondary reasons', () => {
    const decision = decideWith(
      classified('complaint', 0.92, {
        secondary: [
          { typeKey: 'new_enquiry', confidence: 0.9 },
          { typeKey: 'vendor_or_partner', confidence: 0.9 },
          { typeKey: 'job_seeker', confidence: 0.9 },
        ],
      }),
    );
    expect(decision.outcomes.map((outcome) => outcome.typeKey)).toEqual([
      'complaint',
      'new_enquiry',
      'vendor_or_partner',
    ]);
  });

  it('keeps one outcome of each kind: two types that both make a lead make one lead, the first', () => {
    const decision = decideWith(
      classified('new_enquiry', 0.9, { secondary: [{ typeKey: 'event_or_group_enquiry', confidence: 0.9 }] }),
    );
    expect(decision.outcomes.map((outcome) => [outcome.typeKey, outcome.kind])).toEqual([['new_enquiry', 'lead']]);
  });

  it('keeps one ticket when two types both make tickets, and the first (more important) one wins', () => {
    const decision = decideWith(
      classified('complaint', 0.9, { secondary: [{ typeKey: 'existing_customer', confidence: 0.9 }] }),
    );
    expect(decision.outcomes).toHaveLength(1);
    expect(decision.outcomes[0]).toMatchObject({ typeKey: 'complaint', ticket: { ticketType: 'complaint' } });
  });

  it('does not let a guess at a secondary reason create a lead when the main reason is "unclear"', () => {
    const decision = decideWith(
      classified('new_enquiry', 0.2, { secondary: [{ typeKey: 'complaint', confidence: 0.3 }] }),
    );
    expect(decision.outcomes.map((outcome) => outcome.kind)).toEqual(['review']);
  });
});

describe('router: open records are reused', () => {
  it("puts a new enquiry onto the person's open lead", () => {
    const decision = decideWith(classified('new_enquiry', 0.9), { openLead: { id: 'lead-1' }, openTicket: null });
    expect(decision.outcomes[0]).toMatchObject({ kind: 'lead', reuseLeadId: 'lead-1' });
  });

  it('puts a follow-up onto the open ticket of the same kind, and makes a new ticket for another kind', () => {
    const context: RoutingContext = { openLead: null, openTicket: { id: 'ticket-1', ticketType: 'complaint' } };
    expect(decideWith(classified('complaint', 0.9), context).outcomes[0]).toMatchObject({ reuseTicketId: 'ticket-1' });
    expect(decideWith(classified('callback_request', 0.9), context).outcomes[0]).toMatchObject({
      kind: 'ticket',
      reuseTicketId: null,
    });
  });

  it('never attaches a lead id to something that is not a lead, or a ticket id to something that is not a ticket', () => {
    const context: RoutingContext = {
      openLead: { id: 'lead-1' },
      openTicket: { id: 'ticket-1', ticketType: 'complaint' },
    };
    expect(decideWith(classified('vendor_or_partner', 0.9), context).outcomes[0]).toMatchObject({
      reuseLeadId: null,
      reuseTicketId: null,
    });
    expect(decideWith(classified('complaint', 0.9), context).outcomes[0]).toMatchObject({ reuseLeadId: null });
  });
});

describe('router: a module that is off', () => {
  const leadEngineOff: AccountRules = { leadsActive: false };

  it('turns a lead into "only log it" plus a callback task when the lead engine is off', () => {
    const decision = decideWith(
      classified('new_enquiry', 0.9),
      { openLead: { id: 'lead-1' }, openTicket: null },
      leadEngineOff,
    );
    expect(decision.outcomes[0]).toMatchObject({
      typeKey: 'new_enquiry',
      kind: 'log',
      createCallbackTask: true,
      movesLifecycleStage: false,
      reuseLeadId: null,
    });
  });

  it('leaves tickets alone (they are core and always on)', () => {
    expect(decideWith(classified('complaint', 0.9), noOpenRecords, leadEngineOff).outcomes[0]).toMatchObject({
      kind: 'ticket',
      createCallbackTask: false,
    });
  });

  it("keeps a complaint's ticket and a booking enquiry's callback task side by side", () => {
    const decision = decideWith(
      classified('complaint', 0.9, { secondary: [{ typeKey: 'new_enquiry', confidence: 0.9 }] }),
      noOpenRecords,
      leadEngineOff,
    );
    expect(decision.outcomes.map((outcome) => [outcome.kind, outcome.createCallbackTask])).toEqual([
      ['ticket', false],
      ['log', true],
    ]);
  });
});

describe('router: running it again', () => {
  it('gives the same decision for the same input, and does not change the input', () => {
    const classification = classified('complaint', 0.9, { secondary: [{ typeKey: 'new_enquiry', confidence: 0.7 }] });
    const before = JSON.stringify(classification);
    const first = decideWith(classification);
    const second = decideWith(classification);
    expect(second).toEqual(first);
    expect(JSON.stringify(classification)).toBe(before);
  });

  it('after a staff correction to another type, gives the outcomes of the new type (each outcome names the type that made it)', () => {
    const first = decideWith(classified('new_enquiry', 0.9));
    const corrected = decideWith(classified('existing_customer', 1));
    expect(first.outcomes[0]).toMatchObject({ typeKey: 'new_enquiry', kind: 'lead' });
    expect(corrected.outcomes[0]).toMatchObject({
      typeKey: 'existing_customer',
      kind: 'ticket',
      ticket: { ticketType: 'existing_customer' },
    });
  });

  it('gives a decision for a rule-made classification (confidence 1) such as spam from the pre-filter', () => {
    const decision = decideWith(classified('spam', 1));
    expect(decision.outcomes[0]).toMatchObject({ kind: 'filter', keepContact: false, aiUnsure: false });
  });
});
