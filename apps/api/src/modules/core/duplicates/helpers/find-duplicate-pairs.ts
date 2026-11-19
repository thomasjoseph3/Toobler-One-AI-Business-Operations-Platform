// Finding records that are probably the same one. Pure logic: no database, no I/O. The code decides, never the AI.
// To stay fast with tens of thousands of records, records are first grouped by something they must share exactly (their name, the name part
// of their email, their phone), and the fuzzier comparison runs only inside a group. Comparing every pair would be about a billion checks.

/** A contact as far as the matching needs it. */
export interface ContactForMatching {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

/** A company as far as the matching needs it. */
export interface CompanyForMatching {
  id: string;
  name: string;
  phone: string | null;
}

/** Two records that look the same. `firstId` is always the smaller id, so a pair has one spelling. `reasons` are keys the screen turns into words. */
export interface FoundPair {
  firstId: string;
  secondId: string;
  reasons: string[];
}

export const CONTACT_REASONS = [
  'same_name_similar_phone',
  'same_name_same_email_name',
  'same_email_name_similar_phone',
] as const;
export const COMPANY_REASONS = ['same_name_without_suffix', 'same_phone'] as const;

// A group bigger than this is a placeholder name ("Test", "Guest") and says nothing about who is who, so it is skipped.
const LARGEST_GROUP = 200;

// Email names that many different people share, so sharing one proves nothing.
const SHARED_EMAIL_NAMES = new Set([
  'info',
  'admin',
  'sales',
  'contact',
  'hello',
  'support',
  'office',
  'mail',
  'enquiry',
  'enquiries',
  'accounts',
  'hr',
  'noreply',
]);

// Words that are only the legal form of a company, ignored when comparing company names.
const COMPANY_SUFFIX_WORDS = new Set([
  'pvt',
  'private',
  'ltd',
  'limited',
  'llp',
  'inc',
  'incorporated',
  'co',
  'company',
  'corp',
  'corporation',
  'the',
  'and',
]);

/** A name for comparing: lower case, with spaces, dots and other punctuation removed ("Anil  K." = "anilk"). Empty when too short to mean anything. */
export function makeNameKey(name: string | null): string {
  if (name === null) return '';
  const key = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return key.length >= 3 ? key : '';
}

/** The part of an email before the @, or empty when it is a shared one like "info" or too short to mean anything. */
export function makeEmailName(email: string | null): string {
  if (email === null) return '';
  const emailName = email.split('@')[0] ?? '';
  if (emailName.length < 4 || SHARED_EMAIL_NAMES.has(emailName)) return '';
  return emailName;
}

/** A company's name for comparing: lower case, without its legal-form words, spaces and punctuation ("Infosys Pvt. Ltd." = "infosys"). */
export function makeCompanyCoreName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/gu, ' and ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '' && !COMPANY_SUFFIX_WORDS.has(word));
  const core = words.join('');
  return core.length >= 3 ? core : '';
}

/** The digits of a phone like +919847012345. */
function phoneDigits(phone: string | null): string {
  return phone === null ? '' : phone.replace(/\D/gu, '');
}

/**
 * Whether two phones may belong to one person: they end in the same 10 digits (one written with a country code, one without), or they are the
 * same length and differ in exactly one digit (a typing slip). The same number exactly also counts (the database refuses it for live contacts).
 */
export function phonesAreSimilar(firstPhone: string | null, secondPhone: string | null): boolean {
  const first = phoneDigits(firstPhone);
  const second = phoneDigits(secondPhone);
  if (first.length < 7 || second.length < 7) return false;
  if (first.length >= 10 && second.length >= 10 && first.slice(-10) === second.slice(-10)) return true;
  if (first.length !== second.length) return false;
  let differingDigits = 0;
  for (let position = 0; position < first.length; position += 1) {
    if (first[position] !== second[position]) differingDigits += 1;
    if (differingDigits > 1) return false;
  }
  return true;
}

/** Collects pairs by their two ids and joins the reasons when the same pair is found twice. */
function createPairCollector() {
  const pairsByKey = new Map<string, FoundPair>();
  return {
    add(idOne: string, idTwo: string, reason: string): void {
      const [firstId, secondId] = idOne < idTwo ? [idOne, idTwo] : [idTwo, idOne];
      const key = `${firstId}|${secondId}`;
      const existing = pairsByKey.get(key);
      if (existing === undefined) pairsByKey.set(key, { firstId, secondId, reasons: [reason] });
      else if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    },
    pairs(): FoundPair[] {
      return [...pairsByKey.values()];
    },
  };
}

/** Puts each record in the group of its key (records with an empty key are left out) and returns only groups that can hold a pair. */
function groupByKey<RecordType>(records: RecordType[], makeKey: (record: RecordType) => string): RecordType[][] {
  const groups = new Map<string, RecordType[]>();
  for (const record of records) {
    const key = makeKey(record);
    if (key === '') continue;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [record]);
    else group.push(record);
  }
  return [...groups.values()].filter((group) => group.length >= 2 && group.length <= LARGEST_GROUP);
}

/** Every pair of contacts that look like one person (see the three rules in docs/features/F13-duplicates-and-merging.md). */
export function findDuplicateContactPairs(contacts: ContactForMatching[]): FoundPair[] {
  const collector = createPairCollector();

  // Same name: then a similar phone, or the same email name on another domain
  for (const group of groupByKey(contacts, (contact) => makeNameKey(contact.name))) {
    for (let firstIndex = 0; firstIndex < group.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < group.length; secondIndex += 1) {
        const first = group[firstIndex];
        const second = group[secondIndex];
        if (first === undefined || second === undefined) continue;
        if (phonesAreSimilar(first.phone, second.phone)) collector.add(first.id, second.id, 'same_name_similar_phone');
        const firstEmailName = makeEmailName(first.email);
        if (firstEmailName !== '' && firstEmailName === makeEmailName(second.email) && first.email !== second.email) {
          collector.add(first.id, second.id, 'same_name_same_email_name');
        }
      }
    }
  }

  // Same email name on another domain: then a similar phone
  for (const group of groupByKey(contacts, (contact) => makeEmailName(contact.email))) {
    for (let firstIndex = 0; firstIndex < group.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < group.length; secondIndex += 1) {
        const first = group[firstIndex];
        const second = group[secondIndex];
        if (first === undefined || second === undefined) continue;
        if (first.email !== second.email && phonesAreSimilar(first.phone, second.phone)) {
          collector.add(first.id, second.id, 'same_email_name_similar_phone');
        }
      }
    }
  }
  return collector.pairs();
}

/** Every pair of companies that look like one firm: the same name without its legal-form words, or the same phone. */
export function findDuplicateCompanyPairs(companies: CompanyForMatching[]): FoundPair[] {
  const collector = createPairCollector();
  const groupings: Array<{ makeKey: (company: CompanyForMatching) => string; reason: string }> = [
    { makeKey: (company) => makeCompanyCoreName(company.name), reason: 'same_name_without_suffix' },
    { makeKey: (company) => phoneDigits(company.phone), reason: 'same_phone' },
  ];
  for (const { makeKey, reason } of groupings) {
    for (const group of groupByKey(companies, makeKey)) {
      for (let firstIndex = 0; firstIndex < group.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < group.length; secondIndex += 1) {
          const first = group[firstIndex];
          const second = group[secondIndex];
          if (first !== undefined && second !== undefined) collector.add(first.id, second.id, reason);
        }
      }
    }
  }
  return collector.pairs();
}
