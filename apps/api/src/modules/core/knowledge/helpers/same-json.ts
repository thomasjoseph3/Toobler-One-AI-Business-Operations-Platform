/**
 * True when two JSON values hold the same data, whatever the order of their object keys (the database does not keep keys in
 * the order they were sent). Used to tell "the answer changed" from "the same answer was sent again". Pure.
 */
export function sameJson(first: unknown, second: unknown): boolean {
  if (first === second) return true;
  if (typeof first !== 'object' || typeof second !== 'object' || first === null || second === null) return false;
  if (Array.isArray(first) !== Array.isArray(second)) return false;
  if (Array.isArray(first) && Array.isArray(second)) {
    return first.length === second.length && first.every((item, index) => sameJson(item, second[index]));
  }
  const firstEntries = Object.entries(first as Record<string, unknown>);
  const secondRecord = second as Record<string, unknown>;
  if (firstEntries.length !== Object.keys(secondRecord).length) return false;
  return firstEntries.every(([key, value]) => key in secondRecord && sameJson(value, secondRecord[key]));
}
