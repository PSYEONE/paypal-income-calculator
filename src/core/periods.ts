import { addDays, toIso } from './dates';

// Totals are shown for "periods": either every year starting on a fixed day
// (a UK tax year starts on 6 April, a calendar year on 1 January), or one
// stretch of dates the person picks.

/** The day of the year a yearly period starts on. */
export interface YearStart {
  month: number;
  day: number;
}

/** How to split dates into the blocks that totals are shown for. */
export type PeriodRule = { kind: 'yearly'; start: YearStart } | { kind: 'range'; start: string; end: string };

export interface Period {
  /** Stable id: the starting year for yearly periods, "range" for picked dates. */
  key: string;
  /** "2024-25", "2024", or "Your dates". */
  label: string;
  /** First and last day, "YYYY-MM-DD". */
  start: string;
  end: string;
}

/** The year a yearly period starts in. With a 6 April start: 5 April 2025 -> 2024, 6 April 2025 -> 2025. */
export function yearOf(iso: string, start: YearStart): number {
  const [year, month, day] = iso.split('-').map(Number);
  const onOrAfterStart = month > start.month || (month === start.month && day >= start.day);
  return onOrAfterStart ? year : year - 1;
}

export function yearRange(startYear: number, start: YearStart): { start: string; end: string } {
  return {
    start: toIso(startYear, start.month, start.day),
    end: addDays(toIso(startYear + 1, start.month, start.day), -1),
  };
}

/** "2024-25", or just "2024" for a year that starts on 1 January. */
export function yearLabel(startYear: number, start: YearStart): string {
  if (start.month === 1 && start.day === 1) return String(startYear);
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function yearPeriod(startYear: number, start: YearStart): Period {
  return { key: String(startYear), label: yearLabel(startYear, start), ...yearRange(startYear, start) };
}

function rangePeriod(rule: { start: string; end: string }): Period {
  return { key: 'range', label: 'Your dates', start: rule.start, end: rule.end };
}

/** The period a date falls in, or null when it is outside picked dates. */
export function periodOf(date: string, rule: PeriodRule): Period | null {
  if (rule.kind === 'range') return date >= rule.start && date <= rule.end ? rangePeriod(rule) : null;
  return yearPeriod(yearOf(date, rule.start), rule.start);
}

/**
 * Every period that dates from `first` to `last` touch, oldest first. For
 * picked dates that is always the one picked range, even if the dates given
 * miss it, so the caller can say the files do not cover it.
 */
export function periodsTouching(first: string, last: string, rule: PeriodRule): Period[] {
  if (rule.kind === 'range') return [rangePeriod(rule)];
  const periods: Period[] = [];
  for (let year = yearOf(first, rule.start); year <= yearOf(last, rule.start); year++) periods.push(yearPeriod(year, rule.start));
  return periods;
}
