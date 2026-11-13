import { BookOpen, Plug } from 'lucide-react';
import {
  CompaniesIcon,
  ContactsIcon,
  LeadsIcon,
  ReportsIcon,
  SettingsIcon,
  SharedInboxIcon,
  TasksIcon,
  TicketsIcon,
  TodayIcon,
} from '@toobler-one/ui';
import type { ComponentType } from 'react';
import type { MessageKey, PageId } from './i18n';

/**
 * One menu entry. This has the shape the API's `GET /me` will return later (F03): the menu is data, built from the
 * modules that are switched on for the business. For now it is a fixed list of the Phase 1 pages.
 */
export interface NavigationItem {
  id: PageId;
  labelKey: MessageKey;
  /** One line shown under the page title. */
  descriptionKey: MessageKey;
  path: string;
  /** Icons come from the designer's Figma frame; Knowledge base and Channels have none yet, so they keep a Lucide icon. */
  icon: ComponentType<{ className?: string }>;
  group: 'work' | 'insight' | 'admin';
  /** Phone: the four most-used pages sit in the bottom bar; everything else is under "More". */
  isInBottomBar: boolean;
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    id: 'today',
    labelKey: 'nav.today',
    descriptionKey: 'page.today.description',
    path: '/',
    icon: TodayIcon,
    group: 'work',
    isInBottomBar: true,
  },
  {
    id: 'leads',
    labelKey: 'nav.leads',
    descriptionKey: 'page.leads.description',
    path: '/leads',
    icon: LeadsIcon,
    group: 'work',
    isInBottomBar: true,
  },
  {
    id: 'contacts',
    labelKey: 'nav.contacts',
    descriptionKey: 'page.contacts.description',
    path: '/contacts',
    icon: ContactsIcon,
    group: 'work',
    isInBottomBar: false,
  },
  {
    id: 'companies',
    labelKey: 'nav.companies',
    descriptionKey: 'page.companies.description',
    path: '/companies',
    icon: CompaniesIcon,
    group: 'work',
    isInBottomBar: false,
  },
  {
    id: 'inbox',
    labelKey: 'nav.inbox',
    descriptionKey: 'page.inbox.description',
    path: '/inbox',
    icon: SharedInboxIcon,
    group: 'work',
    isInBottomBar: true,
  },
  {
    id: 'tasks',
    labelKey: 'nav.tasks',
    descriptionKey: 'page.tasks.description',
    path: '/tasks',
    icon: TasksIcon,
    group: 'work',
    isInBottomBar: true,
  },
  {
    id: 'tickets',
    labelKey: 'nav.tickets',
    descriptionKey: 'page.tickets.description',
    path: '/tickets',
    icon: TicketsIcon,
    group: 'work',
    isInBottomBar: false,
  },
  {
    id: 'reports',
    labelKey: 'nav.reports',
    descriptionKey: 'page.reports.description',
    path: '/reports',
    icon: ReportsIcon,
    group: 'insight',
    isInBottomBar: false,
  },
  {
    id: 'knowledge',
    labelKey: 'nav.knowledge',
    descriptionKey: 'page.knowledge.description',
    path: '/knowledge',
    icon: BookOpen,
    group: 'insight',
    isInBottomBar: false,
  },
  {
    id: 'channels',
    labelKey: 'nav.channels',
    descriptionKey: 'page.channels.description',
    path: '/channels',
    icon: Plug,
    group: 'admin',
    isInBottomBar: false,
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    descriptionKey: 'page.settings.description',
    path: '/settings',
    icon: SettingsIcon,
    group: 'admin',
    isInBottomBar: false,
  },
];

/** The menu groups in the order they appear in the sidebar, with their heading text. */
export const NAVIGATION_GROUPS: readonly { id: NavigationItem['group']; labelKey: MessageKey }[] = [
  { id: 'work', labelKey: 'nav.group.work' },
  { id: 'insight', labelKey: 'nav.group.insight' },
  { id: 'admin', labelKey: 'nav.group.admin' },
];
