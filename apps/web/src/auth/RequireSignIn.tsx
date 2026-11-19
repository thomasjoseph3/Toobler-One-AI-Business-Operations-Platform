import { Navigate, Outlet, useLocation } from 'react-router';
import { Button, ErrorState, LoadingState } from '@toobler-one/ui';
import { t } from '../app/i18n';
import { useSession } from './session';

/** The guard around every page that needs a signed-in person: waits for the answer, then lets them in or sends them to sign in. */
export function RequireSignIn() {
  const { sessionState, reloadSession } = useSession();
  const location = useLocation();

  if (sessionState.status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-md p-6">
        <LoadingState label={t('session.loading')} rows={3} />
      </div>
    );
  }
  if (sessionState.status === 'error') {
    return (
      <div className="mx-auto w-full max-w-md p-6">
        <ErrorState
          title={t('session.errorTitle')}
          description={t('session.errorDescription')}
          action={<Button onClick={() => void reloadSession()}>{t('session.retry')}</Button>}
        />
      </div>
    );
  }
  if (sessionState.status === 'signedOut') {
    // Remember where they were going, so signing in brings them back there
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
