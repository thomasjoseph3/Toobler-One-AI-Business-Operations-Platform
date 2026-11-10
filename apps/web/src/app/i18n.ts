// All text on screen comes from here, through t(). Phase 1 is English only (CLAUDE.md "Language rule"); keeping the
// words in one place is what makes a later translation possible.
const englishMessages = {
  'app.name': 'Toobler One',
  'app.skipToContent': 'Skip to content',
  'nav.main': 'Main navigation',
  'nav.more': 'More',
  'nav.moreTitle': 'More pages',
  'nav.close': 'Close',
  'nav.group.work': 'Work',
  'nav.group.insight': 'Insight',
  'nav.group.admin': 'Admin',
  'nav.today': 'Today',
  'nav.leads': 'Leads',
  'nav.contacts': 'Contacts',
  'nav.companies': 'Companies',
  'nav.inbox': 'Inbox',
  'nav.tasks': 'Tasks',
  'nav.tickets': 'Tickets',
  'nav.reports': 'Reports',
  'nav.knowledge': 'Knowledge base',
  'nav.channels': 'Channels',
  'nav.settings': 'Settings',
  'theme.label': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',
  'page.today.description': 'What needs you today: callbacks, new leads and tasks that are due.',
  'page.leads.description': 'Every enquiry the AI agents and your team have picked up.',
  'page.contacts.description': 'The people who have called, messaged or emailed your business.',
  'page.companies.description': 'The businesses your contacts work for.',
  'page.inbox.description': 'Calls, WhatsApp messages, chats and emails in one place.',
  'page.tasks.description': 'Calls to make, messages to send and things to follow up.',
  'page.tickets.description': 'Complaints and service requests that need an answer.',
  'page.reports.description': 'How many enquiries came in, from where, and how they went.',
  'page.knowledge.description': 'What the AI agents know about your business.',
  'page.channels.description': 'Switch on the ways customers reach you: phone, WhatsApp, website chat and email.',
  'page.settings.description': 'Your business details, your team and your preferences.',
  'placeholder.title': 'Nothing here yet',
  'placeholder.description': 'This page is part of Toobler One and will be filled in as each feature is built.',
  'notFound.title': 'Page not found',
  'notFound.description': 'This page does not exist, or it is switched off for your business.',
  'notFound.back': 'Go to Today',
} as const;

export type MessageKey = keyof typeof englishMessages;

/** Returns the text for a message key. */
export function t(messageKey: MessageKey): string {
  return englishMessages[messageKey];
}
