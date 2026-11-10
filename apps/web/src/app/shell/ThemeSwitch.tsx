import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { joinClassNames } from '@toobler-one/ui';
import { t, type MessageKey } from '../i18n';
import { useTheme, type ThemeChoice } from '../theme';

const THEME_OPTIONS: { choice: ThemeChoice; labelKey: MessageKey; icon: LucideIcon }[] = [
  { choice: 'light', labelKey: 'theme.light', icon: Sun },
  { choice: 'dark', labelKey: 'theme.dark', icon: Moon },
  { choice: 'system', labelKey: 'theme.system', icon: Monitor },
];

/** Three buttons (Light, Dark, System) in one group. The chosen one is marked for screen readers and by its look. */
export function ThemeSwitch() {
  const { themeChoice, chooseTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className="flex rounded-md border border-border bg-surface p-0.5"
    >
      {THEME_OPTIONS.map(({ choice, labelKey, icon: Icon }) => {
        const isChosen = themeChoice === choice;
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={isChosen}
            aria-label={t(labelKey)}
            title={t(labelKey)}
            onClick={() => chooseTheme(choice)}
            className={joinClassNames(
              'flex size-9 items-center justify-center rounded-sm md:size-8',
              isChosen ? 'bg-action-subtle text-action' : 'text-text-secondary hover:bg-surface-hover',
            )}
          >
            <Icon aria-hidden className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
