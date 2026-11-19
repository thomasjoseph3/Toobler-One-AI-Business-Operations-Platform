import { useState, type FormEvent } from 'react';
import type { InvitationCreated } from '@toobler-one/shared';
import { Alert, Button, SelectField, SidePanel, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import {
  buildEmptyInviteForm,
  buildInviteRequest,
  checkInviteForm,
  describeTeamProblem,
  ROLE_CHOICES,
  type InviteFormFields,
  type InviteFormProblems,
} from './team-state';

const FORM_ID = 'invite-member-form';

export interface InviteMemberPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the invitation was saved, with what the API answered (the link and whether the email went out). */
  onInvited: (created: InvitationCreated) => void;
}

/**
 * The Invite form in a side panel: name, email, an optional mobile number and a role. It checks on the device first, then sends
 * `POST /team/invitations`. Everything typed stays when something goes wrong, and the API's own words are shown for a refusal
 * (this email already has an account, or already has an invitation waiting).
 */
export function InviteMemberPanel({ isOpen, onClose, onInvited }: InviteMemberPanelProps) {
  const [fields, setFields] = useState<InviteFormFields>(buildEmptyInviteForm);
  const [problems, setProblems] = useState<InviteFormProblems>({});
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const changeFields = (changes: Partial<InviteFormFields>) => setFields((current) => ({ ...current, ...changes }));
  const chosenRole = ROLE_CHOICES.find((choice) => choice.role === fields.role);

  // Checks the form, sends it, and says what went wrong in plain words
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const foundProblems = checkInviteForm(fields);
    setProblems(foundProblems);
    if (Object.keys(foundProblems).length > 0) return;
    setIsSaving(true);
    try {
      const created = await apiRequest<InvitationCreated>('POST', '/team/invitations', buildInviteRequest(fields));
      onInvited(created);
    } catch (error) {
      setFormProblem(describeTeamProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t('team.invite.title')}
      closeLabel={t('team.invite.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('team.invite.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {t('team.invite.submit')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <TextField
          label={t('team.invite.name')}
          value={fields.name}
          onChange={(event) => changeFields({ name: event.target.value })}
          maxLength={100}
          autoComplete="off"
          {...(problems.name ? { errorMessage: t(problems.name) } : {})}
        />
        <TextField
          label={t('team.invite.email')}
          type="email"
          value={fields.email}
          onChange={(event) => changeFields({ email: event.target.value })}
          maxLength={254}
          autoComplete="off"
          helperText={t('team.invite.emailHint')}
          {...(problems.email ? { errorMessage: t(problems.email) } : {})}
        />
        <TextField
          label={t('team.invite.mobile')}
          requirementLabel={t('team.invite.mobileOptional')}
          type="tel"
          value={fields.mobile}
          onChange={(event) => changeFields({ mobile: event.target.value })}
          maxLength={20}
          autoComplete="off"
          {...(problems.mobile ? { errorMessage: t(problems.mobile) } : {})}
        />
        <SelectField
          label={t('team.invite.role')}
          value={fields.role}
          onChange={(event) =>
            changeFields({ role: ROLE_CHOICES.find((choice) => choice.role === event.target.value)?.role ?? 'staff' })
          }
          options={ROLE_CHOICES.map((choice) => ({ value: choice.role, label: t(choice.labelKey) }))}
        />
        {chosenRole ? <p className="text-body-xs text-text-secondary">{t(chosenRole.helpKey)}</p> : null}
      </form>
    </SidePanel>
  );
}
