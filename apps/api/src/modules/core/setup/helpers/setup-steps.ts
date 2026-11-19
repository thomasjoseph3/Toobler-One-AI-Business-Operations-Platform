import type { SetupStep, SetupStepKey, SetupStepStatus } from '@toobler-one/shared';

// The list of setup steps and the progress sums. Pure: no database, no AI (the AI never does maths).

interface StepDefinition {
  key: SetupStepKey;
  /** 1 teaches the AI about the business; 2 gets the business ready to answer customers. */
  part: 1 | 2;
  /** True when the system works the status out from the business's answers, so the owner cannot mark it. */
  checkedBySystem: boolean;
}

/** The steps in the order the owner meets them (docs/features/F31-setup-wizard.md). */
export const SETUP_STEPS: readonly StepDefinition[] = [
  { key: 'website', part: 1, checkedBySystem: false },
  { key: 'about_business', part: 1, checkedBySystem: true },
  { key: 'what_you_sell', part: 1, checkedBySystem: true },
  { key: 'situations', part: 1, checkedBySystem: false },
  { key: 'goals', part: 1, checkedBySystem: false },
  { key: 'promises', part: 2, checkedBySystem: false },
  { key: 'pipeline', part: 2, checkedBySystem: false },
  { key: 'team', part: 2, checkedBySystem: false },
  { key: 'channels', part: 2, checkedBySystem: false },
  { key: 'test_agent', part: 2, checkedBySystem: true },
];

/** What the system found out about the steps it checks itself. */
export interface CheckedStepFacts {
  /** Every "needed to go live" question in "About your business" has a confirmed answer. */
  aboutBusinessAnswered: boolean;
  /** The business has at least one offering switched on. */
  hasOfferingSwitchedOn: boolean;
  /** The owner has had at least one reply from the agent in "Test the agent". */
  hasTriedTheAgent: boolean;
}

/** Whether the step is one the system checks by itself (an unknown key is not). */
export function isCheckedBySystem(stepKey: SetupStepKey): boolean {
  return SETUP_STEPS.some((step) => step.key === stepKey && step.checkedBySystem);
}

/**
 * Every step with its status. A step the system checks is "done" or "todo" from the facts; any other step is what the owner
 * marked, or "todo" when the owner has not marked it.
 */
export function resolveSetupSteps(
  markedByOwner: ReadonlyMap<string, SetupStepStatus>,
  facts: CheckedStepFacts,
): SetupStep[] {
  return SETUP_STEPS.map((step) => {
    let status: SetupStepStatus;
    if (step.key === 'about_business') status = facts.aboutBusinessAnswered ? 'done' : 'todo';
    else if (step.key === 'what_you_sell') status = facts.hasOfferingSwitchedOn ? 'done' : 'todo';
    else if (step.key === 'test_agent') status = facts.hasTriedTheAgent ? 'done' : 'todo';
    else status = markedByOwner.get(step.key) ?? 'todo';
    return { key: step.key, part: step.part, checkedBySystem: step.checkedBySystem, status };
  });
}

/** How many steps are done, out of all steps, as a whole percent. Skipped steps do not count as done. */
export function computePercentDone(steps: readonly SetupStep[]): number {
  if (steps.length === 0) return 0;
  const doneSteps = steps.filter((step) => step.status === 'done').length;
  return Math.round((doneSteps / steps.length) * 100);
}
