import { addDays, parseDate } from './dates';
import { periodsTouching, type Period, type PeriodRule } from './periods';
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

/**
 * Why part of a period is not covered:
 * 'before'  - it is earlier than anything in the files (often just when the person started)
 * 'after'   - it is later than anything in the files (often just when they exported)
 * 'between' - it is a hole between two files, which usually means a file is missing
 */
export type GapKind = 'before' | 'after' | 'between';

export interface Gap extends DateRange {
  kind: GapKind;
}

export interface PeriodCoverage extends Period {
  complete: boolean;
  /** Parts of the period no file covers. */
  gaps: Gap[];
  /** True when no file covers any of the period. */
  untouched: boolean;
  /** True when the period had not ended on the day given as "today". */
  inProgress: boolean;
}

export interface Coverage {
  periods: PeriodCoverage[];
  /** True if any range came from first and last transactions rather than a file name. */
  approximate: boolean;
}

/**
 * For every period the files touch (or the picked dates, for a range), says
 * whether all of it is covered. `today` ("YYYY-MM-DD") is used to tell a
 * period that is still running from one that is over.
 */
export function checkCoverage(ranges: FileRange[], rule: PeriodRule, today?: string): Coverage {
  if (ranges.length === 0) return { periods: [], approximate: false };

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

  const periods: PeriodCoverage[] = [];
  const firstDay = joined[0].start;
  const lastDay = joined[joined.length - 1].end;
  for (const year of periodsTouching(firstDay, lastDay, rule)) {
    const gaps: Gap[] = [];
    const addGap = (start: string, end: string) =>
      gaps.push({ start, end, kind: end < firstDay ? 'before' : start > lastDay ? 'after' : 'between' });
    let cursor = year.start;
    for (const range of joined) {
      if (range.end < cursor || range.start > year.end) continue;
      if (range.start > cursor) addGap(cursor, addDays(range.start, -1));
      cursor = addDays(range.end, 1);
    }
    if (cursor <= year.end) addGap(cursor, year.end);
    const untouched = gaps.length === 1 && gaps[0].start === year.start && gaps[0].end === year.end;
    periods.push({ ...year, complete: gaps.length === 0, gaps, untouched, inProgress: today !== undefined && today <= year.end });
  }
  return { periods, approximate: ranges.some((r) => r.source === 'rows') };
}
