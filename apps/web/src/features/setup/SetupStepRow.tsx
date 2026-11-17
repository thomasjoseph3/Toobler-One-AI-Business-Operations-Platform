import { useState } from 'react';
import { Link } from 'react-router';
import type { ApplyPresetResponse, SetupStep } from '@toobler-one/shared';
import { Alert, Badge, Button, buttonClasses } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { describeSaveProblem } from '../knowledge/problem-message';
import { describeStepButtons, statusAfterButton, STEP_DESCRIPTIONS } from './setup-state';

const BUTTON_WORDS = {
  mark_done: 'setup.button.done',
  skip: 'setup.button.skip',
  reopen: 'setup.button.reopen',
} as const;

/**
 * One step of the setup: its name, whether it is done, what it is for, and what to do about it (go to the page, use the industry's words, or
 * wait for the system to notice). A manager can mark a step done or skip it, and reopen it. Staff only read.
 */
export function SetupStepRow({
  step,
  canEdit,
  onChanged,
}: {
  step: SetupStep;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const description = STEP_DESCRIPTIONS[step.key];
  const [problem, setProblem] = useState<string | null>(null);
  const [presetMessage, setPresetMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const mark = async (button: 'mark_done' | 'skip' | 'reopen') => {
    setIsWorking(true);
    setProblem(null);
    try {
      await apiRequest('PATCH', '/setup', { step: step.key, status: statusAfterButton(button) });
      onChanged();
    } catch (error) {
      setProblem(describeSaveProblem(error));
    } finally {
      setIsWorking(false);
    }
  };

  const applyPreset = async () => {
    setIsWorking(true);
    setProblem(null);
    setPresetMessage(null);
    try {
      const result = await apiRequest<ApplyPresetResponse>('POST', '/setup/apply-preset');
      const changed = result.renamedStages.length;
      const parts = [changed > 0 ? formatMessage('setup.preset.done', { count: changed }) : t('setup.preset.nothing')];
      if (result.leftAloneStages.length > 0)
        parts.push(formatMessage('setup.preset.leftAlone', { names: result.leftAloneStages.join(', ') }));
      setPresetMessage(parts.join(' '));
      onChanged();
    } catch (error) {
      setProblem(describeSaveProblem(error));
    } finally {
      setIsWorking(false);
    }
  };

  const title = t(description.titleKey);
  const action = description.action;
  return (
    <li className="flex flex-col gap-3 border-b border-border-default py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-label-md text-text-primary">{title}</h3>
        <Badge tone={step.status === 'done' ? 'success' : step.status === 'skipped' ? 'neutral' : 'warning'}>
          {t(`setup.status.${step.status}`)}
        </Badge>
      </div>
      <p className="text-body-md text-text-secondary">{t(description.helpKey)}</p>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          {action.kind === 'open_page' ? (
            <Link
              to={action.path}
              className={buttonClasses('secondary', 'compact')}
              aria-label={`${t(action.labelKey)}: ${title}`}
            >
              {t(action.labelKey)}
            </Link>
          ) : null}
          {action.kind === 'apply_preset' ? (
            <Button
              variant="secondary"
              size="compact"
              isLoading={isWorking}
              onClick={applyPreset}
              aria-label={`${t('setup.button.applyPreset')}: ${title}`}
            >
              {t('setup.button.applyPreset')}
            </Button>
          ) : null}
          {action.kind === 'system_checked' ? (
            action.path ? (
              <Link
                to={action.path}
                className={buttonClasses('secondary', 'compact')}
                aria-label={`${t(action.labelKey)}: ${title}`}
              >
                {t(action.labelKey)}
              </Link>
            ) : (
              <span className="text-label-sm text-text-secondary">{t(action.labelKey)}</span>
            )
          ) : null}
          {describeStepButtons(step).map((button) => (
            <Button
              key={button}
              variant={button === 'mark_done' ? 'primary' : 'tertiary'}
              size="compact"
              disabled={isWorking}
              onClick={() => mark(button)}
              aria-label={`${t(BUTTON_WORDS[button])}: ${title}`}
            >
              {t(BUTTON_WORDS[button])}
            </Button>
          ))}
        </div>
      ) : null}
      {presetMessage ? <Alert tone="success">{presetMessage}</Alert> : null}
      {problem ? <Alert tone="error">{problem}</Alert> : null}
    </li>
  );
}
