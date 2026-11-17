import { decodeHtmlCharacters, htmlToText, readEmbeddedPageText, readTagAttribute } from './html-to-text';

// What one web page says, as the AI reads it: its title and description, the facts it states for search engines (schema.org),
// its text, and its phone, email, WhatsApp and map links. Pure: no network. Ported from the hotel agent, with the hotel-only
// facts (check-in times, amenities, pets) left out: every industry reads the same way.

/** The most text kept from one page. */
const MAX_PAGE_TEXT_LENGTH = 16_000;
/** The most characters of each structured-data block that reach the AI. */
const MAX_STRUCTURED_DATA_PER_BLOCK = 4_000;

export interface PageLink {
  url: string;
  label: string;
}

/** The facts a page states about the business itself in its structured data. Every field is optional. */
export interface StructuredBusinessFacts {
  name?: string;
  phone?: string;
  email?: string;
  address?: { line1?: string; city?: string; state?: string; postalCode?: string; country?: string };
  openingHours?: string;
  mapsUrl?: string;
}

export interface ReadPage {
  title: string;
  text: string;
  links: PageLink[];
  phones: string[];
  emails: string[];
  mapLinks: string[];
  facts: StructuredBusinessFacts;
}

/** The kinds of thing that describe a business (a shop, a clinic, a school...), not a page, a review or an offer. */
const BUSINESS_TYPE_PATTERN =
  /Organization|LocalBusiness|Hotel|Lodging|Resort|Motel|Hostel|BedAndBreakfast|Campground|TravelAgency|Store|Restaurant|MedicalBusiness|Clinic|Physician|Dentist|Hospital|ProfessionalService|AutoDealer|EducationalOrganization|School|RealEstateAgent|HomeAndConstructionBusiness/i;

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

/** The first non-empty text in a value that may be one text or a list. */
function firstText(value: unknown): string | undefined {
  const texts = Array.isArray(value) ? value.map(asText) : [asText(value)];
  return texts.find(Boolean) || undefined;
}

/** "14:00:00", "T14:00" or "2:00 PM" as HH:MM; anything else gives undefined. */
function toHoursAndMinutes(value: unknown): string | undefined {
  const match = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?/i.exec(asText(value));
  if (!match) return undefined;
  let hours = Number(match[1]);
  if (match[3]) hours = (hours % 12) + (/p/i.test(match[3]) ? 12 : 0);
  return hours < 24 ? `${String(hours).padStart(2, '0')}:${match[2]}` : undefined;
}

/** Opening hours as people write them: "Mo-Sa 09:30-18:00", or the days and times of openingHoursSpecification. */
function readOpeningHours(business: Record<string, unknown>): string | undefined {
  const plain = [business['openingHours']].flat().map(asText).filter(Boolean);
  if (plain.length) return plain.join(', ');
  const specifications = [business['openingHoursSpecification']]
    .flat()
    .filter((specification): specification is Record<string, unknown> => !!specification && typeof specification === 'object')
    .map((specification) => {
      const days = [specification['dayOfWeek']]
        .flat()
        .map((day) => asText(day).split('/').pop())
        .filter(Boolean)
        .join(', ');
      const opens = specification['opens'];
      const closes = specification['closes'];
      return days && opens && closes ? `${days} ${toHoursAndMinutes(opens) ?? asText(opens)}–${toHoursAndMinutes(closes) ?? asText(closes)}` : '';
    })
    .filter(Boolean);
  return specifications.length ? specifications.join('; ') : undefined;
}

/**
 * What a site's schema.org data says about the business itself, read without the AI: every object in its JSON-LD blocks whose
 * type is a kind of business. The first one found wins, field by field.
 */
