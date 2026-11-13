import { Monitor, Sun } from 'lucide-react';
import { IconButton, MoonIcon } from '@toobler-one/ui';
import type { ReactNode } from 'react';
import { t, type MessageKey } from '../i18n';
import { useTheme, type ThemeChoice } from '../theme';

/**
 * Each theme choice, what it is called, its icon, and which one comes next when the button is pressed. Light shows the
 * designer's moon (the Figma top bar); Dark and System have no Figma icon, so they keep a Lucide sun and monitor.
 */
const THEME_STEPS: Record<ThemeChoice, { labelKey: MessageKey; icon: ReactNode; next: ThemeChoice }> = {
  light: { labelKey: 'theme.light', icon: <MoonIcon size={20} />, next: 'dark' },
  dark: { labelKey: 'theme.dark', icon: <Sun aria-hidden className="size-5" />, next: 'system' },
  system: { labelKey: 'theme.system', icon: <Monitor aria-hidden className="size-5" />, next: 'light' },
};

/** One button that goes Light, then Dark, then System, then Light again. Its icon and name show the current choice. */
export function ThemeSwitch() {
  const { themeChoice, chooseTheme } = useTheme();
  const { labelKey, icon, next } = THEME_STEPS[themeChoice];
  return (
    <IconButton
      label={`${t('theme.label')}: ${t(labelKey)}. ${t('theme.change')}`}
      icon={icon}
      onClick={() => chooseTheme(next)}
      className="text-icon-secondary"
    />
  );
}
