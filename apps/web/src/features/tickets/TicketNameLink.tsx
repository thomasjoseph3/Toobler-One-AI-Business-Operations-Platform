import { Link, useLocation } from 'react-router';
import { joinClassNames } from '@toobler-one/ui';

/**
 * A ticket's title as a link to its own page (`/tickets/<id>`). It remembers which view of the list the person came from (the
 * filters and the page) so the page's "Back to tickets" link returns to exactly that view.
 */
export function TicketNameLink({
  ticketId,
  children,
  className,
}: {
  ticketId: string;
  children: string;
  className?: string;
}) {
  const location = useLocation();
  return (
    <Link
      to={`/tickets/${ticketId}`}
      state={{ listSearch: location.search }}
      className={joinClassNames('hover:underline', className)}
    >
      {children}
    </Link>
  );
}
