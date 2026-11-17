import { Link, useLocation } from 'react-router';
import { joinClassNames } from '@toobler-one/ui';

/**
 * A contact's name as a link to its own page (`/contacts/<id>`). It remembers which view of the list the person came from (the
 * search, the stage, the page) so the page's "Back to contacts" link returns to exactly that view.
 */
export function ContactNameLink({ contactId, children, className }: { contactId: string; children: string; className?: string }) {
  const location = useLocation();
  return (
    <Link to={`/contacts/${contactId}`} state={{ listSearch: location.search }} className={joinClassNames('hover:underline', className)}>
      {children}
    </Link>
  );
}
