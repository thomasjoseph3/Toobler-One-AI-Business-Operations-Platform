import { describe, expect, it } from 'vitest';
import type { BoardColumn, Lead } from '@toobler-one/shared';
import { moveLeadInColumns } from './board-move';

const lead = (id: string, stageId: string): Lead =>
  ({ id, stage: { id: stageId, name: stageId, kind: 'open' }, contact: null }) as unknown as Lead;
const column = (
  stageId: string,
  kind: BoardColumn['stage']['kind'],
  leads: Lead[],
  leadCount = leads.length,
): BoardColumn => ({
  stage: { id: stageId, name: stageId.toUpperCase(), kind, sort: 0 },
  leadCount,
  leads,
  hasMore: false,
});

describe('moveLeadInColumns', () => {
  const columns = [
    column('a', 'open', [lead('1', 'a'), lead('2', 'a')]),
    column('b', 'open', [lead('3', 'b')]),
    column('won', 'won', []),
  ];

  it('takes the card out of its column and puts it first in the new one, changing its stage and both counts', () => {
    const moved = moveLeadInColumns(columns, '2', 'b');
    expect(moved[0]!.leads.map((item) => item.id)).toEqual(['1']);
    expect(moved[0]!.leadCount).toBe(1);
    expect(moved[1]!.leads.map((item) => item.id)).toEqual(['2', '3']);
    expect(moved[1]!.leadCount).toBe(2);
    expect(moved[1]!.leads[0]!.stage).toEqual({ id: 'b', name: 'B', kind: 'open' });
  });

  it('keeps the full count when a column shows only some of its leads', () => {
    const wide = [column('a', 'open', [lead('1', 'a')], 60), column('b', 'open', [], 5)];
    const moved = moveLeadInColumns(wide, '1', 'b');
    expect(moved[0]!.leadCount).toBe(59);
    expect(moved[1]!.leadCount).toBe(6);
  });

  it('never changes the columns it was given', () => {
    const before = JSON.stringify(columns);
    moveLeadInColumns(columns, '2', 'b');
    expect(JSON.stringify(columns)).toBe(before);
  });

  it('can move the card back, which is how a refused move is undone', () => {
    const there = moveLeadInColumns(columns, '2', 'won');
    const back = moveLeadInColumns(there, '2', 'a');
    expect(back[0]!.leads.map((item) => item.id)).toContain('2');
    expect(back[2]!.leadCount).toBe(0);
  });

  it('changes nothing for a lead not on the board, a column that does not exist, or the column it is already in', () => {
    expect(moveLeadInColumns(columns, 'nope', 'b')).toEqual(columns);
    expect(moveLeadInColumns(columns, '1', 'nope')).toEqual(columns);
    expect(moveLeadInColumns(columns, '1', 'a')).toEqual(columns);
  });
});
