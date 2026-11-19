import { describe, expect, it } from 'vitest';
import { computeLifecycleStage } from './lifecycle';

const noFacts = { markedNotAFit: false, openLeads: 0, wonLeads: 0 };

describe('computeLifecycleStage', () => {
  it('is new when nothing has happened', () => {
    expect(computeLifecycleStage(noFacts)).toBe('new');
  });
  it('is lead while a lead is open', () => {
    expect(computeLifecycleStage({ ...noFacts, openLeads: 1 })).toBe('lead');
  });
  it('is customer after one won lead, and repeat customer after two or more', () => {
    expect(computeLifecycleStage({ ...noFacts, wonLeads: 1 })).toBe('customer');
    expect(computeLifecycleStage({ ...noFacts, wonLeads: 2 })).toBe('repeat_customer');
    expect(computeLifecycleStage({ ...noFacts, wonLeads: 5, openLeads: 2 })).toBe('repeat_customer');
  });
  it('stays a customer while another lead is open', () => {
    expect(computeLifecycleStage({ ...noFacts, wonLeads: 1, openLeads: 1 })).toBe('customer');
  });
  it('is not a fit whenever staff marked it, whatever else is true', () => {
    expect(computeLifecycleStage({ markedNotAFit: true, openLeads: 3, wonLeads: 4 })).toBe('not_a_fit');
  });
});
