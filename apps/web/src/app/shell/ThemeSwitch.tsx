import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { IconButton } from '@toobler-one/ui';
import { t, type MessageKey } from '../i18n';
import { useTheme, type ThemeChoice } from '../theme';

/** Each theme choice, what it is called, its icon, and which one comes next when the button is pressed. */
const THEME_STEPS: Record<ThemeChoice, { labelKey: MessageKey; icon: LucideIcon; next: ThemeChoice }> = {
  light: { labelKey: 'theme.light', icon: Sun, next: 'dark' },
  dark: { labelKey: 'theme.dark', icon: Moon, next: 'system' },
  system: { labelKey: 'theme.system', icon: Monitor, next: 'light' },
};

/** One button that goes Light, then Dark, then System, then Light again. Its icon and name show the current choice. */
export function ThemeSwitch() {
  const { themeChoice, chooseTheme } = useTheme();
  const { labelKey, icon: Icon, next } = THEME_STEPS[themeChoice];
  return (
    <IconButton
      label={`${t('theme.label')}: ${t(labelKey)}. ${t('theme.change')}`}
      icon={<Icon aria-hidden className="size-5" />}
      onClick={() => chooseTheme(next)}
      className="border-border-default bg-surface"
    />
  );
}
