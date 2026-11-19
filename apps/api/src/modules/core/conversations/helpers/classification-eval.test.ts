import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPLAINT_RECALL_TARGET,
  FALSE_LEAD_RATE_LIMIT,
  PRIMARY_ACCURACY_TARGET,
  parseEvalExamples,
  parseEvalTranscript,
  scoreEvalResults,
  typesThatWouldBeApplied,
  type EvalExample,
  type EvalResult,
} from './classification-eval';
import { INDUSTRY_CONVERSATION_TYPES, SYSTEM_CONVERSATION_TYPES } from './default-conversation-types';
import type { TypeClassification } from './router';

const leadTypes = new Set(['new_enquiry', 'general_question']);

const example = (id: string, primary: string, secondary?: string[]): EvalExample => ({
  id,
  text: `text of ${id}`,
  primary,
  ...(secondary ? { secondary } : {}),
});

const said = (primary: string, confidence = 0.9, secondary: Array<[string, number]> = []): TypeClassification => ({
  primary: { typeKey: primary, confidence },
  secondary: secondary.map(([typeKey, otherConfidence]) => ({ typeKey, confidence: otherConfidence })),
  needsPerson: false,
});

describe('typesThatWouldBeApplied', () => {
  it('is the main type and the fairly sure secondary types', () => {
    expect(
      typesThatWouldBeApplied(
        said('complaint', 0.9, [
          ['new_enquiry', 0.5],
          ['spam', 0.2],
        ]),
      ),
    ).toEqual({
      primary: 'complaint',
      all: ['complaint', 'new_enquiry'],
    });
  });
  it('is "unclear" when the main type is below 0.40', () => {
    expect(typesThatWouldBeApplied(said('new_enquiry', 0.3))).toEqual({ primary: 'unclear', all: ['unclear'] });
  });
});

describe('scoreEvalResults', () => {
  it('counts the main type right or wrong and lists the misses', () => {
    const report = scoreEvalResults(
      [
        { example: example('a', 'new_enquiry'), predicted: said('new_enquiry') },
        { example: example('b', 'complaint'), predicted: said('new_enquiry') },
      ],
      leadTypes,
    );
    expect(report.total).toBe(2);
    expect(report.primaryAccuracy).toBe(0.5);
    expect(report.misses).toEqual([{ id: 'b', expected: 'complaint', got: 'new_enquiry' }]);
    expect(report.passes.primaryAccuracy).toBe(false);
  });

  it('counts a complaint as raised when the AI names it as the main type, or as a sure-enough second reason, and not otherwise', () => {
    const complaints: EvalResult[] = [
      { example: example('c1', 'complaint'), predicted: said('complaint') },
      { example: example('c2', 'complaint'), predicted: said('new_enquiry', 0.9, [['complaint', 0.6]]) },
      { example: example('c3', 'complaint'), predicted: said('new_enquiry', 0.9, [['complaint', 0.3]]) },
      { example: example('c4', 'complaint'), predicted: said('complaint', 0.2) },
    ];
    const report = scoreEvalResults(complaints, leadTypes);
    expect(report.complaintRecall).toBe(0.5);
    expect(report.passes.complaintRecall).toBe(false);
  });

  it("counts a false lead when nothing in the example is sales but the AI's answer would create a lead", () => {
    const report = scoreEvalResults(
      [
        { example: example('s1', 'spam'), predicted: said('new_enquiry') },
        { example: example('s2', 'spam'), predicted: said('spam') },
        {
          example: example('s3', 'vendor_or_partner'),
          predicted: said('vendor_or_partner', 0.9, [['general_question', 0.5]]),
        },
        // A complaint that really also asks for a price may rightly create a lead, so it is not a false lead
        {
          example: example('s4', 'complaint', ['new_enquiry']),
          predicted: said('complaint', 0.9, [['new_enquiry', 0.8]]),
        },
      ],
      leadTypes,
    );
    expect(report.falseLeadRate).toBeCloseTo(2 / 3);
    expect(report.passes.falseLeadRate).toBe(false);
  });

  it('passes when all three numbers meet their targets', () => {
    const results: EvalResult[] = [];
    for (let number = 0; number < 20; number += 1) {
      results.push({ example: example(`ok${number}`, 'complaint'), predicted: said('complaint') });
      results.push({ example: example(`sp${number}`, 'spam'), predicted: said('spam') });
    }
    const report = scoreEvalResults(results, leadTypes);
    expect(report).toMatchObject({ primaryAccuracy: 1, complaintRecall: 1, falseLeadRate: 0 });
    expect(report.passes).toEqual({ primaryAccuracy: true, complaintRecall: true, falseLeadRate: true });
  });

  it('does not fail a number there is nothing to measure for', () => {
    const report = scoreEvalResults(
      [{ example: example('a', 'new_enquiry'), predicted: said('new_enquiry') }],
      leadTypes,
    );
    expect(report.complaintRecall).toBeNull();
    expect(report.falseLeadRate).toBeNull();
    expect(report.passes).toEqual({ primaryAccuracy: true, complaintRecall: true, falseLeadRate: true });
  });

  it('has the targets from the design: 90% right, 95% of complaints kept, at most 5% false leads', () => {
    expect([PRIMARY_ACCURACY_TARGET, COMPLAINT_RECALL_TARGET, FALSE_LEAD_RATE_LIMIT]).toEqual([0.9, 0.95, 0.05]);
  });
});

