import { useState } from 'react';
import type { Invitation, InvitationCreated, TeamMember, TeamResponse } from '@toobler-one/shared';
import { Alert, Badge, Button, Card, ErrorState, LoadingState } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { useKeptData } from '../knowledge/use-kept-resource';
import { SettingsTabs } from '../settings/SettingsTabs';
import { InviteMemberPanel } from './InviteMemberPanel';
import { describeRole, formatTeamDate } from './team-state';

/** One person of the business in the list: name, email, role, and when they last signed in (or that they were removed). */
function MemberRow({ member, isYou }: { member: TeamMember; isYou: boolean }) {
  return (
    <li className="flex flex-col gap-1 border-b border-border-default py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-label-md text-text-primary">{member.name}</h3>
        {isYou ? <Badge tone="info">{t('team.members.you')}</Badge> : null}
        <Badge tone="neutral">{describeRole(member.role)}</Badge>
        {member.status === 'disabled' ? <Badge tone="warning">{t('team.members.removed')}</Badge> : null}
      </div>
      <p className="text-body-md text-text-secondary">{member.email}</p>
      <p className="text-label-sm text-text-secondary">
        {member.lastSignedInAt
          ? formatMessage('team.members.lastSignedIn', { date: formatTeamDate(member.lastSignedInAt) })
          : t('team.members.neverSignedIn')}
      </p>
    </li>
  );
}

/** One invitation that is still waiting: who it is for, the role, and until when the link works. */
function InvitationRow({ invitation }: { invitation: Invitation }) {
  return (
    <li className="flex flex-col gap-1 border-b border-border-default py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-label-md text-text-primary">{invitation.name}</h3>
        <Badge tone="neutral">{describeRole(invitation.role)}</Badge>
        {invitation.isExpired ? <Badge tone="warning">{t('team.invitations.expired')}</Badge> : null}
      </div>
      <p className="text-body-md text-text-secondary">{invitation.email}</p>
      {invitation.isExpired ? null : (
        <p className="text-label-sm text-text-secondary">
          {formatMessage('team.invitations.expires', { date: formatTeamDate(invitation.expiresAt) })}
        </p>
      )}
    </li>
  );
}

/**
 * Settings → Team (managers only): the people of the business with their role, the invitations still waiting, and an Invite button that opens
 * the form. After an invitation is saved the page says so and offers the link to copy (to send by WhatsApp by hand). Loading, error and
 * empty states; keeps what is on screen while it reloads.
 */
export function TeamPage() {
  const { sessionState } = useSession();
  const resource = useApiResource<TeamResponse>('/team');
  const data = useKeptData(resource.state);
  const [isInviting, setIsInviting] = useState(false);
  const [justInvited, setJustInvited] = useState<InvitationCreated | null>(null);
  const [linkWasCopied, setLinkWasCopied] = useState(false);

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const signedInUserId = sessionState.profile.user.id;

  // Copies the invitation link, so the manager can send it on WhatsApp
  const copyLink = async () => {
    if (!justInvited) return;
    try {
      await navigator.clipboard.writeText(justInvited.link);
      setLinkWasCopied(true);
    } catch {
      setLinkWasCopied(false);
    }
  };

  if (data.isFirstLoad) return <LoadingState label={t('team.loading')} />;
  if (data.hasFailed || data.data === null) {
    return (
      <Card>
        <ErrorState
          title={t('team.error.title')}
          description={t('knowledge.error.description')}
          action={
            <Button variant="secondary" onClick={resource.reload}>
              {t('team.retry')}
            </Button>
          }
        />
      </Card>
    );
  }
  const { members, invitations } = data.data;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <SettingsTabs />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-body-md max-w-prose text-text-secondary">{t('team.intro')}</p>
        <Button variant="primary" onClick={() => setIsInviting(true)}>
          {t('team.invite.open')}
        </Button>
      </div>
      {justInvited ? (
        <Alert tone={justInvited.emailSent ? 'success' : 'error'}>
          <p>
            {justInvited.emailSent
              ? formatMessage('team.invited.sent', { email: justInvited.invitation.email })
              : t('team.invited.notSent')}
          </p>
          <p className="text-label-sm mt-2 break-all">{justInvited.link}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="compact" onClick={() => void copyLink()}>
              {linkWasCopied ? t('team.invited.copied') : t('team.invited.copy')}
            </Button>
            <Button size="compact" variant="tertiary" onClick={() => setJustInvited(null)}>
              {t('team.invited.dismiss')}
            </Button>
          </div>
        </Alert>
      ) : null}
      <Card aria-labelledby="team-people">
        <h2 id="team-people" className="text-heading-sm mb-1 text-text-primary">
          {t('team.members.title')}
        </h2>
        {members.length === 0 ? <p className="text-body-md text-text-secondary">{t('team.members.empty')}</p> : null}
        <ul>
          {members.map((member) => (
            <MemberRow key={member.id} member={member} isYou={member.id === signedInUserId} />
          ))}
        </ul>
      </Card>
      <Card aria-labelledby="team-invitations">
        <h2 id="team-invitations" className="text-heading-sm mb-1 text-text-primary">
          {t('team.invitations.title')}
        </h2>
        {invitations.length === 0 ? (
          <p className="text-body-md text-text-secondary">{t('team.invitations.empty')}</p>
        ) : null}
        <ul>
          {invitations.map((invitation) => (
            <InvitationRow key={invitation.id} invitation={invitation} />
          ))}
        </ul>
      </Card>
      {isInviting ? (
        <InviteMemberPanel
          isOpen
          onClose={() => setIsInviting(false)}
          onInvited={(created) => {
            setIsInviting(false);
            setLinkWasCopied(false);
            setJustInvited(created);
            resource.reload();
          }}
        />
      ) : null}
    </div>
  );
}
