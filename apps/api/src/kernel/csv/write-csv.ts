// Writing a CSV file for a spreadsheet (F12 export). Pure: no database.

/** A table to write: the column names and the rows below them, all as plain texts. */
export interface CsvTable {
  headers: string[];
  rows: string[][];
}

/** The mark that tells Excel the file is UTF-8, so names like "Sörensen" and Malayalam or Hindi text open correctly. */
const UTF8_BYTE_ORDER_MARK = '﻿';

/** A + or - followed by digits and the usual separators only: no letters, no =, no @, no second operator, so nothing a spreadsheet could run. */
const PLAIN_NUMBER_OR_PHONE = /^[+-]\d[\d\s().,]*$/u;

/**
 * Makes a cell safe to open in a spreadsheet. A cell that starts with =, +, - or @ (or a tab or carriage return) would be run as a FORMULA by Excel and
 * Google Sheets, which lets whoever typed it into a contact's name take over a manager's computer. A single quote in front makes it plain text.
 */
export function neutraliseFormula(cell: string): string {
  if (!/^[=+\-@\t\r]/u.test(cell)) return cell;
  // A phone number (+91 98470 12345) or a plain negative number (-5) cannot run anything, and must come out exactly as it is in the system
  return PLAIN_NUMBER_OR_PHONE.test(cell) ? cell : `'${cell}`;
}

/** One cell as CSV text: in quotes when it holds a comma, a quote or a line break (quotes doubled). */
function quoteCell(cell: string): string {
  const safe = neutraliseFormula(cell);
  return /[",\r\n]/u.test(safe) ? `"${safe.replace(/"/gu, '""')}"` : safe;
}

/** The whole table as CSV text: a byte order mark, the header row, then every row, lines ending in \r\n as the CSV standard says. */
export function writeCsv(table: CsvTable): string {
  const lines = [table.headers, ...table.rows].map((row) => row.map(quoteCell).join(','));
  return `${UTF8_BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`;
}
