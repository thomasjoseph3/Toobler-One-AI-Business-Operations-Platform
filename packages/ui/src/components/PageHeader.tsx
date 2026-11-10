import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Buttons for the page, shown on the right (below the title on a phone). */
  actions?: ReactNode;
}

/** The title block at the top of every page: the one h1, a short description and the page's actions. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl-page-title text-text-primary">{title}</h1>
        {description ? <p className="text-sm-body mt-1 text-text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
