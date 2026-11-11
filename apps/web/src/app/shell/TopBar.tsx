import { LogOut } from 'lucide-react';
import { Button } from '@toobler-one/ui';
import { useSession } from '../../auth/session';
import { t } from '../i18n';
import { ThemeSwitch } from './ThemeSwitch';

/**
 * The 56 px bar across the top. On a phone it shows the product name (there is no side rail). It shows who is signed in
 * and their business (the business name is hidden on a phone to save room), a Sign out button, and the theme switch.
 */
export function TopBar() {
  const { sessionState, signOut } = useSession();
  const profile = sessionState.status === 'signedIn' ? sessionState.profile : null;
  return (
    <div className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface px-4 md:justify-end md:px-6">
      <span className="text-base-heading text-text-primary md:hidden">{t('app.name')}</span>
      <div className="flex min-w-0 items-center gap-2">
        {profile ? (
          <div className="hidden min-w-0 text-right md:block">
            <p className="text-sm-button truncate text-text-primary">{profile.user.name}</p>
            <p className="text-xs-caption truncate text-text-secondary">{profile.business.name}</p>
          </div>
        ) : null}
        <Button
          variant="tertiary"
          leadingIcon={<LogOut aria-hidden className="size-4" />}
          onClick={() => void signOut()}
        >
          {t('session.signOut')}
        </Button>
        <ThemeSwitch />
      </div>
    </div>
  );
}
