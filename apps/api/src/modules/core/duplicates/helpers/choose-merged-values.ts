import type { LifecycleStage, MergeDuplicateRequest, PairSide } from '@toobler-one/shared';

// Working out which value each field of the kept record ends up with after a merge. Pure logic: no database.
// The rule: where staff chose a side, that side's value; where they did not, the kept record's own value, or the other record's when the kept one has none.

/** The fields of the two records that can differ, for either kind of record. */
export interface MergeableFields {
  name: string | null;
  phone: string | null;
  email: string | null;
  language: string | null;
  lifecycleStage: LifecycleStage | null;
  companyId: string | null;
  domain: string | null;
  city: string | null;
  ownerUserId: string | null;
}

/** The other side of a pair. */
export function otherSide(side: PairSide): PairSide {
  return side === 'a' ? 'b' : 'a';
}

/**
 * The value one field ends up with. `choice` is the side staff picked for this field (undefined when they did not pick one). An empty value on
 * the chosen side is respected (staff may want the field empty), except that a field the kept record has no value for is still filled in from
 * the other when nothing was chosen.
 */
export function chooseValue<Value>(options: {
  keptValue: Value | null;
  otherValue: Value | null;
  keptSide: PairSide;
  choice: PairSide | undefined;
}): Value | null {
  if (options.choice === undefined) return options.keptValue ?? options.otherValue;
  return options.choice === options.keptSide ? options.keptValue : options.otherValue;
}

/** The two records, the side staff keep, and what they chose; the result is every merged field. */
export function chooseMergedFields(options: {
  a: MergeableFields;
  b: MergeableFields;
  request: MergeDuplicateRequest;
}): MergeableFields {
  const { a, b, request } = options;
  const keptSide = request.keep;
  const kept = keptSide === 'a' ? a : b;
  const other = keptSide === 'a' ? b : a;
  const take = request.take;
  const pick = <Value>(keptValue: Value | null, otherValue: Value | null, choice: PairSide | undefined) =>
    chooseValue({ keptValue, otherValue, keptSide, choice });
  return {
    name: pick(kept.name, other.name, take.name),
    phone: pick(kept.phone, other.phone, take.phone),
    email: pick(kept.email, other.email, take.email),
    language: pick(kept.language, other.language, take.language),
    lifecycleStage: pick(kept.lifecycleStage, other.lifecycleStage, take.lifecycleStage),
    companyId: pick(kept.companyId, other.companyId, take.company),
    domain: pick(kept.domain, other.domain, take.domain),
    city: pick(kept.city, other.city, take.city),
    ownerUserId: pick(kept.ownerUserId, other.ownerUserId, take.owner),
  };
}

/** The custom answers where staff chose the side that is being merged away: those answers win over the kept record's. */
export function customKeysFromMergedAway(request: MergeDuplicateRequest): string[] {
  const mergedAwaySide = otherSide(request.keep);
  return Object.entries(request.take.custom ?? {})
    .filter(([, side]) => side === mergedAwaySide)
    .map(([key]) => key);
}
