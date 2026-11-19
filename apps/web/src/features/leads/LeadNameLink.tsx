import { Link, useLocation } from 'react-router';
import type { Lead } from '@toobler-one/shared';
import { joinClassNames } from '@toobler-one/ui';

/**
 * A lead's name as a link to its own page (`/leads/<id>`). It remembers which view of the list the person came from (the filter, the
 * sort, the page, or the board) so the page's "Back to leads" link returns to exactly that view.
 */
export function LeadNameLink({ lead, children, className }: { lead: Lead; children: string; className?: string }) {
  const location = useLocation();
  return (
    <Link
      to={`/leads/${lead.id}`}
      state={{ listSearch: location.search }}
      className={joinClassNames('hover:underline', className)}
    >
      {children}
    </Link>
  );
}
