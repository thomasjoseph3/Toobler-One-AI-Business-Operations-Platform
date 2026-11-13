import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { signInRequestSchema } from '@toobler-one/shared';
import { Alert, Button, Card, TextField } from '@toobler-one/ui';
import { ApiRequestError } from '../api/client';
import { t, type MessageKey } from '../app/i18n';
import { useSession } from '../auth/session';

/** Which words to show for each reason the API can give for refusing a sign-in. */
const SIGN_IN_ERROR_MESSAGES: Record<string, MessageKey> = {
  INVALID_CREDENTIALS: 'signIn.error.invalidCredentials',
  TOO_MANY_ATTEMPTS: 'signIn.error.tooManyAttempts',
  TOO_MANY_REQUESTS: 'signIn.error.tooManyRequests',
  NETWORK_ERROR: 'signIn.error.network',
};

/** The sign-in screen: email and password. After a successful sign-in the person goes where they were heading, or to Today. */
export function SignInPage() {
  const { sessionState, signIn } = useSession();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailProblem, setEmailProblem] = useState<string | undefined>();
  const [passwordProblem, setPasswordProblem] = useState<string | undefined>();
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Someone who is already signed in has no use for this page
  if (sessionState.status === 'signedIn') {
    const cameFrom = (location.state as { from?: string } | null)?.from;
    return <Navigate to={cameFrom ?? '/'} replace />;
  }

  // Checks the two fields on the device first, with the same email rule the server uses; returns true when both are fine.
  function checkFields(): boolean {
    const emailAnswer = signInRequestSchema.shape.email.safeParse(email);
    const emailMessage =
      email.trim() === ''
        ? t('signIn.error.emailRequired')
        : emailAnswer.success
          ? undefined
          : t('signIn.error.emailInvalid');
    const passwordMessage = password === '' ? t('signIn.error.passwordRequired') : undefined;
    setEmailProblem(emailMessage);
    setPasswordProblem(passwordMessage);
    return emailMessage === undefined && passwordMessage === undefined;
  }

  // Sends the form: checks the fields, signs in, and shows the reason in plain words when the server says no.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    if (!checkFields()) return;
    setIsSigningIn(true);
    try {
      await signIn(email.trim(), password);
    } catch (error) {
      const code = error instanceof ApiRequestError ? error.code : '';
      setFormProblem(t(SIGN_IN_ERROR_MESSAGES[code] ?? 'signIn.error.unknown'));
      setIsSigningIn(false);
    }
  }

  return (
    <Card>
      <h1 className="text-heading-2xl text-text-primary">{t('signIn.title')}</h1>
      <p className="text-body-md mt-1 text-text-secondary">{t('signIn.description')}</p>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="mt-6 flex flex-col gap-4">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <TextField
          label={t('signIn.email')}
          type="email"
          name="email"
          autoComplete="username"
          size="touch"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          {...(emailProblem ? { errorMessage: emailProblem } : {})}
        />
        <TextField
          label={t('signIn.password')}
          type="password"
          name="password"
          autoComplete="current-password"
          size="touch"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          {...(passwordProblem ? { errorMessage: passwordProblem } : {})}
        />
        <Button type="submit" variant="primary" size="touch" isLoading={isSigningIn}>
          {t('signIn.submit')}
        </Button>
      </form>
    </Card>
  );
}
