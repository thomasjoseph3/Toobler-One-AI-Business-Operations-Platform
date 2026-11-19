import type { Database } from '../../../../kernel/database';
import { findBusinessIndustry, findStaffContactPoints } from '../../auth';
import { preFilter } from '../helpers/pre-filter';
import * as blockListRepository from '../repositories/block-list.repository';
import * as conversationTypesRepository from '../repositories/conversation-types.repository';
import type { createConversationClassifier } from './conversation-classifier.service';
import { ensureStartingConversationTypes } from './starting-conversation-types.service';

type Classifier = ReturnType<typeof createConversationClassifier>;

/** What the gate decided about one email. */
export interface EnquiryGateResult {
  /** True when the email is something the business should deal with (an enquiry, a question, a complaint, a customer): it goes to the Inbox and the AI answers. */
  worthAnswering: boolean;
  /** The type the email was recognised as, or the type a rule decided. */
  typeKey: string;
  /** Why, in a few words, for the logs. */
  reason: string;
}

/** What the sorting says happens to a type: only these outcomes are real work for the business. The others are logged, filtered or ignored. */
const OUTCOMES_THAT_NEED_THE_BUSINESS = new Set(['lead', 'ticket', 'review']);

/**
 * The gate in front of the Inbox for emails that start a new thread. A mailbox gets all kinds of mail (suppliers, job seekers, spam, mail
 * from the team itself); only the mail the business should deal with is let in. First the cheap rules in code (the block list, the team's own
 * addresses, machine-made mail), then, if no rule settles it, the AI names the email's type with the same classifier and the same
 * business types as the sorting, and the type's own outcome decides: a type that makes a lead or a ticket (or asks for review) is let in;
 * a type that is only logged, filtered or ignored is not. Saves nothing.
 */
export function createEnquiryGate({ database, classifier }: { database: Database; classifier: Classifier }) {
  return {
    /** Decides one email. Throws when the AI cannot answer, so the caller can try the email again later. */
    async checkEmail(
      accountId: string,
      email: { fromEmail: string; subject: string; text: string; headers?: Readonly<Record<string, string>> },
    ): Promise<EnquiryGateResult> {
      const gathered = await database.runInAccountTransaction(accountId, async (transaction) => {
        const industryId = (await findBusinessIndustry(transaction, accountId)) ?? 'general';
        await ensureStartingConversationTypes(transaction, { accountId, industryId });
        const types = (await conversationTypesRepository.listConversationTypes(transaction, accountId)).filter(
          (candidate) => candidate.isActive,
        );
        const blockRows = await blockListRepository.listBlockListRows(transaction, accountId);
        const staff = await findStaffContactPoints(transaction, accountId);
        return { types, blockRows, staff };
      });

      const matched = preFilter({
        channel: 'email',
        conversationEnded: true,
        customerMessageCount: 1,
        ...(email.headers === undefined ? {} : { emailHeaders: email.headers }),
        email: email.fromEmail,
        blockedPhoneKeys: new Set(),
        blockedEmails: new Set(gathered.blockRows.flatMap((row) => (row.email === null ? [] : [row.email]))),
        staffPhoneKeys: new Set(),
        staffEmails: gathered.staff.emails,
      });
      if (matched) return { worthAnswering: false, typeKey: matched.typeKey, reason: matched.reason };

      const answer = await classifier.classifyConversation({
        accountId,
        channel: 'email',
        types: gathered.types.map((conversationType) => ({
          key: conversationType.key,
          label: conversationType.label,
          description: conversationType.description,
          examples: conversationType.examples,
        })),
        transcript: [{ speaker: 'customer', text: `Subject: ${email.subject}\n\n${email.text}` }],
      });
      const typeKey = answer.classification.primary.typeKey;
      const matchedType = gathered.types.find((candidate) => candidate.key === typeKey);
      // A type the business no longer has (or none found) is treated as worth a person's look: never lose a possible customer
      const worthAnswering =
        matchedType === undefined ||
        answer.classification.needsPerson ||
        OUTCOMES_THAT_NEED_THE_BUSINESS.has(matchedType.outcome);
      return { worthAnswering, typeKey, reason: answer.reason };
    },
  };
}
