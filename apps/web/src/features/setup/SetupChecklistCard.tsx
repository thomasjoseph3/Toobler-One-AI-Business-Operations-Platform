import { Link } from 'react-router';
import type { SetupResponse } from '@toobler-one/shared';
import { Card, buttonClasses } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';

/**
 * A small card on the Today page for a manager whose business is not live yet: how far setup has got, how many things still stop going live,
 * and a way into the Setup guide. It shows nothing for staff, once the business is live, or while it cannot load (it never gets in the way).
 */
export function SetupChecklistCard() {
  const { sessionState } = useSession();
  // Staff are not allowed to read the setup, so it is not even asked for
  const isManager = sessionState.status === 'signedIn' && sessionState.profile.user.role === 'manager';
  return isManager ? <ManagerChecklist /> : null;
}

/** The card itself, for a manager: asks the API how far setup has got. */
function ManagerChecklist() {
  const setupResource = useApiResource<SetupResponse>('/setup');
  if (setupResource.state.status !== 'ready') return null;
  const setup = setupResource.state.data;
  if (setup.isLive) return null;
  return (
    <Card>
      <h2 className="text-heading-sm mb-1 text-text-primary">{t('setup.checklist.title')}</h2>
      <p className="text-body-md mb-4 text-text-secondary">
        {setup.blockers.length === 0
          ? formatMessage('setup.checklist.descriptionNone', { percent: setup.percentDone })
          : formatMessage('setup.checklist.description', {
              percent: setup.percentDone,
              blockers: setup.blockers.length,
            })}
      </p>
      <Link to="/setup" className={buttonClasses('primary', 'standard')}>
        {t('setup.checklist.open')}
      </Link>
    </Card>
  );
}
