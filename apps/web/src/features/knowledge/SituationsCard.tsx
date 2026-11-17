import { useState } from 'react';
import type { Situation } from '@toobler-one/shared';
import { Alert, Badge, Card } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import { describeSaveProblem } from './problem-message';

/** How the AI handles the seven common moments (a discount request, being full, a complaint...). Each has a choice already picked; a manager may change it. */
export function SituationsCard({
  situations,
  canEdit,
  onChanged,
}: {
  situations: readonly Situation[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  // The choice a person just made, shown at once while the save goes through (it is dropped again if the save fails)
  const [justChosen, setJustChosen] = useState<Record<string, string>>({});

  const choose = async (situation: Situation, choice: string) => {
    setProblem(null);
    setJustChosen((earlier) => ({ ...earlier, [situation.key]: choice }));
    try {
      await apiRequest('PUT', `/knowledge/situations/${situation.key}`, { choice });
      onChanged();
    } catch (error) {
      setJustChosen((earlier) => {
        const { [situation.key]: _dropped, ...rest } = earlier;
        return rest;
      });
      setProblem(describeSaveProblem(error));
    }
  };

  return (
    <Card>
      <h2 className="text-heading-sm text-text-primary">{t('knowledge.situations.title')}</h2>
      <p className="text-body-md mb-2 text-text-secondary">{t('knowledge.situations.description')}</p>
      {problem ? (
        <Alert tone="error" className="mb-3">
          {problem}
        </Alert>
      ) : null}
      <ul>
        {situations.map((situation) => (
          <li key={situation.key} className="border-b border-border-default py-4 last:border-b-0">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-label-md flex flex-wrap items-center gap-2 text-text-primary">
                {situation.text}
                {situation.fixed ? <Badge tone="neutral">{t('knowledge.situations.fixed')}</Badge> : null}
              </legend>
              {situation.choices.map((choice) => (
                <label
                  key={choice.key}
                  className="text-body-md flex min-h-10 cursor-pointer items-center gap-3 text-text-primary"
                >
                  <input
                    type="radio"
                    name={`situation-${situation.key}`}
                    value={choice.key}
                    checked={(justChosen[situation.key] ?? situation.selectedChoiceKey) === choice.key}
                    disabled={!canEdit || situation.fixed}
                    onChange={() => void choose(situation, choice.key)}
                    className="size-4 accent-[var(--color-action)]"
                  />
                  {choice.label}
                  {situation.selectedChoiceKey === choice.key && situation.isDefault && !situation.fixed ? (
                    <span className="text-label-sm text-text-secondary">({t('knowledge.situations.default')})</span>
                  ) : null}
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ul>
    </Card>
  );
}
