import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { InvitationPreview } from '@toobler-one/shared';
import { Alert, ButtonLink, Button, Card, LoadingState, TextField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../api/client';
import { formatMessage, t } from '../app/i18n';
import { checkAcceptPassword, describeAcceptProblem, describeRole } from '../features/team/team-state';

/** What the page knows about the link: still checking, not usable, usable (with who invited the person), or accepted. */
type AcceptState =
  | { status: 'checking' }
  | { status: 'invalid'; message: string }
  | { status: 'ready'; preview: InvitationPreview }
  | { status: 'done'; businessName: string };

/**
 * The page the emailed invitation link opens (a person with no account yet). It asks the API who invited them (`POST /auth/invitations/preview`),
 * shows the name, email and role (fixed by the manager), and asks only for a password (`POST /auth/accept-invitation`). Afterwards it sends the
 * person to sign in. A link that is unknown, used, cancelled or expired shows one plain message.
 */
export function AcceptInvitationPage() {
  const [searchParameters] = useSearchParams();
  const token = searchParameters.get('token') ?? '';
  // No token in the address: nothing to ask the API, the link is simply not usable
  const [state, setState] = useState<AcceptState>(
    token.length === 0 ? { status: 'invalid', message: t('accept.invalid.description') } : { status: 'checking' },
  );
  const [password, setPassword] = useState('');
  const [passwordProblem, setPasswordProblem] = useState<string | undefined>();
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  // Asks who the invitation is from, once, when the page opens
  useEffect(() => {
    let isCancelled = false;
    if (token.length === 0) return undefined;
    apiRequest<InvitationPreview>('POST', '/auth/invitations/preview', { token })
      .then((invitationPreview) => {
        if (!isCancelled) setState({ status: 'ready', preview: invitationPreview });
      })
      .catch((error: unknown) => {
        if (isCancelled) return;
        // Only a link the API says cannot be used is "invalid"; a lost connection says so in its own words
        const message =
          error instanceof ApiRequestError && error.status === 400
            ? t('accept.invalid.description')
            : describeAcceptProblem(error);
        setState({ status: 'invalid', message });
      });
    return () => {
      isCancelled = true;
    };
  }, [token]);

  // Checks the password on the device, sends it, and says what went wrong in plain words
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== 'ready') return;
    setFormProblem(undefined);
    const problemKey = checkAcceptPassword(password);
    setPasswordProblem(problemKey ? t(problemKey) : undefined);
    if (problemKey) return;
    setIsSaving(true);
    try {
      await apiRequest('POST', '/auth/accept-invitation', { token, password });
      setState({ status: 'done', businessName: state.preview.businessName });
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'INVALID_TOKEN') {
        setState({ status: 'invalid', message: t('accept.invalid.description') });
      } else {
        setFormProblem(describeAcceptProblem(error));
        setIsSaving(false);
      }
    }
  }

  if (state.status === 'checking') return <LoadingState label={t('accept.loading')} />;
  if (state.status === 'invalid') {
    return (
      <Card>
        <h1 className="text-heading-2xl text-text-primary">{t('accept.invalid.title')}</h1>
        <p className="text-body-md mt-2 text-text-secondary">{state.message}</p>
      </Card>
    );
  }
  if (state.status === 'done') {
    return (
      <Card>
        <h1 className="text-heading-2xl text-text-primary">
          {formatMessage('accept.done.title', { business: state.businessName })}
        </h1>
        <p className="text-body-md mt-2 text-text-secondary">{t('accept.done.description')}</p>
        <div className="mt-6">
          <ButtonLink href="/sign-in" variant="primary" size="touch">
            {t('accept.done.signIn')}
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const { preview } = state;
  return (
    <Card>
      <h1 className="text-heading-2xl text-text-primary">
        {formatMessage('accept.title', { business: preview.businessName })}
      </h1>
      <p className="text-body-md mt-1 text-text-secondary">
        {formatMessage('accept.description', {
          inviter: preview.invitedByName,
          business: preview.businessName,
          role: describeRole(preview.role),
        })}
      </p>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="mt-6 flex flex-col gap-4">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <TextField label={t('accept.name')} value={preview.name} readOnly size="touch" />
        <TextField label={t('accept.email')} value={preview.email} readOnly size="touch" />
        <TextField
          label={t('accept.password')}
          type="password"
          name="password"
          autoComplete="new-password"
          size="touch"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          helperText={t('accept.passwordHint')}
          {...(passwordProblem ? { errorMessage: passwordProblem } : {})}
        />
        <Button type="submit" variant="primary" size="touch" isLoading={isSaving}>
          {t('accept.submit')}
        </Button>
      </form>
    </Card>
  );
}
