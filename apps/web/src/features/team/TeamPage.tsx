import { useState, type ReactNode } from 'react';
import type { Invitation, InvitationCreated, TeamMember, TeamResponse, TeamRole } from '@toobler-one/shared';
import {
  ActionMenu,
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  ErrorState,
  LoadingState,
  SelectField,
  type ActionMenuItem,
} from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { useKeptData } from '../knowledge/use-kept-resource';
import { SettingsTabs } from '../settings/SettingsTabs';
import { InviteMemberPanel } from './InviteMemberPanel';
import { describeRole, describeTeamProblem, formatTeamDate, listHandOverChoices, listOtherRoles } from './team-state';

/** One person of the business in the list: name, email, role, and when they last signed in (or that they were removed). */
function MemberRow({ member, isYou, menu }: { member: TeamMember; isYou: boolean; menu: ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-2 border-b border-border-default py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-label-md text-text-primary">{member.name}</h3>
          {isYou ? <Badge tone="info">{t('team.members.you')}</Badge> : null}
          <Badge tone="neutral">{describeRole(member.role)}</Badge>
          {member.status === 'disabled' ? <Badge tone="warning">{t('team.members.removed')}</Badge> : null}
        </div>
        <p className="text-body-md text-text-secondary">{member.email}</p>
        {member.teams.length > 0 ? (
          <p className="text-label-sm text-text-secondary">
            {formatMessage('team.members.teams', { names: member.teams.map((team) => team.name).join(', ') })}
          </p>
        ) : null}
        <p className="text-label-sm text-text-secondary">
          {member.lastSignedInAt
            ? formatMessage('team.members.lastSignedIn', { date: formatTeamDate(member.lastSignedInAt) })
            : t('team.members.neverSignedIn')}
        </p>
      </div>
      {menu}
    </li>
  );
}

