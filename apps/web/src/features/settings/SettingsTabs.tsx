import { NavLink } from 'react-router';
import { joinClassNames } from '@toobler-one/ui';
import { t, type MessageKey } from '../../app/i18n';
import { useSession } from '../../auth/session';

/** The pages inside Settings. Later screens add a line here. */
const TABS: ReadonlyArray<{ path: string; labelKey: MessageKey; managersOnly?: boolean }> = [
  { path: '/settings', labelKey: 'settingsTabs.ai' },
  { path: '/settings/modules', labelKey: 'settingsTabs.modules' },
  { path: '/settings/team', labelKey: 'settingsTabs.team', managersOnly: true },
  { path: '/settings/teams', labelKey: 'settingsTabs.teams', managersOnly: true },
];

/** The row of links at the top of every Settings page. The page you are on is marked, for sight and for screen readers. */
export function SettingsTabs() {
  const { sessionState } = useSession();
  const isManager = sessionState.status === 'signedIn' && sessionState.profile.user.role === 'manager';
  // A page only managers may open (the API refuses everyone else) is left out of the row for staff
  const visibleTabs = TABS.filter((tab) => !tab.managersOnly || isManager);
  return (
    <nav aria-label={t('settingsTabs.label')} className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {visibleTabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end
          className={({ isActive }) =>
            joinClassNames(
              'text-label-md shrink-0 rounded-md px-3 py-2 hover:bg-hover',
              isActive ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary',
            )
          }
        >
          {t(tab.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}
