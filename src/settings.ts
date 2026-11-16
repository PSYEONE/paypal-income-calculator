// Country rules live here and nowhere else.

import type { RateTable } from './core/officialRates';
import type { YearStart } from './core/periods';
import type { ReportOptions } from './core/summary';
import hmrcMonthly from './data/hmrc-monthly-rates.json';

export type DateOrder = 'DMY' | 'MDY' | 'YMD';

export interface CountrySettings {
  code: string;
  name: string;
  /** Currency the tax return is filled in. */
  homeCurrency: string;
  /** First day of the tax year. */
  taxYearStart: YearStart;
  /** What people call it, e.g. "UK tax year". */
  taxYearName: string;
  /** Used only when a file's dates could be read either way round. */
  defaultDateOrder: DateOrder;
  /** For showing dates and money. */
  locale: string;
  /** The tax authority's published monthly exchange rates. */
  officialRates: RateTable;
}

export const UK: CountrySettings = {
  code: 'UK',
  name: 'United Kingdom',
  homeCurrency: 'GBP',
  taxYearStart: { month: 4, day: 6 },
  taxYearName: 'UK tax year',
  defaultDateOrder: 'DMY',
  locale: 'en-GB',
  officialRates: { name: 'HMRC', base: 'GBP', from: hmrcMonthly.from, to: hmrcMonthly.to, rates: hmrcMonthly.rates },
};

export const settings: CountrySettings = UK;

/** A country's usual report: its own tax years, in its own currency. */
export function defaultReport(s: CountrySettings): ReportOptions {
  return { homeCurrency: s.homeCurrency, period: { kind: 'yearly', start: s.taxYearStart }, officialRates: s.officialRates };
}
