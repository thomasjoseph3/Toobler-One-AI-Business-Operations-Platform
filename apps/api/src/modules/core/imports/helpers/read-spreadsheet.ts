import { parse } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';
import { MAX_IMPORT_CELL_LENGTH, MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from '@toobler-one/shared';
import { ApiError } from '../../../../kernel/errors';

// Reading an uploaded spreadsheet (F12): a CSV or an Excel .xlsx file becomes the names of its columns and its rows as plain texts. Everything about the
// file that could go wrong is turned into a clear 400 for the person (not a spreadsheet, empty, too many rows or columns), never an internal error.

/** A spreadsheet as the import needs it: the column names, and every row below them as a list of texts. */
export interface ReadSpreadsheet {
  headers: string[];
  rows: string[][];
}

/** A cell of an Excel sheet as the reader gives it. */
type SheetCell = string | number | boolean | Date | null | undefined;

/** The cell as plain text: numbers without a trailing ".0", dates as 2026-11-20, yes/no for booleans, everything cut to the longest text kept. */
function cellToText(cell: SheetCell): string {
  if (cell === null || cell === undefined) return '';
  let text: string;
  if (cell instanceof Date) text = Number.isNaN(cell.getTime()) ? '' : cell.toISOString().slice(0, 10);
  else if (typeof cell === 'number') text = Number.isInteger(cell) ? cell.toFixed(0) : String(cell);
  else if (typeof cell === 'boolean') text = cell ? 'yes' : 'no';
  else text = cell;
  return text.trim().slice(0, MAX_IMPORT_CELL_LENGTH);
}

/** True for the bytes a .xlsx file starts with (it is a zip file: "PK"). */
function looksLikeExcel(file: Buffer): boolean {
  return file.length > 4 && file[0] === 0x50 && file[1] === 0x4b;
}

/** The separator a CSV uses: comma, semicolon or tab, whichever the first line has most of (Excel in some countries writes semicolons). */
function guessDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/u, 1)[0] ?? '';
  const counts: Array<[string, number]> = [',', ';', '\t'].map((delimiter) => [
    delimiter,
    firstLine.split(delimiter).length - 1,
  ]);
  counts.sort((first, second) => second[1] - first[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ',';
}

/** Names every column: the header text, or "Column 3" when the header cell is blank. */
function nameHeaders(cells: readonly string[]): string[] {
  return cells.map((cell, index) => (cell === '' ? `Column ${index + 1}` : cell.slice(0, 80)));
}

/** Checks the size of what was read and cuts every row to the header's width. */
function finish(table: string[][]): ReadSpreadsheet {
  const [headerCells, ...rows] = table;
  if (!headerCells || headerCells.every((cell) => cell === '')) {
    throw new ApiError(400, 'EMPTY_FILE', 'The file has no rows. The first row must have the column names.');
  }
  if (headerCells.length > MAX_IMPORT_COLUMNS) {
    throw new ApiError(400, 'TOO_MANY_COLUMNS', `The file has more than ${MAX_IMPORT_COLUMNS} columns.`);
  }
  // Empty rows at the very end (a spreadsheet often has hundreds) are not rows
  while (rows.length > 0 && rows[rows.length - 1]!.every((cell) => cell === '')) rows.pop();
  if (rows.length === 0) throw new ApiError(400, 'EMPTY_FILE', 'The file has column names but no rows below them.');
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ApiError(
      413,
      'TOO_MANY_ROWS',
      `The file has more than ${MAX_IMPORT_ROWS.toLocaleString('en')} rows. Split it into smaller files.`,
    );
  }
  const width = headerCells.length;
  return {
    headers: nameHeaders(headerCells),
    rows: rows.map((row) => Array.from({ length: width }, (_, column) => row[column] ?? '')),
  };
}

/**
 * Reads an uploaded file as a spreadsheet. An Excel file (.xlsx) is read from its first sheet; anything else is read as a CSV (UTF-8, with or without a byte
 * order mark, comma, semicolon or tab separated). 400 INVALID_FILE when it is neither; 400 EMPTY_FILE, 400 TOO_MANY_COLUMNS and 413 TOO_MANY_ROWS for the limits.
 */
export async function readSpreadsheet(file: Buffer): Promise<ReadSpreadsheet> {
  if (file.length === 0) throw new ApiError(400, 'EMPTY_FILE', 'The file is empty.');
  if (looksLikeExcel(file)) {
    let table: string[][];
    try {
      const sheet = await readSheet(file);
      table = sheet.map((row) => row.map((cell) => cellToText(cell as SheetCell)));
    } catch {
      throw new ApiError(
        400,
        'INVALID_FILE',
        'That Excel file could not be read. Save it again as .xlsx or as a CSV file.',
      );
    }
    return finish(table);
  }
  // Text files never contain a zero byte; one means this is some other kind of file
  if (file.includes(0)) throw new ApiError(400, 'INVALID_FILE', 'That file is not a CSV or an Excel (.xlsx) file.');
  const text = file.toString('utf8');
  try {
    const table = parse(text, {
      bom: true,
      delimiter: guessDelimiter(text),
      relax_column_count: true,
      skip_empty_lines: true,
      relax_quotes: true,
    }) as string[][];
    return finish(table.map((row) => row.map((cell) => cellToText(cell))));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_FILE', 'That file could not be read as a CSV. Check the quotes and separators.');
  }
}