/** One invitation that is still waiting: who it is for, the role, and until when the link works. */
function InvitationRow({ invitation, menu }: { invitation: Invitation; menu: ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-2 border-b border-border-default py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-1">
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
      </div>
      {menu}
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
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [handOverToUserId, setHandOverToUserId] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);
  const [invitationToCancel, setInvitationToCancel] = useState<Invitation | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

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

  // Changes a person's role or adds them back, then reloads the list and says what happened
  const changeMember = async (member: TeamMember, changes: { role: TeamRole } | { status: 'active' }) => {
    setProblem(null);
    try {
      await apiRequest('PATCH', `/team/members/${member.id}`, changes);
      setNotice(
        'role' in changes
          ? formatMessage('team.changed.role', { name: member.name, role: describeRole(changes.role) })
          : formatMessage('team.changed.restored', { name: member.name }),
      );
    } catch (error) {
      setProblem(describeTeamProblem(error));
    }
    resource.reload();
  };

  // Removes the person the manager said yes to, handing their open work to the person chosen in the box
  const confirmRemove = async (allMembers: TeamMember[]) => {
    if (memberToRemove === null) return;
    setIsRemoving(true);
    setProblem(null);
    try {
      await apiRequest('DELETE', `/team/members/${memberToRemove.id}?hand_over_to=${handOverToUserId}`);
      const successor = allMembers.find((member) => member.id === handOverToUserId);
      setNotice(formatMessage('team.changed.removed', { name: memberToRemove.name, successor: successor?.name ?? '' }));
    } catch (error) {
      setProblem(describeTeamProblem(error));
    }
    setIsRemoving(false);
    setMemberToRemove(null);
    resource.reload();
  };

  // Sends an invitation again with a new link, and shows the new link like a fresh invitation
  const resendInvitation = async (invitation: Invitation) => {
    setProblem(null);
    try {
      const created = await apiRequest<InvitationCreated>('POST', `/team/invitations/${invitation.id}/resend`);
      setNotice(null);
      setLinkWasCopied(false);
      setJustInvited(created);
    } catch (error) {
      setProblem(describeTeamProblem(error));
    }
    resource.reload();
  };

  // Cancels the invitation the manager said yes to
  const confirmCancelInvitation = async () => {
    if (invitationToCancel === null) return;
    setIsCancelling(true);
    setProblem(null);
    try {
      await apiRequest('DELETE', `/team/invitations/${invitationToCancel.id}`);
      setNotice(formatMessage('team.changed.cancelled', { name: invitationToCancel.name }));
    } catch (error) {
      setProblem(describeTeamProblem(error));
    }
    setIsCancelling(false);
    setInvitationToCancel(null);
    resource.reload();
  };

  // The "…" menu of one waiting invitation: send it again, or cancel it
  const invitationMenuFor = (invitation: Invitation): ReactNode => (
    <ActionMenu
      triggerLabel={formatMessage('team.invitationMenu.label', { name: invitation.name })}
      panelLabel={t('team.invitationMenu.panel')}
      items={[
        { id: 'resend', label: t('team.invitationMenu.resend'), onSelect: () => void resendInvitation(invitation) },
        {
          id: 'cancel',
          label: t('team.invitationMenu.cancel'),
          tone: 'danger',
          onSelect: () => setInvitationToCancel(invitation),
        },
      ]}
    />
  );

  // The "…" menu of one person: change role, remove, or add back (nothing for yourself: someone else removes you)
  const menuFor = (member: TeamMember): ReactNode => {
    if (member.id === signedInUserId) return null;
    const items: ActionMenuItem[] =
      member.status === 'disabled'
        ? [
            {
              id: 'add-back',
              label: t('team.menu.addBack'),
              onSelect: () => void changeMember(member, { status: 'active' }),
            },
          ]
        : [
            ...listOtherRoles(member.role).map((role) => ({
              id: `role-${role}`,
              label: formatMessage('team.menu.makeRole', { role: describeRole(role) }),
              onSelect: () => void changeMember(member, { role }),
            })),
            {
              id: 'remove',
              label: t('team.menu.remove'),
              tone: 'danger' as const,
              onSelect: () => {
                setMemberToRemove(member);
                setHandOverToUserId(signedInUserId);
              },
            },
          ];
    return (
      <ActionMenu
        triggerLabel={formatMessage('team.menu.label', { name: member.name })}
        panelLabel={t('team.menu.panel')}
        items={items}
      />
    );
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
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {problem ? <Alert tone="error">{problem}</Alert> : null}
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
            <MemberRow key={member.id} member={member} isYou={member.id === signedInUserId} menu={menuFor(member)} />
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
            <InvitationRow key={invitation.id} invitation={invitation} menu={invitationMenuFor(invitation)} />
          ))}
        </ul>
      </Card>
      <ConfirmDialog
        isOpen={invitationToCancel !== null}
        title={invitationToCancel ? formatMessage('team.cancel.title', { name: invitationToCancel.name }) : ''}
        description={
          invitationToCancel ? formatMessage('team.cancel.description', { email: invitationToCancel.email }) : ''
        }
        confirmLabel={t('team.cancel.confirm')}
        cancelLabel={t('team.cancel.keep')}
        closeLabel={t('team.remove.close')}
        tone="danger"
        isConfirming={isCancelling}
        onConfirm={() => void confirmCancelInvitation()}
        onCancel={() => setInvitationToCancel(null)}
      />
      <Dialog
        isOpen={memberToRemove !== null}
        onClose={() => setMemberToRemove(null)}
        title={memberToRemove ? formatMessage('team.remove.title', { name: memberToRemove.name }) : ''}
        closeLabel={t('team.remove.close')}
        footer={
          <>
            <Button onClick={() => setMemberToRemove(null)}>{t('team.remove.cancel')}</Button>
            <Button variant="destructive" isLoading={isRemoving} onClick={() => void confirmRemove(members)}>
              {memberToRemove ? formatMessage('team.remove.confirm', { name: memberToRemove.name }) : ''}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-body-md text-text-secondary">
            {memberToRemove ? formatMessage('team.remove.description', { name: memberToRemove.name }) : ''}
          </p>
          <SelectField
            label={t('team.remove.handOver')}
            value={handOverToUserId}
            onChange={(event) => setHandOverToUserId(event.target.value)}
            options={memberToRemove ? listHandOverChoices(members, memberToRemove.id) : []}
          />
        </div>
      </Dialog>
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
