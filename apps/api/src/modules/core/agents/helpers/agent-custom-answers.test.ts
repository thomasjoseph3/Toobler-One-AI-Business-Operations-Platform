import type { FieldDefinition } from '@toobler-one/shared';
import { describe, expect, it } from 'vitest';
import { EMPTY_AGENT_CONVERSATION_STATE } from './agent-conversation-state';
import {
  findFieldsStillToAsk,
  makeCustomAnswerName,
  recordCustomAnswers,
  saveCustomAnswersInputSchema,
  splitCustomAnswersByRecord,
} from './agent-custom-answers';

const carModel: FieldDefinition = {
  id: '1',
  object: 'contact',
  key: 'car_model',
  label: 'Car model',
  type: 'dropdown',
  options: ['Swift', 'Baleno'],
  aiAsks: true,
  requiredForWon: false,
};
const guestCount: FieldDefinition = {
  id: '2',
  object: 'lead',
  key: 'guest_count',
  label: 'Guest count',
  type: 'number',
  options: [],
  aiAsks: true,
  requiredForWon: false,
};

describe('recordCustomAnswers', () => {
  it('saves a fitting answer, tidied by the shared check, under the record and key', () => {
    const change = recordCustomAnswers(
      EMPTY_AGENT_CONVERSATION_STATE,
      {
        answers: [
          { field: 'car MODEL', answer: 'swift' },
          { field: 'Guest count', answer: '1,200' },
        ],
      },
      [carModel, guestCount],
    );
    expect(change.state.customAnswers).toEqual({ 'contact.car_model': 'Swift', 'lead.guest_count': 1200 });
    expect(change.messageForModel).toBe('Saved.');
  });

  it('refuses an answer that does not fit and tells the model to ask again, keeping earlier answers', () => {
    const before = { ...EMPTY_AGENT_CONVERSATION_STATE, customAnswers: { 'lead.guest_count': 50 } };
    const change = recordCustomAnswers(before, { answers: [{ field: 'Car model', answer: 'Tesla' }] }, [
      carModel,
      guestCount,
    ]);
    expect(change.state.customAnswers).toEqual({ 'lead.guest_count': 50 });
    expect(change.messageForModel).toContain('needs one of: Swift, Baleno');
  });

  it('refuses a field the AI was not told to ask', () => {
    const change = recordCustomAnswers(
      EMPTY_AGENT_CONVERSATION_STATE,
      { answers: [{ field: 'Salary', answer: '5' }] },
      [carModel],
    );
    expect(change.state.customAnswers).toEqual({});
    expect(change.messageForModel).toContain('not a field you ask about');
  });

  it('does not change the old state', () => {
    recordCustomAnswers(EMPTY_AGENT_CONVERSATION_STATE, { answers: [{ field: 'Guest count', answer: '3' }] }, [
      guestCount,
    ]);
    expect(EMPTY_AGENT_CONVERSATION_STATE.customAnswers).toEqual({});
  });
});

describe('the rest', () => {
  it('limits what the model may send', () => {
    expect(saveCustomAnswersInputSchema.safeParse({ answers: [] }).success).toBe(false);
    expect(saveCustomAnswersInputSchema.safeParse({ answers: [{ field: 'A', answer: 'b', extra: 1 }] }).success).toBe(
      false,
    );
  });
  it('lists the fields still to ask', () => {
    expect(findFieldsStillToAsk([carModel, guestCount], { [makeCustomAnswerName(carModel)]: 'Swift' })).toEqual([
      guestCount,
    ]);
  });
  it('splits answers by record and drops fields no longer live', () => {
    expect(
      splitCustomAnswersByRecord(
        { 'contact.car_model': 'Swift', 'contact.gone': 'x', 'lead.guest_count': 4, broken: 'y' },
        { contact: ['car_model'], lead: ['guest_count'] },
      ),
    ).toEqual({ contact: { car_model: 'Swift' }, lead: { guest_count: 4 } });
  });
});
