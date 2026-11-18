import { useState, type FormEvent } from 'react';
import type { Team, TeamMember } from '@toobler-one/shared';
import { Alert, Button, Checkbox, SidePanel, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import {
  buildEmptyTeamForm,
  checkTeamForm,
  describeTeamProblem,
  toggleTeamMember,
  type TeamFormFields,
} from './team-state';

const FORM_ID = 'team-form';

export interface TeamFormPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** The people who can be put in a team (the people still working in the business). */
  people: ReadonlyArray<Pick<TeamMember, 'id' | 'name'>>;
  /** Called after the team was saved, with its name for the confirmation. */
  onSaved: (teamName: string) => void;
}

/**
 * The Add team form in a side panel: a name and a tick-list of people. It checks on the device first, then sends `POST /teams`. Everything
 * typed stays when something goes wrong, and the API's own words are shown for a refusal (a name already used).
 */
export function TeamFormPanel({ isOpen, onClose, people, onSaved }: TeamFormPanelProps) {
  const [fields, setFields] = useState<TeamFormFields>(buildEmptyTeamForm);
  const [nameProblem, setNameProblem] = useState<string | undefined>();
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  // Checks the form, sends it, and says what went wrong in plain words
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const problemKey = checkTeamForm(fields);
    setNameProblem(problemKey ? t(problemKey) : undefined);
    if (problemKey) return;
    setIsSaving(true);
    try {
      await apiRequest<Team>('POST', '/teams', { name: fields.name.trim(), memberIds: fields.memberIds });
      onSaved(fields.name.trim());
    } catch (error) {
      setFormProblem(describeTeamProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t('teams.form.title')}
      closeLabel={t('teams.form.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('teams.form.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {t('teams.form.submit')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <TextField
          label={t('teams.form.name')}
          value={fields.name}
          onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))}
          maxLength={60}
          autoComplete="off"
          {...(nameProblem ? { errorMessage: nameProblem } : {})}
        />
        <fieldset className="flex flex-col gap-3">
          <legend className="text-label-sm mb-1 text-text-primary">{t('teams.form.people')}</legend>
          {people.length === 0 ? <p className="text-body-md text-text-secondary">{t('teams.form.noPeople')}</p> : null}
          {people.map((person) => (
            <Checkbox
              key={person.id}
              label={person.name}
              checked={fields.memberIds.includes(person.id)}
              onChange={() => setFields((current) => toggleTeamMember(current, person.id))}
            />
          ))}
        </fieldset>
      </form>
    </SidePanel>
  );
}
