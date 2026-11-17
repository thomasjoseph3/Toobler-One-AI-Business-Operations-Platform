import { NavLink } from 'react-router';
import { joinClassNames } from '@toobler-one/ui';
import { t, type MessageKey } from '../../app/i18n';

/** The pages inside Settings. Later screens add a line here. */
const TABS: ReadonlyArray<{ path: string; labelKey: MessageKey }> = [
  { path: '/settings', labelKey: 'settingsTabs.ai' },
  { path: '/settings/modules', labelKey: 'settingsTabs.modules' },
];

/** The row of links at the top of every Settings page. The page you are on is marked, for sight and for screen readers. */
export function SettingsTabs() {
  return (
    <nav aria-label={t('settingsTabs.label')} className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {TABS.map((tab) => (
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
