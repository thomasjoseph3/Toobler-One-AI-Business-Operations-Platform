import type { WebchatSettings } from '@toobler-one/shared';
import { Button, Card, ErrorState, LoadingState } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { useKeptData } from '../knowledge/use-kept-resource';
import { WebchatInstallCard } from './WebchatInstallCard';
import { WebchatLookCard } from './WebchatLookCard';

/**
 * Channels: how customers reach the AI agent. The website chat is set up here (put it on your website, how it looks, its buttons); the other
 * channels are listed as coming. Managers change settings; staff read. When the website chat is switched off for the business the page says so.
 * It keeps what is on screen while a change reloads, and has loading and error states.
 */
export function ChannelsPage() {
  const { sessionState } = useSession();
  const webchatResource = useApiResource<WebchatSettings>('/channels/webchat');
  const webchatData = useKeptData(webchatResource.state);

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const canEdit = sessionState.profile.user.role === 'manager';
  const timeZone = sessionState.profile.business.timeZone;
  const isOff = webchatResource.state.status === 'error' && webchatResource.state.httpStatus === 404;

  let webchat;
  if (webchatData.isFirstLoad) webchat = <LoadingState label={t('channels.loading')} />;
  else if (isOff) {
    webchat = (
      <Card>
        <h2 className="text-heading-sm text-text-primary">{t('channels.webchat.off.title')}</h2>
        <p className="text-body-md text-text-secondary">{t('channels.webchat.off.description')}</p>
      </Card>
    );
  } else if (webchatData.hasFailed || webchatData.data === null) {
    webchat = (
      <Card>
        <ErrorState title={t('channels.error.title')} description={t('knowledge.error.description')} action={<Button variant="secondary" onClick={webchatResource.reload}>{t('knowledge.retry')}</Button>} />
      </Card>
    );
  } else {
    // The look card holds what is typed, so it starts again only when the saved settings really change
    webchat = (
      <>
        <WebchatInstallCard settings={webchatData.data} canEdit={canEdit} timeZone={timeZone} onChanged={webchatResource.reload} />
        <WebchatLookCard key={JSON.stringify([webchatData.data.colour, webchatData.data.greeting, webchatData.data.position, webchatData.data.phoneNumber, webchatData.data.whatsappNumber, webchatData.data.whatsappMessage, webchatData.data.buttonOrder])} settings={webchatData.data} canEdit={canEdit} onSaved={webchatResource.reload} />
      </>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <p className="text-body-md text-text-secondary">{t('channels.intro')}</p>
      {canEdit ? null : <p className="text-body-md text-text-secondary">{t('channels.managersOnly')}</p>}
      {webchat}
      <Card>
        <h2 className="text-heading-sm text-text-primary">{t('channels.others.title')}</h2>
        <p className="text-body-md mb-2 text-text-secondary">{t('channels.others.description')}</p>
        <ul className="text-body-md flex flex-col gap-2 text-text-secondary">
          {(['whatsapp', 'email', 'phone'] as const).map((channel) => (
            <li key={channel}>
              {t(`channels.others.${channel}`)} <span className="text-label-sm">({t('channels.others.soon')})</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
