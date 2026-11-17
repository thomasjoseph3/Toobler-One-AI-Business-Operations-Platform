import type { GoLiveBlocker, SetupStep, SetupStepKey, SetupStepStatus } from '@toobler-one/shared';
import type { MessageKey } from '../../app/i18n';

// What the Setup page needs to decide about the wizard's steps. Pure: no screen, no network.

/** How the owner finishes one step: by going to a page and marking it, by a button on this page, or by the system noticing. */
export type StepAction =
  | { kind: 'open_page'; path: string; labelKey: MessageKey }
  | { kind: 'apply_preset' }
  | { kind: 'system_checked'; labelKey: MessageKey; path: string | null };

export interface StepDescription {
  titleKey: MessageKey;
  helpKey: MessageKey;
  action: StepAction;
  /** Whether the owner may skip it. The steps the system checks, and the ones going live needs, cannot be skipped. */
  canBeSkipped: boolean;
}

/** The words and the way to finish each step. The steps themselves (and their order) come from the API. */
export const STEP_DESCRIPTIONS: Readonly<Record<SetupStepKey, StepDescription>> = {
  website: {
    titleKey: 'setup.step.website.title',
    helpKey: 'setup.step.website.help',
    action: { kind: 'open_page', path: '/knowledge', labelKey: 'setup.step.website.action' },
    canBeSkipped: true,
  },
  about_business: {
    titleKey: 'setup.step.about_business.title',
    helpKey: 'setup.step.about_business.help',
    action: { kind: 'system_checked', path: '/knowledge', labelKey: 'setup.step.about_business.action' },
    canBeSkipped: false,
  },
  what_you_sell: {
    titleKey: 'setup.step.what_you_sell.title',
    helpKey: 'setup.step.what_you_sell.help',
    action: { kind: 'system_checked', path: '/knowledge/what-you-sell', labelKey: 'setup.step.what_you_sell.action' },
    canBeSkipped: false,
  },
  situations: {
    titleKey: 'setup.step.situations.title',
    helpKey: 'setup.step.situations.help',
    action: { kind: 'open_page', path: '/knowledge', labelKey: 'setup.step.situations.action' },
    canBeSkipped: true,
  },
  goals: {
    titleKey: 'setup.step.goals.title',
    helpKey: 'setup.step.goals.help',
    action: { kind: 'open_page', path: '/knowledge', labelKey: 'setup.step.goals.action' },
    canBeSkipped: true,
  },
  promises: {
    titleKey: 'setup.step.promises.title',
    helpKey: 'setup.step.promises.help',
    action: { kind: 'open_page', path: '/knowledge', labelKey: 'setup.step.promises.action' },
    canBeSkipped: false,
  },
  pipeline: {
    titleKey: 'setup.step.pipeline.title',
    helpKey: 'setup.step.pipeline.help',
    action: { kind: 'apply_preset' },
    canBeSkipped: true,
  },
  team: {
    titleKey: 'setup.step.team.title',
    helpKey: 'setup.step.team.help',
    action: { kind: 'system_checked', path: null, labelKey: 'setup.step.team.action' },
    canBeSkipped: true,
  },
  channels: {
    titleKey: 'setup.step.channels.title',
    helpKey: 'setup.step.channels.help',
    action: { kind: 'system_checked', path: null, labelKey: 'setup.step.channels.action' },
    canBeSkipped: true,
  },
  test_agent: {
    titleKey: 'setup.step.test_agent.title',
    helpKey: 'setup.step.test_agent.help',
    action: { kind: 'system_checked', path: '/knowledge/test-agent', labelKey: 'setup.step.test_agent.action' },
    canBeSkipped: false,
  },
};

/** The steps of one part of the wizard, in order. Part 1 teaches the AI about the business; part 2 gets it ready for customers. */
export function stepsOfPart(steps: readonly SetupStep[], part: 1 | 2): SetupStep[] {
  return steps.filter((step) => step.part === part);
}

/**
 * Which buttons a step offers the owner:
 * - `mark_done` and `skip` for a step the owner marks (not for one the system checks);
 * - `reopen` once it is done or skipped, to put it back to "to do".
 * Steps the system checks offer none: they finish by themselves.
 */
export function describeStepButtons(step: SetupStep): Array<'mark_done' | 'skip' | 'reopen'> {
  if (step.checkedBySystem) return [];
  const description = STEP_DESCRIPTIONS[step.key];
  if (step.status !== 'todo') return ['reopen'];
  if (step.key === 'pipeline') return description.canBeSkipped ? ['skip'] : []; // applying the words marks it done
  return description.canBeSkipped ? ['mark_done', 'skip'] : ['mark_done'];
}

/** The status a button sets. */
export function statusAfterButton(button: 'mark_done' | 'skip' | 'reopen'): SetupStepStatus {
  return button === 'mark_done' ? 'done' : button === 'skip' ? 'skipped' : 'todo';
}

/** Whether the steps of a part are all done or skipped (for the part's heading). */
export function countFinishedSteps(steps: readonly SetupStep[]): { finished: number; total: number } {
  return { finished: steps.filter((step) => step.status !== 'todo').length, total: steps.length };
}

/** What a blocker says in plain words: the question's own text, or the name of the step. */
export function describeBlocker(
  blocker: GoLiveBlocker,
  questionTexts: ReadonlyMap<string, string>,
  stepTitle: (step: SetupStepKey) => string,
): string {
  if (blocker.kind === 'question') return questionTexts.get(blocker.key) ?? blocker.key;
  return stepTitle(blocker.key as SetupStepKey);
}

/** The first step that is still to do, so the page can point at it. Undefined when every step is done or skipped. */
export function findNextStep(steps: readonly SetupStep[]): SetupStep | undefined {
  return steps.find((step) => step.status === 'todo');
}
