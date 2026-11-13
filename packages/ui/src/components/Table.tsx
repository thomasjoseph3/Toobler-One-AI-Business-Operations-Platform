import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { joinClassNames } from '../join-class-names';

/** The table of a list screen (Figma "Table"): scrolls sideways inside its box when the screen is too narrow, never the whole page. */
export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={joinClassNames('w-full border-collapse text-left', className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

/** The header block of a table: a quiet background so the data rows stand out. */
export function TableHead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={joinClassNames('bg-surface-subtle', className)} {...rest} />;
}

/** The data rows of a table. */
export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** A row the person has ticked: a selected background as well as the tick, never colour alone. */
  isSelected?: boolean;
}

/** One row, 48 px high with a subtle line above it; it shows the hover and selected backgrounds. */
export function TableRow({ isSelected = false, className, ...rest }: TableRowProps) {
  return (
    <tr
      className={joinClassNames(
        'group h-12 border-t border-border-subtle first:border-t-0',
        isSelected ? 'bg-selected' : 'hover:bg-hover',
        className,
      )}
      {...rest}
    />
  );
}

/** A column heading: 13 px medium, with 12 px of padding on each side. */
export function TableHeaderCell({ className, scope = 'col', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={joinClassNames(
        'text-body-sm-medium px-3 py-3 align-middle text-text-primary whitespace-nowrap',
        className,
      )}
      {...rest}
    />
  );
}

/** One cell of data: 13 px text in the secondary colour (a cell that names the row can pass `text-text-primary`). */
export function TableCell({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={joinClassNames('text-body-sm px-3 py-2 align-middle text-text-secondary', className)} {...rest} />
  );
}
