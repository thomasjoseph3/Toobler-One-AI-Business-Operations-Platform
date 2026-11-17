import { describe, expect, it } from 'vitest';
import type { PipelineStage } from '@toobler-one/shared';
import { listOpenStageIdsInOrder, moveStageInOrder } from './stage-order';

const stage = (id: string, kind: PipelineStage['kind'], sort: number): PipelineStage => ({ id, name: id, kind, sort, leadCount: 0 });

describe('listOpenStageIdsInOrder', () => {
  it('lists only the open stages, in board order', () => {
    expect(listOpenStageIdsInOrder([stage('b', 'open', 1), stage('won', 'won', 3), stage('a', 'open', 0), stage('lost', 'lost', 4)])).toEqual(['a', 'b']);
  });
});

describe('moveStageInOrder', () => {
  const order = ['a', 'b', 'c'];

  it('moves a stage one place left or right', () => {
    expect(moveStageInOrder(order, 'b', 'left')).toEqual(['b', 'a', 'c']);
    expect(moveStageInOrder(order, 'b', 'right')).toEqual(['a', 'c', 'b']);
  });

  it('does not change the list it was given', () => {
    moveStageInOrder(order, 'b', 'left');
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('says it cannot move past either end, or a stage that is not open', () => {
    expect(moveStageInOrder(order, 'a', 'left')).toBeNull();
    expect(moveStageInOrder(order, 'c', 'right')).toBeNull();
    expect(moveStageInOrder(order, 'won', 'left')).toBeNull();
  });
});
