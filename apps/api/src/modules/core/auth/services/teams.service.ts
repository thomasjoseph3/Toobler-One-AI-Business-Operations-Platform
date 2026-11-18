import type { CreateTeamRequest, Team, TeamsResponse, UpdateTeamRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Database } from '../../../../kernel/database';
import { conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import * as teamsRepository from '../repositories/teams.repository';

/** The one answer for a team name the business already uses. */
const nameTaken = () => conflict('TEAM_NAME_TAKEN', 'You already have a team with this name. Choose another name.');

/**
 * Everything about teams (named groups of people, like "Sales"): listing them and adding one. The routes call this.
 * Repositories used: teams (in ../repositories).
 */
export function createTeamsService({ database }: { database: Database }) {
  return {
    /**
     * Renames a team and/or replaces its people (the list sent is the whole list). People must be active people of this business (404 otherwise).
     * An unknown team, or another business's, answers 404; a name already used by another team answers 409.
     */
    async updateTeam(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      teamId: string,
      request: UpdateTeamRequest,
    ): Promise<Team> {
      try {
        return await database.runInAccountTransaction(principal.accountId, async (transaction) => {
          const team = await teamsRepository.findTeamForUpdate(transaction, principal.accountId, teamId);
          if (!team) throw notFound('That team');
          const changedFields: string[] = [];
          if (request.name !== undefined && request.name !== team.name) {
            await teamsRepository.renameTeam(transaction, {
              accountId: principal.accountId,
              teamId,
              name: request.name,
              changedBy: principal.userId,
            });
            changedFields.push('name');
          }
          if (request.memberIds !== undefined) {
            const memberIds = [...new Set(request.memberIds)];
            const activeCount = await teamsRepository.countActivePeople(transaction, principal.accountId, memberIds);
            if (activeCount !== memberIds.length) throw notFound('One of the people');
            await teamsRepository.replaceTeamMembers(transaction, {
              accountId: principal.accountId,
              teamId,
              userIds: memberIds,
              changedBy: principal.userId,
            });
            changedFields.push('members');
          }
          if (changedFields.length > 0) {
            await writeActivityLog(transaction, {
              accountId: principal.accountId,
              actor: { kind: 'user', id: principal.userId },
              kind: 'teams.updated',
              details: { recordType: 'team', recordId: teamId, fields: changedFields },
            });
          }
          const teams = await teamsRepository.listTeams(transaction, principal.accountId);
          return teams.find((candidate) => candidate.id === teamId) as Team;
        });
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === '23505') throw nameTaken();
        throw error;
      }
    },

    /** Removes a team for good. The people in it stay in the business. An unknown team, or another business's, answers 404. */
    async deleteTeam(principal: Pick<Principal, 'accountId' | 'userId'>, teamId: string): Promise<void> {
      await database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const team = await teamsRepository.findTeamForUpdate(transaction, principal.accountId, teamId);
        if (!team) throw notFound('That team');
        await teamsRepository.deleteTeam(transaction, principal.accountId, teamId);
        await writeActivityLog(transaction, {
          accountId: principal.accountId,
          actor: { kind: 'user', id: principal.userId },
          kind: 'teams.deleted',
          details: { recordType: 'team', recordId: teamId },
        });
      });
    },

    /** Every team of the business by name, with the people in it. */
    async listTeams(principal: Pick<Principal, 'accountId'>): Promise<TeamsResponse> {
      const items = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        teamsRepository.listTeams(transaction, principal.accountId),
      );
      return { items };
    },

    /**
     * Adds a team with its people. Every person must be an active person of this business (404 otherwise, so another business's id looks like
     * an unknown one). A name the business already uses (capital letters do not matter) answers 409.
     */
    async createTeam(principal: Pick<Principal, 'accountId' | 'userId'>, request: CreateTeamRequest): Promise<Team> {
      const memberIds = [...new Set(request.memberIds)];
      const teamId = uuidv7();
      try {
        return await database.runInAccountTransaction(principal.accountId, async (transaction) => {
          const activeCount = await teamsRepository.countActivePeople(transaction, principal.accountId, memberIds);
          if (activeCount !== memberIds.length) throw notFound('One of the people');
          await teamsRepository.insertTeam(transaction, {
            id: teamId,
            accountId: principal.accountId,
            name: request.name,
            createdBy: principal.userId,
          });
          await teamsRepository.addTeamMembers(transaction, {
            accountId: principal.accountId,
            teamId,
            userIds: memberIds,
            addedBy: principal.userId,
          });
          await writeActivityLog(transaction, {
            accountId: principal.accountId,
            actor: { kind: 'user', id: principal.userId },
            kind: 'teams.created',
            details: {
              recordType: 'team',
              recordId: teamId,
              fields: memberIds.length > 0 ? ['name', 'members'] : ['name'],
            },
          });
          const teams = await teamsRepository.listTeams(transaction, principal.accountId);
          return teams.find((team) => team.id === teamId) as Team;
        });
      } catch (error) {
        // Two teams of the same name at the same moment: the database's unique index decides who wins
        if (error instanceof Error && 'code' in error && error.code === '23505') throw nameTaken();
        throw error;
      }
    },
  };
}

export type TeamsService = ReturnType<typeof createTeamsService>;
