import type { CountrySettings, DateOrder } from '../settings';

// Dates are plain "YYYY-MM-DD" text, which sorts and compares correctly.

function splitDate(text: string): [string, string, string] | null {
  const match = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})$/.exec(text.trim());
  return match ? [match[1], match[2], match[3]] : null;
}

export interface DateOrderResult {
  order: DateOrder;
  /** True when nothing in the file settled it and the country default was used. */
  guessed: boolean;
}

/**
 * Works out whether a file writes day or month first by looking at every date.
 * Throws if the file contradicts itself.
 */
export function detectDateOrder(samples: string[], fallback: DateOrder): DateOrderResult {
  let yearFirst = 0;
  let firstOver12 = false;
  let secondOver12 = false;
  let seen = 0;
  for (const sample of samples) {
    const parts = splitDate(sample);
    if (!parts) continue;
    seen++;
    if (parts[0].length === 4) {
      yearFirst++;
      continue;
    }
    if (Number(parts[0]) > 12) firstOver12 = true;
    if (Number(parts[1]) > 12) secondOver12 = true;
  }
  if (seen > 0 && yearFirst === seen) return { order: 'YMD', guessed: false };
  if (yearFirst > 0 || (firstOver12 && secondOver12)) {
    throw new Error('The dates in this file are written in more than one format.');
  }
  if (firstOver12) return { order: 'DMY', guessed: false };
  if (secondOver12) return { order: 'MDY', guessed: false };
  return { order: fallback, guessed: true };
}

/** Returns "YYYY-MM-DD", or null if the text is not a real date in that order. */
export function parseDate(text: string, order: DateOrder): string | null {
  const parts = splitDate(text);
  if (!parts) return null;
  const [a, b, c] = parts.map(Number);
  const [year, month, day] = order === 'YMD' ? [a, b, c] : order === 'DMY' ? [c, b, a] : [c, a, b];
  if (year < 1000 || month < 1 || month > 12 || day < 1) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return toIso(year, month, day);
}

function toIso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** The year the tax year starts in. 5 April 2025 -> 2024, 6 April 2025 -> 2025. */
export function taxYearOf(iso: string, s: CountrySettings): number {
  const [year, month, day] = iso.split('-').map(Number);
  const { month: startMonth, day: startDay } = s.taxYearStart;
  const onOrAfterStart = month > startMonth || (month === startMonth && day >= startDay);
  return onOrAfterStart ? year : year - 1;
}

export function taxYearRange(startYear: number, s: CountrySettings): { start: string; end: string } {
  const start = toIso(startYear, s.taxYearStart.month, s.taxYearStart.day);
  const end = addDays(toIso(startYear + 1, s.taxYearStart.month, s.taxYearStart.day), -1);
  return { start, end };
}

/** "2024-25", or just "2024" where the tax year is the calendar year. */
export function taxYearLabel(startYear: number, s: CountrySettings): string {
  if (s.taxYearStart.month === 1 && s.taxYearStart.day === 1) return String(startYear);
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** "2024-04" -> "Apr 2024", for display. */
export function formatMonth(month: string, locale: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, m - 1, 1)));
}

/** "6 Apr 2024" style, for display. */
export function formatDate(iso: string, locale: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
