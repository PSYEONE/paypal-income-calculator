import type { CountrySettings } from '../settings';
import { addDays, parseDate, taxYearLabel, taxYearOf, taxYearRange } from './dates';
import type { Txn } from './types';

export interface DateRange {
  start: string;
  end: string;
}

export interface FileRange extends DateRange {
  /**
   * 'filename': PayPal wrote the export's start and end dates into the file name.
   * 'rows': we only know the first and last transaction, so the true range may be wider.
   */
  source: 'filename' | 'rows';
}

/** The dates one export covers, or null if it has no transactions and no dates in its name. */
export function fileRange(fileName: string, txns: Txn[]): FileRange | null {
  let first: string | null = null;
  let last: string | null = null;
  for (const { date } of txns) {
    if (first === null || date < first) first = date;
    if (last === null || date > last) last = date;
  }

  // e.g. ABC123-CSR-20240131000000-20260727115959-20260727054226.csv
  const match = /(\d{4})(\d{2})(\d{2})\d{6}-(\d{4})(\d{2})(\d{2})\d{6}/.exec(fileName);
  if (match) {
    const start = parseDate(`${match[1]}-${match[2]}-${match[3]}`, 'YMD');
    const end = parseDate(`${match[4]}-${match[5]}-${match[6]}`, 'YMD');
    // Only trust the name if the transactions actually sit inside it.
    const fits = first === null || (start !== null && end !== null && start <= first && last! <= end);
    if (start && end && start <= end && fits) return { start, end, source: 'filename' };
  }
  return first && last ? { start: first, end: last, source: 'rows' } : null;
}

export interface YearCoverage {
  taxYear: number;
  label: string;
  complete: boolean;
  /** Parts of the tax year no file covers. */
  gaps: DateRange[];
}

export interface Coverage {
  years: YearCoverage[];
  /** True if any range came from first and last transactions rather than a file name. */
  approximate: boolean;
}

/** For every tax year the files touch, says whether all of it is covered. */
export function checkCoverage(ranges: FileRange[], s: CountrySettings): Coverage {
  if (ranges.length === 0) return { years: [], approximate: false };

  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  const joined: DateRange[] = [];
  for (const range of sorted) {
    const prev = joined[joined.length - 1];
    if (prev && range.start <= addDays(prev.end, 1)) {
      if (range.end > prev.end) prev.end = range.end;
    } else {
      joined.push({ start: range.start, end: range.end });
    }
  }

  const years: YearCoverage[] = [];
  const firstYear = taxYearOf(joined[0].start, s);
  const lastYear = taxYearOf(joined[joined.length - 1].end, s);
  for (let taxYear = firstYear; taxYear <= lastYear; taxYear++) {
    const year = taxYearRange(taxYear, s);
    const gaps: DateRange[] = [];
    let cursor = year.start;
    for (const range of joined) {
      if (range.end < cursor || range.start > year.end) continue;
      if (range.start > cursor) gaps.push({ start: cursor, end: addDays(range.start, -1) });
      cursor = addDays(range.end, 1);
    }
    if (cursor <= year.end) gaps.push({ start: cursor, end: year.end });
    years.push({ taxYear, label: taxYearLabel(taxYear, s), complete: gaps.length === 0, gaps });
  }
  return { years, approximate: ranges.some((r) => r.source === 'rows') };
}
