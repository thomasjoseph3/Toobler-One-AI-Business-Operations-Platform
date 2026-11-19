import { Link } from 'react-router';
import { joinClassNames } from '@toobler-one/ui';

/** A company's name as a link to its own page (`/companies/<id>`). */
export function CompanyNameLink({
  companyId,
  children,
  className,
}: {
  companyId: string;
  children: string;
  className?: string;
}) {
  return (
    <Link to={`/companies/${companyId}`} className={joinClassNames('hover:underline', className)}>
      {children}
    </Link>
  );
}
