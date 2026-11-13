import type { Database } from '../../../../kernel/database';
import { uuidv7 } from '../../../../kernel/ids';
import { describeCallForRecord } from '../helpers/describe-call-for-record';
import { toDayText } from '../helpers/usage-math';
import { insertCallAndAddToDailyUsage } from '../repositories/ai-usage.repository';
import type { AiCallRecorder } from './ai-calls.service';

/** The recorder that writes every call to the database: one row in the call record and one addition to the day's totals. */
export function createDatabaseCallRecorder({
  database,
  now = () => new Date(),
}: {
  database: Database;
  now?: () => Date;
}): AiCallRecorder {
  return {
    async record(record) {
      const described = describeCallForRecord(record);
      if (!described) return;
      await database.runInAccountTransaction(record.accountId, (transaction) =>
        insertCallAndAddToDailyUsage(transaction, { id: uuidv7(), ...described }, toDayText(now())),
      );
    },
  };
}
