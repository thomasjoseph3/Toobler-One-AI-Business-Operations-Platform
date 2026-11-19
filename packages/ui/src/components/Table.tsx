import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { joinClassNames } from '../join-class-names';

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /**
   * Classes for the box the table scrolls in. By default it scrolls sideways when the screen is too narrow. A screen that gives
   * the box a height (for example `min-h-0 flex-1 overflow-auto`) makes the rows scroll inside it while the heading row stays in view.
   */
  containerClassName?: string;
}

/** The table of a list screen (Figma "Table"): scrolls inside its own box when the screen is too small, never the whole page. */
export function Table({ className, containerClassName = 'overflow-x-auto', children, ...rest }: TableProps) {
  return (
    // `relative` keeps the invisible screen-reader labels inside the table's own box, so they cannot stretch the page
    <div className={joinClassNames('relative', containerClassName)}>
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
        'text-body-sm-medium sticky top-0 z-10 bg-surface-subtle px-3 py-3 align-middle text-text-primary whitespace-nowrap',
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