describe('parseEvalExamples', () => {
  it('reads one example per line and ignores blank lines', () => {
    const examples = parseEvalExamples(
      '{"id":"a","text":"hi","primary":"unclear"}\n\n{"id":"b","text":"yo","primary":"spam","secondary":["new_enquiry"]}\n',
    );
    expect(examples.map((item) => item.id)).toEqual(['a', 'b']);
    expect(examples[1]!.secondary).toEqual(['new_enquiry']);
  });

  it('says which line is wrong', () => {
    expect(() => parseEvalExamples('not json')).toThrow('line 1');
    expect(() => parseEvalExamples('{"id":"a","text":"hi"}')).toThrow('a has no primary type');
    expect(() => parseEvalExamples('{"id":"a","text":"x","primary":"y"}\n{"id":"a","text":"x","primary":"y"}')).toThrow(
      'used twice',
    );
    expect(() => parseEvalExamples('{"id":"a","text":"x","primary":"y","secondary":"z"}')).toThrow('secondary');
  });
});

describe('parseEvalTranscript', () => {
  it('reads a plain message as one customer line', () => {
    expect(parseEvalTranscript('Is there parking?')).toEqual([{ speaker: 'customer', text: 'Is there parking?' }]);
  });
  it('reads a conversation with turns, keeping extra lines with the line before', () => {
    expect(parseEvalTranscript('Customer: Hello\nBusiness: Hi there\nCustomer: A question\nabout rooms')).toEqual([
      { speaker: 'customer', text: 'Hello' },
      { speaker: 'business', text: 'Hi there' },
      { speaker: 'customer', text: 'A question\nabout rooms' },
    ]);
  });
});

describe('the hotel example set (evals/classification/hotel_resort.jsonl)', () => {
  const file = path.resolve(import.meta.dirname, '../../../../../../../evals/classification/hotel_resort.jsonl');
  const examples = parseEvalExamples(fs.readFileSync(file, 'utf8'));
  const hotelTypeKeys = new Set(
    [...SYSTEM_CONVERSATION_TYPES, ...(INDUSTRY_CONVERSATION_TYPES.hotel_resort ?? [])].map((type) => type.key),
  );

  it('uses only types a hotel has, for the main and the other reasons', () => {
    for (const item of examples) {
      expect(hotelTypeKeys.has(item.primary), `${item.id}: ${item.primary}`).toBe(true);
      for (const other of item.secondary ?? []) expect(hotelTypeKeys.has(other), `${item.id}: ${other}`).toBe(true);
    }
  });

  it('has at least three examples of each type that people (not code) decide, so no type is left unmeasured', () => {
    const decidedByCode = new Set(['no_conversation', 'automated', 'internal']);
    for (const typeKey of hotelTypeKeys) {
      if (decidedByCode.has(typeKey)) continue;
      const count = examples.filter((item) => item.primary === typeKey).length;
      expect(count, typeKey).toBeGreaterThanOrEqual(3);
    }
  });

  it('has enough complaints and non-sales conversations for the targets to mean something', () => {
    expect(examples.filter((item) => item.primary === 'complaint').length).toBeGreaterThanOrEqual(8);
    const leadTypeKeys = new Set(['new_enquiry', 'general_question', 'event_or_group_enquiry']);
    const notSales = examples.filter(
      (item) => ![item.primary, ...(item.secondary ?? [])].some((key) => leadTypeKeys.has(key)),
    );
    expect(notSales.length).toBeGreaterThanOrEqual(30);
  });

  it('includes complaints that also ask for a price (two reasons) and messages that try to give the AI orders', () => {
    expect(
      examples.some((item) => item.primary === 'complaint' && (item.secondary ?? []).includes('new_enquiry')),
    ).toBe(true);
    expect(
      examples.some((item) =>
        /ignore all previous instructions|you are now in developer mode|SYSTEM:/i.test(item.text),
      ),
    ).toBe(true);
  });

  it('keeps every text short enough for a quick, cheap run', () => {
    for (const item of examples) expect(item.text.length, item.id).toBeLessThan(600);
  });
});
