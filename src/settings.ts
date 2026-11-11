// Country rules live here and nowhere else.

import type { RateTable } from './core/officialRates';
import hmrcMonthly from './data/hmrc-monthly-rates.json';

export type DateOrder = 'DMY' | 'MDY' | 'YMD';

export interface CountrySettings {
  code: string;
  name: string;
  /** Currency the tax return is filled in. */
  homeCurrency: string;
  /** First day of the tax year. */
  taxYearStart: { month: number; day: number };
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
  defaultDateOrder: 'DMY',
  locale: 'en-GB',
  officialRates: { name: 'HMRC', from: hmrcMonthly.from, to: hmrcMonthly.to, rates: hmrcMonthly.rates },
};

export const settings: CountrySettings = UK;
