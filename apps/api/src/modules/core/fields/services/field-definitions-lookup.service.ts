import type { FieldDefinition, FieldObject } from '@toobler-one/shared';
import type { Db } from '../../../../kernel/database';
import { listFieldDefinitions } from '../repositories/field-definitions.repository';

/** The live (not removed) custom fields of one object, in order. Other modules call this inside their own transaction, through the module's index. */
export function findFieldDefinitions(db: Db, accountId: string, object: FieldObject): Promise<FieldDefinition[]> {
  return listFieldDefinitions(db, accountId, object);
}
