import { describe, expect, it } from 'vitest';
import type { PipelineStage } from '@toobler-one/shared';
import {
  buildLeadsPath,
  countActiveFilters,
  DEFAULT_LEADS_VIEW,
  describeOrder,
  describeSort,
  findDefaultOrder,
  findStageChoices,
  readLeadsView,
  writeLeadsView,
} from './leads-view';

const QUOTED_ID = '0191f0a0-0000-7000-8000-0000000000aa';

describe('readLeadsView', () => {
  it('gives the default view for an empty address', () => {
    expect(readLeadsView(new URLSearchParams(''))).toEqual(DEFAULT_LEADS_VIEW);
  });
  it('reads every choice', () => {
    const view = readLeadsView(
      new URLSearchParams(`status=closed&stage=${QUOTED_ID}&owner=me&sort=callbackAt&order=asc&page=3`),
    );
    expect(view).toEqual({
      status: 'closed',
      stageId: QUOTED_ID,
      owner: 'me',
      sort: 'callbackAt',
      order: 'asc',
      page: 3,
    });
  });
  it('ignores anything it does not understand, so a bad link never breaks the page', () => {
    const view = readLeadsView(
      new URLSearchParams('status=maybe&stage=not-an-id&owner=all&sort=name&order=sideways&page=0'),
    );
    expect(view).toEqual(DEFAULT_LEADS_VIEW);
    expect(readLeadsView(new URLSearchParams('page=abc')).page).toBe(1);
    expect(readLeadsView(new URLSearchParams('page=2.5')).page).toBe(1);
  });
});

describe('writeLeadsView', () => {
  it('writes nothing for the default view', () => {
    expect(writeLeadsView(DEFAULT_LEADS_VIEW).toString()).toBe('');
  });
  it('writes only what differs, and reads back to the same view', () => {
    const view = {
      ...DEFAULT_LEADS_VIEW,
      status: 'closed' as const,
      stageId: QUOTED_ID,
      sort: 'stage' as const,
      page: 2,
    };
    const written = writeLeadsView(view);
    expect(written.get('order')).toBeNull();
    expect(readLeadsView(written)).toEqual(view);
  });
});

describe('buildLeadsPath', () => {
  it('asks for the plain open list by default', () => {
    expect(buildLeadsPath(DEFAULT_LEADS_VIEW, 'me-id')).toBe(
      '/leads?status=open&sort=lastActivity&order=desc&page=1&limit=25',
    );
  });
  it('adds the stage and, for "only mine", the signed-in person', () => {
    const path = buildLeadsPath({ ...DEFAULT_LEADS_VIEW, stageId: QUOTED_ID, owner: 'me', status: 'closed' }, 'me-id');
    expect(path).toContain(`stageId=${QUOTED_ID}`);
    expect(path).toContain('ownerUserId=me-id');
    expect(path).toContain('status=closed');
  });
});

describe('countActiveFilters', () => {
  it('counts closed leads, a stage and "only mine" as one each', () => {
    expect(countActiveFilters(DEFAULT_LEADS_VIEW)).toBe(0);
    expect(countActiveFilters({ ...DEFAULT_LEADS_VIEW, status: 'closed' })).toBe(1);
    expect(countActiveFilters({ ...DEFAULT_LEADS_VIEW, status: 'closed', stageId: QUOTED_ID, owner: 'me' })).toBe(3);
  });
  it('does not count the sort or the page as a filter', () => {
    expect(countActiveFilters({ ...DEFAULT_LEADS_VIEW, sort: 'stage', order: 'asc', page: 4 })).toBe(0);
  });
});

describe('findStageChoices', () => {
  const stage = (id: string, kind: PipelineStage['kind']): PipelineStage => ({
    id,
    name: id,
    kind,
    sort: 0,
    leadCount: 0,
  });
  const stages = [stage('New', 'open'), stage('Quoted', 'open'), stage('Won', 'won'), stage('Lost', 'lost')];
  it('offers the open stages for open leads and Won and Lost for closed leads', () => {
    expect(findStageChoices(stages, 'open').map((choice) => choice.id)).toEqual(['New', 'Quoted']);
    expect(findStageChoices(stages, 'closed').map((choice) => choice.id)).toEqual(['Won', 'Lost']);
  });
});

describe('findDefaultOrder', () => {
  it('starts callbacks and the pipeline at the front, and everything else at the newest', () => {
    expect(findDefaultOrder('callbackAt')).toBe('asc');
    expect(findDefaultOrder('stage')).toBe('asc');
    expect(findDefaultOrder('lastActivity')).toBe('desc');
    expect(findDefaultOrder('createdAt')).toBe('desc');
  });
});

describe('the words for sorting', () => {
  it('names each sort and gives its two directions in matching words', () => {
    expect(describeSort('callbackAt')).toBe('Next callback');
    expect(describeOrder('callbackAt', 'asc')).toBe('Soonest first');
    expect(describeOrder('callbackAt', 'desc')).toBe('Latest first');
    expect(describeOrder('createdAt', 'desc')).toBe('Newest first');
    expect(describeOrder('createdAt', 'asc')).toBe('Oldest first');
  });
});
