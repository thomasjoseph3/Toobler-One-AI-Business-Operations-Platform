import type { CreateTeamRequest, Team, TeamsResponse } from '@toobler-one/shared';
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
