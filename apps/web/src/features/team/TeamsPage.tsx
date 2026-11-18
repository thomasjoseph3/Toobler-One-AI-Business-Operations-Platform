import { useState } from 'react';
import type { Team, TeamResponse, TeamsResponse } from '@toobler-one/shared';
import { ActionMenu, Alert, Button, Card, ConfirmDialog, ErrorState, LoadingState } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useKeptData } from '../knowledge/use-kept-resource';
import { SettingsTabs } from '../settings/SettingsTabs';
import { TeamFormPanel } from './TeamFormPanel';
import { describeTeamMembers, describeTeamProblem } from './team-state';

/**
 * Settings → Teams (managers only): the business's teams with the people in each, and an Add team button that opens the form. Loading, error
 * and empty states; keeps what is on screen while it reloads.
 */
export function TeamsPage() {
  const teamsResource = useApiResource<TeamsResponse>('/teams');
  const peopleResource = useApiResource<TeamResponse>('/team');
  const teamsData = useKeptData(teamsResource.state);
  const peopleData = useKeptData(peopleResource.state);
  const [isAdding, setIsAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [teamToEdit, setTeamToEdit] = useState<Team | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Deletes the team the manager said yes to
  const confirmDelete = async () => {
    if (teamToDelete === null) return;
    setIsDeleting(true);
    setProblem(null);
    try {
      await apiRequest('DELETE', `/teams/${teamToDelete.id}`);
      setNotice(formatMessage('teams.deleted', { name: teamToDelete.name }));
    } catch (error) {
      setProblem(describeTeamProblem(error));
    }
    setIsDeleting(false);
    setTeamToDelete(null);
    teamsResource.reload();
    peopleResource.reload();
  };

  if (teamsData.isFirstLoad || peopleData.isFirstLoad) return <LoadingState label={t('teams.loading')} />;
  if (teamsData.hasFailed || teamsData.data === null || peopleData.data === null) {
    return (
      <Card>
        <ErrorState
          title={t('teams.error.title')}
          description={t('knowledge.error.description')}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                teamsResource.reload();
                peopleResource.reload();
              }}
            >
              {t('team.retry')}
            </Button>
          }
        />
      </Card>
    );
  }
  const teams: Team[] = teamsData.data.items;
  const activePeople = peopleData.data.members.filter((member) => member.status === 'active');

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <SettingsTabs />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-body-md max-w-prose text-text-secondary">{t('teams.intro')}</p>
        <Button variant="primary" onClick={() => setIsAdding(true)}>
          {t('teams.add')}
        </Button>
      </div>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {problem ? <Alert tone="error">{problem}</Alert> : null}
      <Card aria-labelledby="teams-list">
        <h2 id="teams-list" className="text-heading-sm mb-1 text-text-primary">
          {t('teams.title')}
        </h2>
        {teams.length === 0 ? <p className="text-body-md text-text-secondary">{t('teams.empty')}</p> : null}
        <ul>
          {teams.map((team) => (
            <li
              key={team.id}
              className="flex items-start justify-between gap-2 border-b border-border-default py-3 last:border-b-0"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="text-label-md text-text-primary">{team.name}</h3>
                <p className="text-body-md text-text-secondary">{describeTeamMembers(team.members)}</p>
              </div>
              <ActionMenu
                triggerLabel={formatMessage('teams.menu.label', { name: team.name })}
                panelLabel={t('teams.menu.panel')}
                items={[
                  { id: 'edit', label: t('teams.menu.edit'), onSelect: () => setTeamToEdit(team) },
                  {
                    id: 'delete',
                    label: t('teams.menu.delete'),
                    tone: 'danger',
                    onSelect: () => setTeamToDelete(team),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      </Card>
      <ConfirmDialog
        isOpen={teamToDelete !== null}
        title={teamToDelete ? formatMessage('teams.delete.title', { name: teamToDelete.name }) : ''}
        description={t('teams.delete.description')}
        confirmLabel={t('teams.delete.confirm')}
        cancelLabel={t('teams.delete.keep')}
        closeLabel={t('teams.form.close')}
        tone="danger"
        isConfirming={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setTeamToDelete(null)}
      />
      {teamToEdit ? (
        <TeamFormPanel
          isOpen
          onClose={() => setTeamToEdit(null)}
          people={activePeople}
          editingTeam={teamToEdit}
          onSaved={(teamName) => {
            setTeamToEdit(null);
            setNotice(formatMessage('teams.saved', { name: teamName }));
            teamsResource.reload();
            peopleResource.reload();
          }}
        />
      ) : null}
      {isAdding ? (
        <TeamFormPanel
          isOpen
          onClose={() => setIsAdding(false)}
          people={activePeople}
          onSaved={(teamName) => {
            setIsAdding(false);
            setNotice(formatMessage('teams.added', { name: teamName }));
            teamsResource.reload();
            peopleResource.reload();
          }}
        />
      ) : null}
    </div>
  );
}
