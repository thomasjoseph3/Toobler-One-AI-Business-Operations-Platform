import type { EmailDraft, EmailDraftsResponse } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Config } from '../../../../kernel/config';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import type { MailboxProvider } from '../../../../providers/mailbox';
import * as emailConnectionRepository from '../repositories/email-connection.repository';
import type { EmailDraftRow } from '../repositories/email-connection.repository';
import { sendReplyFromMailbox } from './email-sender.service';
import { openMailboxAccess } from './mailbox-access.service';

/** Turns a database row into the draft the API answers with. */
function toEmailDraft(row: EmailDraftRow): EmailDraft {
  return {
    id: row.id,
    conversationId: row.conversationId,
    toEmail: row.toEmail,
    subject: row.subject,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The replies the AI wrote for a team member to approve (reply mode "draft"): list them, send one (optionally with the words changed), or discard
 * one. The routes call this. A draft is sent at most once: sending and discarding both settle it under one rule in the database.
 */
export function createEmailDraftsService(dependencies: {
  database: Database;
  config: Config;
  mailbox: MailboxProvider;
}) {
  const { database, config, mailbox } = dependencies;

  return {
    /** The drafts waiting for approval, oldest first. */
    async listWaitingDrafts(principal: Pick<Principal, 'accountId'>): Promise<EmailDraftsResponse> {
      const rows = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        emailConnectionRepository.listWaitingDrafts(transaction, principal.accountId),
      );
      return { items: rows.map(toEmailDraft) };
    },

    /**
     * Sends a waiting draft from the business's mailbox, in the customer's thread, with the team member's changed words when they sent any.
     * The sent words are also written into the conversation as the team member's reply. 404 for an unknown or another business's draft; 409
     * `DRAFT_ALREADY_SETTLED` when it was already sent or discarded; 409 `NO_MAILBOX` when no mailbox is connected.
     */
    async sendDraft(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      draftId: string,
      changedBody: string | undefined,
    ): Promise<EmailDraft> {
      const { accountId } = principal;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const draft = await database.runInAccountTransaction(accountId, (transaction) =>
        emailConnectionRepository.findDraft(transaction, accountId, draftId),
      );
      if (!draft) throw notFound('That draft');
      if (draft.status !== 'waiting')
        throw conflict('DRAFT_ALREADY_SETTLED', 'That draft was already sent or discarded.');
      const opened = await openMailboxAccess(database, config, accountId);
      if (!opened) throw conflict('NO_MAILBOX', 'No mailbox is connected, so the reply cannot be sent.');
      const body = changedBody ?? draft.body;

      // Settle first: only one of two quick clicks wins, so the reply is never sent twice
      const won = await database.runInAccountTransaction(accountId, async (transaction) => {
        const settled = await emailConnectionRepository.settleDraft(transaction, {
          accountId,
          draftId,
          status: 'sent',
          body,
          actor,
        });
        if (settled) {
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'email.draft_sent',
            details: { recordType: 'email_draft', recordId: draftId },
          });
        }
        return settled;
      });
      if (!won) throw conflict('DRAFT_ALREADY_SETTLED', 'That draft was already sent or discarded.');
      try {
        await sendReplyFromMailbox({
          database,
          mailbox,
          accountId,
          access: opened.access,
          reply: {
            to: draft.toEmail,
            subject: draft.subject,
            text: body,
            inReplyTo: draft.inReplyTo,
            references: draft.references,
          },
        });
      } catch (error) {
        // Sending failed: the draft goes back to waiting so the team member can try again
        await database.runInAccountTransaction(accountId, (transaction) =>
          emailConnectionRepository.reopenDraft(transaction, accountId, draftId),
        );
        throw error;
      }
      return toEmailDraft({ ...draft, body, status: 'sent' });
    },

    /** Discards a waiting draft (nothing is sent). 404 for an unknown or another business's draft; 409 when it was already settled. */
    async discardDraft(principal: Pick<Principal, 'accountId' | 'userId'>, draftId: string): Promise<void> {
      const { accountId } = principal;
      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        const draft = await emailConnectionRepository.findDraft(transaction, accountId, draftId);
        if (!draft) throw notFound('That draft');
        const settled = await emailConnectionRepository.settleDraft(transaction, {
          accountId,
          draftId,
          status: 'discarded',
          actor,
        });
        if (!settled) throw conflict('DRAFT_ALREADY_SETTLED', 'That draft was already sent or discarded.');
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'email.draft_discarded',
          details: { recordType: 'email_draft', recordId: draftId },
        });
      });
    },
  };
}
