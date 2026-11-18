import type { Db } from '../../../../kernel/database';

// The SQL for the `teams` and `team_members` tables (named groups of people of a business). Run every function inside the business's fence.

/** A team and the people in it, as the Team screens show it. */
export interface TeamRow {
  id: string;
  name: string;
  members: Array<{ userId: string; name: string }>;
}

/** Every team of the business by name, each with its people by name. */
export async function listTeams(db: Db, accountId: string): Promise<TeamRow[]> {
  const teamRows = await db
    .selectFrom('teams')
    .select(['id', 'name'])
    .where('account_id', '=', accountId)
    .orderBy('name')
    .execute();
  const memberRows = await db
    .selectFrom('team_members')
    .innerJoin('users', (join) =>
      join.onRef('users.id', '=', 'team_members.user_id').onRef('users.account_id', '=', 'team_members.account_id'),
    )
    .select(['team_members.team_id', 'users.id as user_id', 'users.name'])
    .where('team_members.account_id', '=', accountId)
    .orderBy('users.name')
    .execute();
  return teamRows.map((team) => ({
    id: team.id,
    name: team.name,
    members: memberRows
      .filter((member) => member.team_id === team.id)
      .map((member) => ({ userId: member.user_id, name: member.name })),
  }));
}

/** The teams each person is in (by team name), for the people list. */
export async function listTeamsOfPeople(
  db: Db,
  accountId: string,
): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const rows = await db
    .selectFrom('team_members')
    .innerJoin('teams', (join) =>
      join.onRef('teams.id', '=', 'team_members.team_id').onRef('teams.account_id', '=', 'team_members.account_id'),
    )
    .select(['team_members.user_id', 'teams.id as team_id', 'teams.name'])
    .where('team_members.account_id', '=', accountId)
    .orderBy('teams.name')
    .execute();
  const teamsByPerson = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of rows) {
    const teamsOfPerson = teamsByPerson.get(row.user_id) ?? [];
    teamsOfPerson.push({ id: row.team_id, name: row.name });
    teamsByPerson.set(row.user_id, teamsOfPerson);
  }
  return teamsByPerson;
}

/** Adds a team. Throws a unique-violation (23505) when the business already has a team of this name (capital letters do not matter). */
export async function insertTeam(
  db: Db,
  team: { id: string; accountId: string; name: string; createdBy: string },
): Promise<void> {
  await db
    .insertInto('teams')
    .values({
      id: team.id,
      account_id: team.accountId,
      name: team.name,
      created_by: { kind: 'user', id: team.createdBy },
      updated_by: { kind: 'user', id: team.createdBy },
    })
    .execute();
}

/** Puts these people in the team (people already in it are skipped). */
export async function addTeamMembers(
  db: Db,
  options: { accountId: string; teamId: string; userIds: string[]; addedBy: string },
): Promise<void> {
  if (options.userIds.length === 0) return;
  await db
    .insertInto('team_members')
    .values(
      options.userIds.map((userId) => ({
        account_id: options.accountId,
        team_id: options.teamId,
        user_id: userId,
        created_by: { kind: 'user', id: options.addedBy },
      })),
    )
    .onConflict((conflict) => conflict.columns(['team_id', 'user_id']).doNothing())
    .execute();
}

/** How many of these ids are active people of the business (so the caller can tell an unknown, removed or other business's person from a real one). */
export async function countActivePeople(db: Db, accountId: string, userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const rows = await db
    .selectFrom('users')
    .select('id')
    .where('account_id', '=', accountId)
    .where('status', '=', 'active')
    .where('id', 'in', userIds)
    .execute();
  return rows.length;
}

/** A team found by id and locked until the transaction ends. Undefined for an unknown id and for another business's team. */
export async function findTeamForUpdate(
  db: Db,
  accountId: string,
  teamId: string,
): Promise<{ id: string; name: string } | undefined> {
  return db
    .selectFrom('teams')
    .select(['id', 'name'])
    .where('account_id', '=', accountId)
    .where('id', '=', teamId)
    .forUpdate()
    .executeTakeFirst();
}

/** Gives a team a new name and stamps who did it. Throws a unique-violation (23505) when another team already has the name. */
export async function renameTeam(
  db: Db,
  options: { accountId: string; teamId: string; name: string; changedBy: string },
): Promise<void> {
  await db
    .updateTable('teams')
    .set({ name: options.name, updated_by: { kind: 'user', id: options.changedBy } })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.teamId)
    .execute();
}

/** Replaces the people of a team with exactly these. */
export async function replaceTeamMembers(
  db: Db,
  options: { accountId: string; teamId: string; userIds: string[]; changedBy: string },
): Promise<void> {
  await db
    .deleteFrom('team_members')
    .where('account_id', '=', options.accountId)
    .where('team_id', '=', options.teamId)
    .execute();
  await addTeamMembers(db, {
    accountId: options.accountId,
    teamId: options.teamId,
    userIds: options.userIds,
    addedBy: options.changedBy,
  });
}

/** Removes a team for good (its people are not touched; their team rows go with it). */
export async function deleteTeam(db: Db, accountId: string, teamId: string): Promise<void> {
  await db.deleteFrom('teams').where('account_id', '=', accountId).where('id', '=', teamId).execute();
}

/** Takes a person out of every team (when they are removed from the business). */
export async function removePersonFromAllTeams(db: Db, accountId: string, userId: string): Promise<void> {
  await db.deleteFrom('team_members').where('account_id', '=', accountId).where('user_id', '=', userId).execute();
}