export function readStructuredBusinessFacts(jsonBlocks: readonly string[]): StructuredBusinessFacts {
  const businesses: Record<string, unknown>[] = [];
  const walk = (value: unknown, depth = 0): void => {
    if (!value || typeof value !== 'object' || depth > 8 || businesses.length > 20) return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    const record = value as Record<string, unknown>;
    if (BUSINESS_TYPE_PATTERN.test([record['@type']].flat().join(' '))) businesses.push(record);
    for (const item of Object.values(record)) walk(item, depth + 1);
  };
  for (const block of jsonBlocks) {
    try {
      walk(JSON.parse(block));
    } catch {
      // A block cut short or written wrongly: its text still reaches the AI
    }
  }

  const facts: StructuredBusinessFacts = {};
  for (const business of businesses) {
    facts.name ??= firstText(business['name']);
    facts.phone ??= firstText(business['telephone']);
    facts.email ??= firstText(business['email'])?.replace(/^mailto:/i, '');
    if (!facts.address) {
      const addressObject = [business['address']].flat().find((candidate) => candidate && typeof candidate === 'object') as
        | Record<string, unknown>
        | undefined;
      const readPart = (value: unknown) =>
        firstText(typeof value === 'object' && value ? (value as Record<string, unknown>)['name'] : value);
      if (addressObject) {
        const address = {
          line1: readPart(addressObject['streetAddress']),
          city: readPart(addressObject['addressLocality']),
          state: readPart(addressObject['addressRegion']),
          postalCode: readPart(addressObject['postalCode']),
          // A site builder's own number for the country ("107") is not a country
          country: readPart(addressObject['addressCountry'])?.replace(/^\d+$/, ''),
        };
        const filled = Object.fromEntries(Object.entries(address).filter(([, part]) => part));
        if (Object.keys(filled).length > 0) facts.address = filled;
      } else if (typeof business['address'] === 'string') {
        facts.address = { line1: business['address'].trim() };
      }
    }
    facts.openingHours ??= readOpeningHours(business);
    const mapAddress = firstText(business['hasMap']);
    if (!facts.mapsUrl && mapAddress && /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(mapAddress)) {
      facts.mapsUrl = mapAddress;
    }
  }
  return facts;
}

/** The number of a WhatsApp chat link (wa.me/919847012345, api.whatsapp.com/send?phone=...) as +digits, or null. */
function readWhatsAppNumber(url: URL): string | null {
  const digitsAsWritten = /^(www\.)?wa\.me$/i.test(url.hostname)
    ? url.pathname.slice(1)
    : /^(api|web)\.whatsapp\.com$/i.test(url.hostname)
      ? (url.searchParams.get('phone') ?? '')
      : '';
  const digits = digitsAsWritten.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

/** Reads a link's text once decoded; a badly escaped phone or email link gives the raw text instead of failing. */
function decodeLinkValue(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

/** What one page says, as the AI reads it. `baseAddress` is the page's own address, to turn relative links into full ones. */
export function readHtmlPage(html: string, baseAddress: string): ReadPage {
  const links: PageLink[] = [];
  const phones = new Set<string>();
  const emails = new Set<string>();
  const mapLinks = new Set<string>();
  const whatsAppNumbers = new Set<string>();
  for (const anchor of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const openingTag = anchor[0].slice(0, anchor[0].indexOf('>') + 1);
    const href = readTagAttribute(openingTag, 'href');
    if (!href) continue;
    if (/^tel:/i.test(href)) {
      phones.add(decodeLinkValue(href.slice(4)));
    } else if (/^mailto:/i.test(href)) {
      emails.add(decodeLinkValue(href.slice(7).split('?')[0] ?? ''));
    } else {
      let url: URL;
      try {
        url = new URL(href, baseAddress);
      } catch {
        continue;
      }
      const whatsAppNumber = readWhatsAppNumber(url);
      if (whatsAppNumber) whatsAppNumbers.add(whatsAppNumber);
      else if (/^(www\.)?google\.[a-z.]+$/i.test(url.hostname) && url.pathname.startsWith('/maps')) mapLinks.add(url.href);
      else if (/^maps\.(app\.)?goo\.gl$/i.test(url.hostname)) mapLinks.add(url.href);
      else if (/^https?:$/.test(url.protocol)) links.push({ url: url.href, label: htmlToText(anchor[1] ?? '').slice(0, 80) });
    }
  }

  const title = htmlToText((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) ?? [])[1] ?? '');
  const descriptions = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /(name|property)\s*=\s*["']?(description|og:description|og:title|og:site_name)/i.test(tag))
    .map((tag) => readTagAttribute(tag, 'content'))
    .filter(Boolean);
  const structuredDataBlocks = [
    ...html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((match) => (match[1] ?? '').trim().slice(0, 200_000));
  const embeddedText = readEmbeddedPageText(html);
  const text = [
    title,
    ...new Set(descriptions),
    ...structuredDataBlocks.map((block) => `[structured data] ${block.slice(0, MAX_STRUCTURED_DATA_PER_BLOCK)}`),
    htmlToText(html),
    embeddedText && `[page data] ${embeddedText}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    title,
    text: decodeHtmlCharacters(text).slice(0, MAX_PAGE_TEXT_LENGTH),
    links,
    // A WhatsApp chat link is the business's number too: listed after its phone links
    phones: [...phones, ...whatsAppNumbers],
    emails: [...emails],
    mapLinks: [...mapLinks],
    facts: readStructuredBusinessFacts(structuredDataBlocks),
  };
}
