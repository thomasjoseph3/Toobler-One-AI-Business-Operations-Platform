import { t } from '../i18n';
import { ThemeSwitch } from './ThemeSwitch';

/** The 56 px bar across the top. On a phone it shows the product name (there is no side rail); the theme switch is always here. */
export function TopBar() {
  return (
    <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-surface px-4 md:justify-end md:px-6">
      <span className="text-base-heading text-text-primary md:hidden">{t('app.name')}</span>
      <ThemeSwitch />
    </div>
  );
}
