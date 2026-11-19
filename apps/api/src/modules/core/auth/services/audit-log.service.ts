import type { AuditLogQuery, AuditLogResponse } from '@toobler-one/shared';
import type { Database } from '../../../../kernel/database';
import type { Principal } from '../../../../kernel/http/guard';
import * as auditLogRepository from '../repositories/audit-log.repository';
import * as usersRepository from '../repositories/users.repository';

/**
 * Everything about reading the activity log (who did what, when) for managers. The route calls this.
 * Repositories used: audit-log, users (both in ../repositories).
 */
export function createAuditLogService({ database }: { database: Database }) {
  return {
    /**
     * One page of the business's log, newest first, narrowed by person, area and time. A person's name is filled in from the people of the
     * business (null for an agent, the system or someone no longer found). The log holds field NAMES only, so nothing private is shown.
     */
    async listAuditLog(principal: Pick<Principal, 'accountId'>, query: AuditLogQuery): Promise<AuditLogResponse> {
      const { rows, total } = await database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const found = await auditLogRepository.listAuditLogLines(transaction, {
          accountId: principal.accountId,
          filters: {
            personUserId: query.person,
            areas: query.area,
            from: query.from ? new Date(query.from) : undefined,
            to: query.to ? new Date(query.to) : undefined,
          },
          page: query.page,
          limit: query.limit,
        });
        const userIds = [...new Set(found.rows.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])))];
        const people = await usersRepository.listPeopleByIds(transaction, principal.accountId, userIds);
        const nameById = new Map(people.map((person) => [person.id, person.name]));
        return {
          total: found.total,
          rows: found.rows.map((row) => ({
            ...row,
            actorName: row.actorUserId ? (nameById.get(row.actorUserId) ?? null) : null,
          })),
        };
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          actor: { kind: row.actorKind, userId: row.actorUserId, name: row.actorName },
          recordType: row.recordType,
          recordId: row.recordId,
          fields: row.fields,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        page: query.page,
        limit: query.limit,
      };
    },
  };
}

export type AuditLogService = ReturnType<typeof createAuditLogService>;
